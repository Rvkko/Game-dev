/* ============================================================
   Pilot Fuel Tanker Training Prototype — shell application
   Educational prototype only. Not official Pilot/DOT training.
   ============================================================ */
(function () {
'use strict';
var T = window.TRAINING;
if (!T) { document.body.innerHTML = '<p style="padding:30px">Training content failed to load (training-data.js).</p>'; return; }

/* ---------- helpers ---------- */
var $ = function (s, r) { return (r || document).querySelector(s); };
var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
var reducedMotion = false;
try { reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
function partLabel(id) { return T.PART_LABELS[id] || id; }

/* ---------- persistent progress ---------- */
var PKEY = 'pilotTrainingProgress', SKEY = 'pilotTrainingSME';
function load(key, fb) { try { return JSON.parse(localStorage.getItem(key)) || fb; } catch (e) { return fb; } }
function save(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {} }
function freshProgress() { return { modules: {}, quiz: { attempts: 0, best: 0, last: 0, passed: false }, name: '', lastRoute: '' }; }
var P = load(PKEY, null);
if (!P || typeof P !== 'object' || Array.isArray(P)) P = freshProgress();
if (!P.modules || typeof P.modules !== 'object' || Array.isArray(P.modules)) P.modules = {};
if (!P.quiz || typeof P.quiz !== 'object' || Array.isArray(P.quiz)) P.quiz = freshProgress().quiz;
['attempts', 'best', 'last'].forEach(function (k) { if (typeof P.quiz[k] !== 'number' || !isFinite(P.quiz[k])) P.quiz[k] = 0; });
P.quiz.passed = !!P.quiz.passed;
if (typeof P.name !== 'string') P.name = '';
if (typeof P.lastRoute !== 'string') P.lastRoute = '';
function modState(id) {
  var ms = P.modules[id];
  if (!ms || typeof ms !== 'object' || Array.isArray(ms)) ms = P.modules[id] = { visited: [], checkpoint: false, completed: false };
  if (!Array.isArray(ms.visited)) ms.visited = [];
  ms.checkpoint = !!ms.checkpoint; ms.completed = !!ms.completed;
  return ms;
}
function persist() { save(PKEY, P); refreshProgressUI(); empireSave(); }
function completedCount() { var n = 0; T.MODULES.forEach(function (m) { if (P.modules[m.id] && P.modules[m.id].completed) n++; }); return n; }
function coursePct() { return Math.round(completedCount() / T.MODULES.length * 100); }
function hasCourseActivity() {
  if (P.quiz.attempts > 0) return true;
  return T.MODULES.some(function (m) {
    var ms = P.modules[m.id];
    return !!(ms && (ms.completed || ms.checkpoint || (Array.isArray(ms.visited) && ms.visited.length)));
  });
}
function resumableRoute() {
  var route = P.lastRoute || '';
  if (/^\/module\/[^/]+$/.test(route)) {
    var id = route.split('/')[2];
    if (T.MODULES.some(function (m) { return m.id === id; })) return route;
  }
  if (['/dashboard', '/explorer', '/assessment', '/summary'].indexOf(route) >= 0) return route;
  return '/dashboard';
}

/* ---------- toast ---------- */
var toastEl = $('#toast'), toastTimer;
function toast(msg, ms) { toastEl.textContent = msg; toastEl.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, ms || 2600); }

/* ---------- disclaimer wiring ---------- */
$('#discLanding').textContent = T.DISCLAIMER;
$('#discFooter').textContent = T.DISCLAIMER;
$('#discAbout').textContent = T.DISCLAIMER;
$('#verTag').textContent = T.META.version;
$('#passNeed').textContent = Math.round(T.META.passThreshold * 100) + '%';

/* =====================================================================
   3D VIEWER (persistent iframe, portal-positioned over the active slot)
   ===================================================================== */
var stageHost = $('#stageHost'), viewer = $('#viewer'), viewerFallback = $('#viewerFallback');
var viewerBase = 'fuel-tanker-explorer.html';
var viewerCreated = false, viewerReady = false, pendingActions = null, readyTimer = null;
var activeSlot = null;
window.__pilotAssetStatus = { loaded: false, attached: false, physics: false, error: '' };

function mountPilotBlenderKit() {
  try {
    var w = viewer.contentWindow, t = w && w.__tanker;
    if (!t || !w.THREE) { window.__pilotAssetStatus.error = 'tanker viewer unavailable'; return; }
    var loadKit = function () {
      var Loader = w.THREE && w.THREE.GLTFLoader;
      if (!Loader) throw new Error('tanker GLTF loader unavailable');
      var kitUrl = new URL('../../assets/blender-kits/pilot-fuel-tanker-training/pilot-fuel-tanker-training-kit.glb', location.href).href;
      var physicsUrl = new URL('../../assets/blender-kits/pilot-fuel-tanker-training/physics.json', location.href).href;
      return Promise.all([
        fetch(physicsUrl).then(function (r) { return r.ok ? r.json() : null; }),
        new Promise(function (resolve, reject) { new Loader().load(kitUrl, resolve, undefined, reject); })
      ]);
    };
    var loaderReady = w.THREE.GLTFLoader ? Promise.resolve() : new Promise(function (resolve, reject) {
      var script = w.document.createElement('script');
      script.src = new URL('../../vendor/three-r128/GLTFLoader.js', location.href).href;
      script.onload = resolve;
      script.onerror = function () { reject(new Error('could not load tanker GLTF loader')); };
      w.document.head.appendChild(script);
    });
    loaderReady.then(loadKit).then(function (result) {
      var physics = result[0], gltf = result[1];
      var source = gltf.scene.getObjectByName('PROFILE_PLAYER_DETAIL') || gltf.scene.getObjectByName('PLAYER_BODY');
      if (!source) throw new Error('tanker Blender profile missing');
      var detail = source.clone(true); detail.name = 'BLENDER_TANKER_KIT_PREVIEW';
      detail.visible = false; detail.traverse(function (o) { o.castShadow = true; o.receiveShadow = true; });
      t.scene.add(detail);
      t.blenderKit = detail; t.blenderKitPhysics = physics;
      t.showBlenderKit = function (on) { detail.visible = !!on; if (t.rig) t.rig.visible = !on; };
      window.__pilotAssetStatus.loaded = true;
      window.__pilotAssetStatus.physics = !!(physics && physics.playerCollider);
      window.__pilotAssetStatus.attached = true;
      window.__pilotAssetStatus.preview = false;
    }).catch(function (error) { window.__pilotAssetStatus.error = String(error && error.message || error); });
  } catch (error) { window.__pilotAssetStatus.error = String(error && error.message || error); }
}
window.showPilotBlenderKit = function (on) {
  try { if (viewer.contentWindow && viewer.contentWindow.__tanker && viewer.contentWindow.__tanker.showBlenderKit) viewer.contentWindow.__tanker.showBlenderKit(on); } catch (e) {}
};

function ensureViewer(action) {
  if (!viewerCreated) {
    viewerCreated = true;
    readyTimer = setTimeout(function () { if (!viewerReady) { viewerFallback.style.display = 'grid'; } }, 8000);
    if (window.EXPLORER_SRCDOC) {
      // single-file build: run the 3D model inline via srcdoc (no separate file / no server)
      pendingActions = action || 'reset';
      viewer.srcdoc = window.EXPLORER_SRCDOC;
    } else {
      var hash = '#action=' + encodeURIComponent(action || 'reset') + '&chrome=embed' + (reducedMotion ? '&motion=off' : '');
      viewer.src = viewerBase + hash;
    }
  } else if (viewerReady) {
    postAction('reset'); if (action) postAction(action);
  } else {
    pendingActions = action;
  }
}
function postAction(action, arg) {
  if (!action) return;
  try { viewer.contentWindow.postMessage({ source: 'trainer', cmd: 'action', action: action, arg: arg }, '*'); } catch (e) {}
}
function runActions(list) { list.forEach(function (a) { postAction(a); }); }

window.addEventListener('message', function (e) {
  var d = e.data; if (!d || d.source !== 'tanker') return;
  if (d.type === 'ready') {
    viewerReady = true; clearTimeout(readyTimer); viewerFallback.style.display = 'none';
    mountPilotBlenderKit();
    empireFirstTour();
    if (pendingActions) { postAction('reset'); postAction(pendingActions); pendingActions = null; }
  } else if (d.type === 'part') {
    onPartSelected(d.id);
  } else if (d.type === 'back') {
    go('/dashboard');
  }
});

/* portal positioning: overlay the fixed iframe host onto the active slot */
function positionStage() {
  if (!activeSlot) { stageHost.classList.remove('show'); return; }
  var r = activeSlot.getBoundingClientRect();
  stageHost.style.top = r.top + 'px';
  stageHost.style.left = r.left + 'px';
  stageHost.style.width = r.width + 'px';
  stageHost.style.height = r.height + 'px';
  stageHost.classList.add('show');
}
var stagePosScheduled = false;
function schedulePos() { if (stagePosScheduled) return; stagePosScheduled = true; requestAnimationFrame(function () { stagePosScheduled = false; positionStage(); }); }
window.addEventListener('resize', schedulePos);
window.addEventListener('scroll', schedulePos, true);
function mountStage(slot, action) { activeSlot = slot; ensureViewer(action); positionStage(); }
function unmountStage() { activeSlot = null; stageHost.classList.remove('show'); }

/* global viewer-action buttons (data-vaction) */
document.addEventListener('click', function (e) {
  var b = e.target.closest('[data-vaction]');
  if (b) { var a = b.getAttribute('data-vaction'); if (viewerReady) postAction(a); else ensureViewer(a); }
});

/* =====================================================================
   ROUTER
   ===================================================================== */
var VIEWS = ['landing', 'dashboard', 'module', 'explorer', 'assessment', 'summary', 'about', 'help', 'sme', 'showcase'];
function parseHash() {
  var h = (location.hash || '').replace(/^#/, '');
  if (!h || h === '/') return { view: 'landing', arg: '' };
  var parts = h.replace(/^\//, '').split('/');
  var v = parts[0];
  if (v === 'module') return { view: 'module', arg: parts[1] || '' };
  if (VIEWS.indexOf(v) >= 0) return { view: v, arg: '' };
  return { view: 'landing', arg: '' };
}
function go(route) { if (location.hash === '#' + route) { render(); } else { location.hash = route; } }
window.addEventListener('hashchange', render);

function render() {
  var r = parseHash();
  stopShowcase();
  VIEWS.forEach(function (v) { $('#view-' + v).classList.toggle('active', v === r.view); });
  $$('#nav a').forEach(function (a) {
    var nav = a.getAttribute('data-nav') || '';
    var active = ('/' + r.view) === nav || (r.view === 'module' && nav === '/dashboard');
    a.classList.toggle('active', active);
    if (active) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  closeNav();
  window.scrollTo(0, 0);
  if (['dashboard', 'module', 'explorer', 'assessment', 'summary'].indexOf(r.view) >= 0) {
    P.lastRoute = '/' + r.view + (r.view === 'module' && r.arg ? '/' + r.arg : '');
    save(PKEY, P);
  }

  if (r.view === 'module') { mountModule(r.arg); }
  else if (r.view === 'explorer') { renderExplorer(); }
  else if (r.view === 'showcase') { renderShowcase(); }
  else { unmountStage(); }

  if (r.view === 'dashboard') renderDashboard();
  else if (r.view === 'assessment') renderAssessment();
  else if (r.view === 'summary') renderSummary();
  else if (r.view === 'sme') renderSME();
  else if (r.view === 'landing') renderLanding();
  refreshProgressUI();
  schedulePos();
}

/* data-nav delegation */
document.addEventListener('click', function (e) {
  var b = e.target.closest('[data-nav]');
  if (b) { e.preventDefault(); go(b.getAttribute('data-nav')); }
});

/* =====================================================================
   HEADER / NAV
   ===================================================================== */
var nav = $('#nav'), navBackdrop = $('#navBackdrop'), hamburger = $('#hamburger');
function openNav() { nav.classList.add('open'); navBackdrop.classList.add('open'); hamburger.setAttribute('aria-expanded', 'true'); }
function closeNav() { nav.classList.remove('open'); navBackdrop.classList.remove('open'); hamburger.setAttribute('aria-expanded', 'false'); }
hamburger.addEventListener('click', function () { nav.classList.contains('open') ? closeNav() : openNav(); });
navBackdrop.addEventListener('click', closeNav);
document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && nav.classList.contains('open')) { closeNav(); hamburger.focus(); } });

function refreshProgressUI() {
  var pct = coursePct();
  $('#hdrPct').textContent = pct + '%';
  $('#hdrBar').style.width = pct + '%';
  if ($('#dashBar')) { $('#dashBar').style.width = pct + '%'; $('#dashPctBig').textContent = pct + '%'; }
  if ($('#chipModules')) $('#chipModules').textContent = completedCount() + ' / ' + T.MODULES.length + ' modules';
  if ($('#chipQuiz')) {
    var q = P.quiz;
    $('#chipQuiz').textContent = q.attempts ? ('Assessment: ' + q.best + '% best' + (q.passed ? ' ✓' : '')) : 'Assessment: not started';
    $('#chipQuiz').className = 'chip' + (q.passed ? ' ok' : (q.attempts ? ' warn' : ''));
  }
}

/* =====================================================================
   LANDING
   ===================================================================== */
function renderLanding() {
  var resume = $('#btnResume');
  var started = hasCourseActivity();
  resume.setAttribute('data-nav', resumableRoute());
  resume.style.display = started ? 'inline-flex' : 'none';
}

/* =====================================================================
   DASHBOARD
   ===================================================================== */
function renderDashboard() {
  var grid = $('#moduleGrid'); grid.innerHTML = '';
  T.MODULES.forEach(function (m) {
    var ms = P.modules[m.id] || {};
    var done = !!ms.completed;
    var started = !done && ((ms.visited && ms.visited.length) || ms.checkpoint);
    var statusLabel = done ? 'Completed' : (started ? 'In progress' : 'Not started');
    var statusCls = done ? ' ok' : (started ? ' warn' : '');
    var card = el('div', 'mod-card card' + (done ? ' done' : ''));
    card.setAttribute('role', 'button'); card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', 'Module ' + m.number + ': ' + m.title + ' — ' + statusLabel);
    card.innerHTML =
      '<div class="top"><span class="mod-num">' + (done ? '✓' : m.number) + '</span>' +
      '<h3>' + esc(m.title) + '</h3></div>' +
      '<div class="obj">' + esc(m.objective) + '</div>' +
      '<div class="foot"><span class="chip' + statusCls + '">' + statusLabel + '</span>' +
      '<span class="muted" style="font-size:12px">⏱ ' + esc(m.duration) + '</span></div>';
    var open = function () { go('/module/' + m.id); };
    card.addEventListener('click', open);
    card.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    grid.appendChild(card);
  });
  $('#assessSummary').textContent = T.QUIZ.length + ' questions covering the whole course. Pass mark ' + Math.round(T.META.passThreshold * 100) + '%.';
}
$('#btnResetProgress').addEventListener('click', function () {
  if (!confirm('Reset all training progress and assessment scores on this device?')) return;
  var keepName = P.name || '';
  P = freshProgress(); P.name = keepName;
  persist(); renderDashboard(); toast('Progress reset');
});

/* =====================================================================
   MODULE
   ===================================================================== */
var currentModule = null;
function mountModule(id) {
  var m = null; T.MODULES.forEach(function (x) { if (x.id === id) m = x; });
  if (!m) { go('/dashboard'); return; }
  currentModule = m;
  var ms = modState(m.id);
  $('#modKicker').textContent = 'Module ' + m.number + ' of ' + T.MODULES.length + ' · ⏱ ' + m.duration;
  $('#modTitle').textContent = m.title;

  var body = $('#modBody');
  var html = '<div class="objective"><b>Objective:</b> ' + esc(m.objective) + '</div>';
  html += '<div class="teach">';
  m.sections.forEach(function (s) { html += '<h4>' + esc(s.heading) + '</h4><p>' + esc(s.body) + '</p>'; });
  html += '</div>';

  /* task */
  html += '<div class="task-box"><div class="th">🎯 Task</div><div class="tb">';
  html += '<p style="font-size:13.5px">' + esc(m.task.instruction) + '</p>';
  html += '<div class="part-checks" id="partChecks"></div>';
  html += '<p class="muted" style="font-size:12px;margin-top:8px">Tap a part in the 3D model, or a chip above, to check it off.</p>';
  html += '</div></div>';

  if (m.safetyNote) html += '<div class="safety-note">⚠️ ' + esc(m.safetyNote) + '</div>';

  /* checkpoint */
  html += '<div class="qcard" id="checkpoint"></div>';

  /* completion status */
  html += '<div class="mod-complete" id="modStatus" style="margin-top:14px"></div>';

  /* nav */
  html += '<div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap">';
  var prev = m.number > 1 ? T.MODULES[m.number - 2].id : null;
  var next = m.number < T.MODULES.length ? T.MODULES[m.number].id : null;
  if (prev) html += '<button class="btn btn-sm" data-nav="/module/' + prev + '">‹ Previous</button>';
  html += '<button class="btn btn-sm btn-ghost" data-nav="/dashboard">All modules</button>';
  if (next) html += '<button class="btn btn-sm btn-primary" id="btnNextMod" data-nav="/module/' + next + '">Next module ›</button>';
  else html += '<button class="btn btn-sm btn-primary" data-nav="/assessment">Go to assessment ›</button>';
  html += '</div>';

  body.innerHTML = html;
  renderPartChecks(m, ms);
  renderCheckpoint(m, ms);
  evaluateCompletion(m);

  mountStage($('#slotModule'), m.explorerAction);
}
function partsVisitedCount(m, ms) {
  var n = 0; m.task.targetParts.forEach(function (p) { if (ms.visited.indexOf(p) >= 0) n++; }); return n;
}
function evaluateCompletion(m) {
  var ms = modState(m.id);
  var total = m.task.targetParts.length;
  var visited = partsVisitedCount(m, ms);
  var allVisited = visited >= total;
  if (ms.checkpoint && allVisited && !ms.completed) {
    ms.completed = true; persist();
    empireCheckAchievements();
    toast('Module ' + m.number + ' complete ✓');
    var nb = $('#btnNextMod'); if (nb) nb.focus();
  }
  updateModStatus(m, ms, visited, total);
}
function updateModStatus(m, ms, visited, total) {
  var box = $('#modStatus'); if (!box) return;
  if (ms.completed) {
    box.className = 'mod-complete done';
    box.innerHTML = '✓ <b>Module complete.</b> You explored all ' + total + ' task parts and passed the checkpoint.';
    return;
  }
  var partsTxt = (visited >= total ? '✓ all ' + total + ' parts explored' : visited + ' of ' + total + ' parts explored');
  var cpTxt = ms.checkpoint ? '✓ checkpoint passed' : 'checkpoint not yet passed';
  box.className = 'mod-complete';
  box.innerHTML = '<b>To complete this module:</b> ' + esc(partsTxt) + ' · ' + esc(cpTxt) + '.';
}
function renderPartChecks(m, ms) {
  var wrap = $('#partChecks'); if (!wrap) return; wrap.innerHTML = '';
  m.task.targetParts.forEach(function (pid) {
    var on = ms.visited.indexOf(pid) >= 0;
    var chip = el('button', 'part-check' + (on ? ' on' : ''));
    chip.innerHTML = '<span class="tick">' + (on ? '✓' : '') + '</span>' + esc(partLabel(pid));
    chip.setAttribute('aria-pressed', on ? 'true' : 'false');
    chip.addEventListener('click', function () { markVisited(pid, true); });
    wrap.appendChild(chip);
  });
}
function markVisited(pid, focus) {
  if (!currentModule) return;
  var ms = modState(currentModule.id);
  if (currentModule.task.targetParts.indexOf(pid) < 0) return;
  var isNew = ms.visited.indexOf(pid) < 0;
  if (isNew) { ms.visited.push(pid); persist(); }
  renderPartChecks(currentModule, ms);
  if (focus && viewerReady) postAction('part', pid);
  var total = currentModule.task.targetParts.length;
  var visited = partsVisitedCount(currentModule, ms);
  if (isNew && visited >= total && !ms.checkpoint) toast('All parts explored — answer the checkpoint to finish', 2200);
  evaluateCompletion(currentModule);
}
function onPartSelected(id) {
  P.partHistory = (P.partHistory || []); P.partHistory.push(id); if (P.partHistory.length > 200) P.partHistory.shift();
  if (currentModule && parseHash().view === 'module') markVisited(id, false);
}
function renderCheckpoint(m, ms) {
  var box = $('#checkpoint'); if (!box) return;
  var c = m.checkpoint;
  var answered = ms.checkpoint;
  var html = '<div class="qq">✔️ Checkpoint: ' + esc(c.question) + '</div><div class="opts" id="cpOpts"></div>';
  html += '<div class="feedback" id="cpFeedback"></div>';
  box.innerHTML = html;
  var opts = $('#cpOpts');
  c.options.forEach(function (opt, i) {
    var b = el('button', 'opt' + (answered && i === c.answerIndex ? ' correct' : ''));
    b.innerHTML = '<span class="mk">' + String.fromCharCode(65 + i) + '</span><span>' + esc(opt) + '</span>';
    if (answered) b.disabled = true;
    b.addEventListener('click', function () { answerCheckpoint(m, i); });
    opts.appendChild(b);
  });
  if (answered) {
    var fb = $('#cpFeedback'); fb.className = 'feedback good show'; fb.textContent = '✓ ' + c.explanation;
  }
}
function answerCheckpoint(m, i) {
  var c = m.checkpoint, ms = modState(m.id);
  var opts = $$('#cpOpts .opt');
  opts.forEach(function (b) { b.disabled = true; });
  var fb = $('#cpFeedback');
  if (i === c.answerIndex) {
    opts[i].classList.add('correct');
    ms.checkpoint = true; persist();
    var allVisited = m.task.targetParts.every(function (p) { return ms.visited.indexOf(p) >= 0; });
    fb.className = 'feedback good show';
    fb.innerHTML = '✓ ' + esc(c.explanation) + (allVisited ? '' : ' <b>Now explore the remaining task parts above to complete the module.</b>');
    evaluateCompletion(m);
  } else {
    opts[i].classList.add('wrong'); opts[c.answerIndex].classList.add('correct');
    fb.className = 'feedback bad show'; fb.innerHTML = 'Not quite. ' + esc(c.explanation) + ' <button class="btn btn-sm" id="cpRetry" style="margin-top:8px">Try again</button>';
    $('#cpRetry').addEventListener('click', function () { renderCheckpoint(m, ms); });
  }
}

/* =====================================================================
   EXPLORER (free)
   ===================================================================== */
function renderExplorer() { mountStage($('#slotExplorer'), 'reset'); }

/* =====================================================================
   ASSESSMENT
   ===================================================================== */
var asState = null;
function renderAssessment() {
  unmountStage();
  asState = { i: 0, answers: [], correct: 0, done: false };
  drawQuestion();
}
function drawQuestion() {
  var mount = $('#assessMount');
  if (asState.i >= T.QUIZ.length) { drawResult(); return; }
  var q = T.QUIZ[asState.i];
  var total = T.QUIZ.length;
  var pctBar = Math.round(asState.i / total * 100);
  var isClick = q.type === 'click';
  var choices = isClick ? q.choices.map(partLabel) : q.choices;
  var typeLabel = q.type === 'click' ? 'Identify the component' : (q.type === 'issue' ? 'Recognize the condition' : 'Multiple choice');
  var html = '<div class="assess-head"><span class="qprogress">Question ' + (asState.i + 1) + ' of ' + total + '</span>' +
    '<span class="chip">' + esc(typeLabel) + '</span></div>' +
    '<div class="qbar"><i style="width:' + pctBar + '%"></i></div>' +
    '<div class="qcard"><div class="qq">' + esc(q.prompt) + '</div><div class="opts" id="asOpts"></div>' +
    '<div class="feedback" id="asFb"></div>' +
    '<div id="asNext" style="margin-top:12px;display:none"><button class="btn btn-primary" id="btnAsNext">' +
    (asState.i === total - 1 ? 'See results ›' : 'Next question ›') + '</button></div></div>';
  mount.innerHTML = html;
  var optsEl = $('#asOpts');
  choices.forEach(function (opt, i) {
    var b = el('button', 'opt');
    b.innerHTML = '<span class="mk">' + String.fromCharCode(65 + i) + '</span><span>' + esc(opt) + '</span>';
    b.addEventListener('click', function () { answerQuestion(q, i, b); });
    optsEl.appendChild(b);
  });
}
function answerQuestion(q, i, btn) {
  var opts = $$('#asOpts .opt'); opts.forEach(function (b) { b.disabled = true; });
  var correctIdx = q.type === 'click' ? q.choices.indexOf(q.targetPartId) : q.answerIndex;
  var ok = i === correctIdx;
  if (ok) asState.correct++;
  asState.answers.push({ id: q.id, ok: ok });
  opts[i].classList.add(ok ? 'correct' : 'wrong');
  if (!ok && opts[correctIdx]) opts[correctIdx].classList.add('correct');
  var fb = $('#asFb'); fb.className = 'feedback ' + (ok ? 'good' : 'bad') + ' show';
  fb.textContent = (ok ? '✓ Correct. ' : '✗ ') + q.explanation;
  $('#asNext').style.display = 'block';
  $('#btnAsNext').addEventListener('click', function () { asState.i++; drawQuestion(); window.scrollTo(0, 0); });
  $('#btnAsNext').focus();
}
function drawResult() {
  var total = T.QUIZ.length, pct = Math.round(asState.correct / total * 100);
  var passed = pct >= Math.round(T.META.passThreshold * 100);
  P.quiz.attempts++; P.quiz.last = pct; if (pct > P.quiz.best) P.quiz.best = pct; if (passed) P.quiz.passed = true;
  persist();
  empireCheckAchievements();
  var mount = $('#assessMount');
  mount.innerHTML =
    '<div class="card pad-lg result-ring">' +
    '<div class="result-score" style="color:' + (passed ? 'var(--ok)' : 'var(--red)') + '">' + pct + '%</div>' +
    '<p style="margin:6px 0 2px;font-weight:700">' + asState.correct + ' of ' + total + ' correct</p>' +
    '<p><span class="chip ' + (passed ? 'ok' : 'red') + '">' + (passed ? '✓ Passed (self-check)' : 'Below ' + Math.round(T.META.passThreshold * 100) + '% — try again') + '</span></p>' +
    '<p class="muted" style="margin-top:10px;font-size:12.5px;max-width:52ch">This is a self-assessment for your own review only. It is not a certification and has no regulatory or employment standing.</p>' +
    '<div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap;justify-content:center">' +
    '<button class="btn btn-primary" id="btnRetake">↺ Retake assessment</button>' +
    '<button class="btn" data-nav="/summary">View summary ›</button>' +
    '<button class="btn btn-ghost" data-nav="/dashboard">Back to dashboard</button>' +
    '</div></div>';
  $('#btnRetake').addEventListener('click', renderAssessment);
  toast(passed ? 'Assessment passed — nice work!' : 'Assessment scored ' + pct + '%');
}

/* =====================================================================
   SUMMARY / CERTIFICATE
   ===================================================================== */
function renderSummary() {
  unmountStage();
  var mount = $('#summaryMount');
  var done = completedCount(), total = T.MODULES.length;
  var allDone = done === total;
  var q = P.quiz;
  var d = new Date();
  var dateStr = d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  mount.innerHTML =
    '<div class="card no-print" style="margin-bottom:16px">' +
    '<label class="fld" for="nameInput">Your name (optional — appears on the summary)</label>' +
    '<input type="text" id="nameInput" placeholder="e.g. Chris Herron" value="' + esc(P.name || '') + '">' +
    '</div>' +
    '<div class="cert" id="certCard">' +
    '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px">' +
    '<div><div class="eyebrow">Pilot · Fuel Tanker Training</div><h2>Familiarization Summary</h2></div>' +
    '<span class="chip warn">Prototype — not a certification</span></div>' +
    '<p style="margin-top:12px">This confirms that</p>' +
    '<div class="name" id="certName">' + esc(P.name || 'Trainee') + '</div>' +
    '<p>has worked through the Pilot Fuel Tanker Training Prototype familiarization course.</p>' +
    '<div class="rows">' +
    '<div><div class="k">Modules completed</div><div class="v">' + done + ' / ' + total + '</div></div>' +
    '<div><div class="k">Best assessment</div><div class="v">' + (q.attempts ? q.best + '%' : '—') + '</div></div>' +
    '<div><div class="k">Date</div><div class="v" style="font-size:16px">' + dateStr + '</div></div>' +
    '</div>' +
    '<p style="font-weight:700;color:' + (allDone && q.passed ? 'var(--ok)' : 'var(--muted)') + '">' +
    (allDone && q.passed ? '✓ All modules complete and assessment passed (self-check).' : 'In progress — complete all modules and pass the assessment to finish.') + '</p>' +
    '<p class="fineprint">' + esc(T.DISCLAIMER) + '</p>' +
    '</div>' +
    '<div class="no-print" style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap">' +
    '<button class="btn btn-primary" id="btnPrint">🖨 Print / Save as PDF</button>' +
    '<button class="btn" id="btnDownload">⬇ Download summary (.txt)</button>' +
    '<button class="btn btn-ghost" data-nav="/dashboard">Back to dashboard</button>' +
    '</div>';
  var ni = $('#nameInput');
  ni.addEventListener('input', function () { P.name = ni.value; save(PKEY, P); $('#certName').textContent = P.name || 'Trainee'; });
  $('#btnPrint').addEventListener('click', function () { window.print(); });
  $('#btnDownload').addEventListener('click', downloadSummary);
}
function downloadSummary() {
  var done = completedCount(), total = T.MODULES.length, q = P.quiz;
  var lines = [];
  lines.push('PILOT FUEL TANKER TRAINING PROTOTYPE — FAMILIARIZATION SUMMARY');
  lines.push('(Educational prototype — not a certification)');
  lines.push('');
  lines.push('Name: ' + (P.name || 'Trainee'));
  lines.push('Date: ' + new Date().toLocaleString());
  lines.push('Content version: ' + T.META.version);
  lines.push('');
  lines.push('Modules completed: ' + done + ' / ' + total);
  T.MODULES.forEach(function (m) {
    var ms = P.modules[m.id] || {};
    lines.push('  [' + (ms.completed ? 'x' : ' ') + '] Module ' + m.number + ': ' + m.title);
  });
  lines.push('');
  lines.push('Assessment: ' + (q.attempts ? (q.best + '% best over ' + q.attempts + ' attempt(s)' + (q.passed ? ' — PASSED (self-check)' : '')) : 'not attempted'));
  lines.push('');
  lines.push(T.DISCLAIMER);
  var blob = new Blob([lines.join('\r\n')], { type: 'text/plain' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'pilot-tanker-training-summary.txt';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
  toast('Summary downloaded');
}

/* =====================================================================
   SME / COMPLIANCE REVIEW
   ===================================================================== */
var SIGNOFFS = [
  ['sme', 'Subject-matter expert (SME) — technical accuracy of all part descriptions'],
  ['safety', 'Safety — alignment with safe-work expectations'],
  ['legal', 'Legal — disclaimers, framing, and intended-use statements'],
  ['hazmat', 'Hazmat trainer — fuel-transfer and cargo-handling awareness content'],
  ['compliance', 'Compliance — positioned as awareness only, no conflict with DOT/FMCSA/PHMSA or company training']
];
function renderSME() {
  unmountStage();
  var S = load(SKEY, { status: T.META.defaultStatus, notes: '', refs: '', reviewer: '', signoffs: {} });
  if (!S.signoffs) S.signoffs = {};
  // normalize legacy boolean sign-offs to record objects
  Object.keys(S.signoffs).forEach(function (k) {
    if (S.signoffs[k] === true) S.signoffs[k] = { by: '', date: '' };
    else if (!S.signoffs[k]) delete S.signoffs[k];
  });
  var mount = $('#smeMount');
  var statusOpts = T.META.statuses.map(function (s) { return '<option' + (s === S.status ? ' selected' : '') + '>' + esc(s) + '</option>'; }).join('');
  var html = '<div class="grid cols-2">';
  html += '<div class="card"><h3>Training status</h3>' +
    '<div class="sme-status" style="margin-top:10px"><select id="smeStatus" aria-label="Training status">' + statusOpts + '</select>' +
    '<span class="chip" id="smeStatusChip"></span></div>' +
    '<p class="muted" style="margin-top:10px;font-size:13px">Content version <b>' + esc(T.META.version) + '</b> · last updated <b>' + esc(T.META.updated) + '</b></p></div>';
  html += '<div class="card"><h3>Required sign-offs <span class="chip" id="smeSignChip" style="margin-left:6px"></span></h3>' +
    '<label class="fld" for="smeReviewer">Reviewer name (recorded when you sign a row)</label>' +
    '<input type="text" id="smeReviewer" placeholder="e.g. J. Rivera — Safety" value="' + esc(S.reviewer || '') + '">' +
    '<div class="review-list" style="margin-top:10px">';
  SIGNOFFS.forEach(function (s) {
    var rec = S.signoffs[s[0]], on = !!rec;
    var meta = on ? ('✓ Signed' + (rec.by ? ' by ' + esc(rec.by) : ' (name not recorded)') + (rec.date ? ' · ' + esc(rec.date) : '')) : 'Awaiting sign-off';
    html += '<div class="review-item' + (on ? ' signed' : '') + '"><input type="checkbox" id="so_' + s[0] + '" data-signoff="' + s[0] + '"' + (on ? ' checked' : '') + '>' +
      '<label for="so_' + s[0] + '" style="flex:1"><span>' + esc(s[1]) + '</span><br><span class="sign-meta" data-meta="' + s[0] + '">' + meta + '</span></label></div>';
  });
  html += '</div></div></div>';
  html += '<div class="card" style="margin-top:16px"><h3>Reviewer notes</h3>' +
    '<label class="fld" for="smeNotes">General review notes (saved locally)</label>' +
    '<textarea id="smeNotes" placeholder="Accuracy flags, wording concerns, required changes…">' + esc(S.notes || '') + '</textarea>' +
    '<label class="fld" for="smeRefs">Source / reference material</label>' +
    '<textarea id="smeRefs" placeholder="Standards, company SOP references, SME contacts…">' + esc(S.refs || '') + '</textarea></div>';
  html += '<div class="mod-complete" id="smeReviewBanner" style="margin-top:16px;display:none"></div>';
  html += '<div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap">' +
    '<button class="btn btn-primary" id="btnSmeReport">⬇ Download signed review report (.txt)</button></div>';
  html += '<div class="safety-note" style="max-width:none;margin-top:16px">⚠️ ' + esc(T.DISCLAIMER) + '</div>';
  mount.innerHTML = html;

  function signCount() { var n = 0; SIGNOFFS.forEach(function (s) { if (S.signoffs[s[0]]) n++; }); return n; }
  function signers() { var out = []; SIGNOFFS.forEach(function (s) { var r = S.signoffs[s[0]]; if (r && r.by && out.indexOf(r.by) < 0) out.push(r.by); }); return out; }
  function chip() { var c = $('#smeStatusChip'); c.textContent = S.status; c.className = 'chip ' + (S.status === 'Ready for Internal Pilot Test' ? 'ok' : 'warn'); }
  function signChip() { var n = signCount(), t = SIGNOFFS.length; var c = $('#smeSignChip'); c.textContent = n + ' / ' + t + ' signed'; c.className = 'chip ' + (n === t ? 'ok' : (n ? 'warn' : '')); }
  function banner() {
    var b = $('#smeReviewBanner'), n = signCount(), t = SIGNOFFS.length;
    if (n === 0) { b.style.display = 'none'; return; }
    b.style.display = 'block';
    if (n === t) {
      var who = signers();
      b.className = 'mod-complete done';
      b.innerHTML = '✓ <b>All ' + t + ' required reviews recorded.</b> Signed off by ' + (who.length ? esc(who.join(', ')) : 'the named reviewers') +
        '. This prototype is cleared for internal pilot testing per those attestations — download the signed report for the record.';
    } else {
      b.className = 'mod-complete';
      b.innerHTML = '<b>' + n + ' of ' + t + ' reviews recorded.</b> Enter the reviewer name and tick each remaining review to complete sign-off.';
    }
  }
  function today() { try { return new Date().toLocaleDateString(); } catch (e) { return ''; } }
  chip(); signChip(); banner();
  $('#smeReviewer').addEventListener('input', function (e) { S.reviewer = e.target.value; save(SKEY, S); });
  $('#smeStatus').addEventListener('change', function (e) { S.status = e.target.value; save(SKEY, S); chip(); toast('Status: ' + S.status); });
  $('#smeNotes').addEventListener('input', function (e) { S.notes = e.target.value; save(SKEY, S); });
  $('#smeRefs').addEventListener('input', function (e) { S.refs = e.target.value; save(SKEY, S); });
  $$('[data-signoff]', mount).forEach(function (cb) {
    cb.addEventListener('change', function () {
      var key = cb.getAttribute('data-signoff');
      var metaEl = $('[data-meta="' + key + '"]');
      var row = cb.parentNode;
      if (cb.checked) {
        var by = ($('#smeReviewer').value || '').trim();
        S.signoffs[key] = { by: by, date: today() };
        if (metaEl) metaEl.textContent = '✓ Signed' + (by ? ' by ' + by : ' (name not recorded)') + ' · ' + S.signoffs[key].date;
        row.classList.add('signed');
      } else {
        delete S.signoffs[key];
        if (metaEl) metaEl.textContent = 'Awaiting sign-off';
        row.classList.remove('signed');
      }
      save(SKEY, S); signChip(); banner();
    });
  });
  $('#btnSmeReport').addEventListener('click', function () { downloadSmeReport(S); });
}
function downloadSmeReport(S) {
  var L = [];
  L.push('PILOT FUEL TANKER TRAINING PROTOTYPE — SME / COMPLIANCE REVIEW REPORT');
  L.push('Content version: ' + T.META.version + '   Last updated: ' + T.META.updated);
  L.push('Report generated: ' + new Date().toLocaleString());
  L.push('Training status: ' + S.status);
  L.push('');
  L.push('REVIEWER OF RECORD: ' + (S.reviewer || '(not entered)'));
  L.push('');
  L.push('REQUIRED SIGN-OFFS');
  SIGNOFFS.forEach(function (s) {
    var r = S.signoffs[s[0]];
    var sig = r ? ('SIGNED' + (r.by ? ' by ' + r.by : '') + (r.date ? ' on ' + r.date : '')) : 'awaiting sign-off';
    L.push('  [' + (r ? 'x' : ' ') + '] ' + s[1]);
    L.push('        ' + sig);
  });
  var n = 0; SIGNOFFS.forEach(function (s) { if (S.signoffs[s[0]]) n++; });
  L.push('  (' + n + ' of ' + SIGNOFFS.length + ' reviews recorded' + (n === SIGNOFFS.length ? ' — CLEARED FOR INTERNAL PILOT TEST' : '') + ')');
  L.push('');
  L.push('REVIEWER NOTES');
  L.push(S.notes ? S.notes : '  (none)');
  L.push('');
  L.push('SOURCE / REFERENCE MATERIAL');
  L.push(S.refs ? S.refs : '  (none)');
  L.push('');
  L.push('CONTENT COVERED (' + T.MODULES.length + ' modules + ' + T.QUIZ.length + '-question assessment):');
  T.MODULES.forEach(function (m) { L.push('  ' + m.number + '. ' + m.title); });
  L.push('');
  L.push(T.DISCLAIMER);
  var blob = new Blob([L.join('\r\n')], { type: 'text/plain' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'pilot-tanker-sme-review-report.txt';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
  toast('Review report downloaded');
}

/* =====================================================================
   SHOWCASE TOUR
   ===================================================================== */
var SHOW_STEPS = [
  { acts: ['reset'], c: 'Exterior — the full Pilot gasoline tanker rig' },
  { acts: ['engine'], c: 'X-Ray Engine — block, cooling, and drivetrain' },
  { acts: ['fluid-all'], c: 'Fluid systems — diesel, oil, coolant, and DEF (schematic)' },
  { acts: ['fluid-none', 'tank'], c: 'X-Ray Tank — internal compartments and surge baffles' },
  { acts: ['fluid-cargo'], c: 'Gasoline cargo volume shown in each compartment' },
  { acts: ['fluid-none', 'cutaway'], c: 'Full cutaway — every major system, labeled' },
  { acts: ['normal', 'pretrip'], c: 'Pre-trip walkaround — what a driver checks before rolling' },
  { acts: ['reset'], c: 'Ready to explore on your own — tap any part to learn more' }
];
var showIdx = 0, showTimer = null, showPlaying = false;
function renderShowcase() {
  mountStage($('#slotShowcase'), 'reset');
  showIdx = 0; showPlaying = false;
  $('#scCaption').textContent = 'Press ▶ Start Tour for a guided walkthrough' + (reducedMotion ? ' (use Next ▸ to step through)' : '');
  $('#scPlay').textContent = '▶ Start Tour';
}
function showStep(i) {
  showIdx = (i + SHOW_STEPS.length) % SHOW_STEPS.length;
  var s = SHOW_STEPS[showIdx];
  runActions(s.acts);
  $('#scCaption').textContent = s.c;
}
function showNext() { showStep(showIdx + 1); if (showPlaying) queueShow(); }
function queueShow() { clearTimeout(showTimer); if (reducedMotion) return; showTimer = setTimeout(function () { if (showPlaying) showNext(); }, 4600); }
function playShow() {
  showPlaying = true; $('#scPlay').textContent = '⏸ Pause';
  showStep(0);
  if (!reducedMotion) queueShow(); else toast('Reduced-motion on — use Next ▸ to advance');
}
function stopShowcase() { showPlaying = false; clearTimeout(showTimer); if ($('#scPlay')) $('#scPlay').textContent = '▶ Start Tour'; }
$('#scPlay').addEventListener('click', function () { if (showPlaying) { stopShowcase(); } else { playShow(); } });
$('#scNext').addEventListener('click', function () { showPlaying = false; clearTimeout(showTimer); $('#scPlay').textContent = '▶ Start Tour'; showNext(); });

/* =====================================================================
   PAUSE / RESTART
   ===================================================================== */
var pauseScreen = $('#pauseScreen'), paused = false, resumeTour = false;
function isTyping() {
  var a = document.activeElement;
  if (!a) return false;
  var t = (a.tagName || '').toLowerCase();
  return t === 'input' || t === 'textarea' || t === 'select' || a.isContentEditable === true;
}
function setPaused(on) {
  on = !!on;
  if (paused === on) return;
  paused = on;
  pauseScreen.hidden = !on;
  if (on) {
    stageHost.style.pointerEvents = 'none';   // freeze interaction with the 3D viewer
    resumeTour = showPlaying;
    stopShowcase();
    empireSave();
    $('#btnPauseResume').focus();
  } else {
    stageHost.style.pointerEvents = '';
    if (resumeTour) { resumeTour = false; playShow(); }
  }
}
function restartActivity() {
  setPaused(false);
  var r = parseHash();
  postAction('reset');
  if (r.view === 'module') { mountModule(r.arg); toast('Module restarted'); }
  else if (r.view === 'assessment') { renderAssessment(); toast('Assessment restarted'); }
  else if (r.view === 'showcase') { renderShowcase(); toast('Showcase tour reset'); }
  else { render(); toast('View reset'); }
  window.scrollTo(0, 0);
}
$('#btnPauseResume').addEventListener('click', function () { setPaused(false); });
$('#btnPauseRestart').addEventListener('click', restartActivity);
$('#btnPauseDash').addEventListener('click', function () { setPaused(false); go('/dashboard'); });
document.addEventListener('keydown', function (e) {
  if (isTyping() || e.ctrlKey || e.metaKey || e.altKey) return;
  if (!paused && nav.classList.contains('open')) return;   // Escape closes the nav drawer first
  if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') { e.preventDefault(); setPaused(!paused); }
});

/* =====================================================================
   EMPIRE SDK BRIDGE
   window.Empire is created by the module script at the end of <body>, which
   runs after this classic script — so everything here is guarded / queued.
   ===================================================================== */
var empireSec = 0, empireReported = 0, pendingFirstTour = false;
window.__trainerPause = function (on) { setPaused(on); };
function empireSave() {
  if (!window.Empire) return;
  var pct = coursePct();
  try {
    window.Empire.saveState('progress', P, {
      label: pct + '% · ' + completedCount() + ' / ' + T.MODULES.length + ' modules',
      progress: pct / 100,
      playtimeSec: Math.floor(empireSec) || 0
    });
    window.Empire.setContinuePoint('progress', resumableRoute());
  } catch (err) {}
}
function empireReport() {
  if (!window.Empire) return;
  var s = Math.floor(empireSec) - empireReported;
  if (s > 0) { empireReported += s; try { window.Empire.reportPlaytime(s); } catch (err) {} }
}
function empireUnlock(id) {
  if (window.Empire) { try { window.Empire.unlockAchievement(id); } catch (err) {} }
}
function empireFirstTour() {
  if (window.Empire) empireUnlock('first-tour'); else pendingFirstTour = true;
}
function empireCheckAchievements() {
  if (completedCount() >= T.MODULES.length) empireUnlock('module-master');
  if (P.quiz && P.quiz.passed) empireUnlock('assessment-passed');
}
window.addEventListener('empire-ready', function () {
  if (pendingFirstTour) { pendingFirstTour = false; empireUnlock('first-tour'); }
  Promise.resolve(window.Empire.loadState('progress')).then(function (rec) {
    var b = rec && rec.blob;
    // only adopt the hub copy when this device has no local progress of its own
    if (b && typeof b === 'object' && !Array.isArray(b) && !hasCourseActivity()) {
      P = b;
      if (!P.modules || typeof P.modules !== 'object' || Array.isArray(P.modules)) P.modules = {};
      if (!P.quiz || typeof P.quiz !== 'object' || Array.isArray(P.quiz)) P.quiz = freshProgress().quiz;
      if (typeof P.name !== 'string') P.name = '';
      if (typeof P.lastRoute !== 'string') P.lastRoute = '';
      save(PKEY, P);
      render();
    }
    empireCheckAchievements();
    empireSave();
  }).catch(function () {});
  setInterval(function () { if (!paused) { empireSec += 5; empireReport(); } }, 5000);
});
window.addEventListener('beforeunload', function () { empireReport(); });

/* =====================================================================
   BOOT
   ===================================================================== */
render();
})();
