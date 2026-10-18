/* =====================================================================
   Voxhaven — main.js
   Bootstrapping, menus, pointer-lock, main loop, HUD + panel UI wiring,
   and save/load buttons.
   ===================================================================== */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const el=(t,c,h)=>{ const e=document.createElement(t); if(c)e.className=c; if(h!=null)e.innerHTML=h; return e; };

let game=null, last=0, running=false;
let uiPanel=null;            // 'inv'|'chest'|'furnace'|'trade'|null
let cursor=null;             // held stack while moving items {item,count}
let chestPos=null, furnacePos=null, craftStation=null, tradeMob=null;
let debugOn=false, lastSel=-1;

// settings
const settings={ rd:4, sens:1.0, vol:0.6, gfx:'med', autoJump:true };
let selectedMode='survival';

// ---------- rebindable controls ----------
const KEY_LABELS={ forward:'Move Forward', back:'Move Back', left:'Move Left', right:'Move Right', jump:'Jump', sprint:'Sprint', crouch:'Crouch / Fly Down', inventory:'Inventory / Craft', build:'Build Menu', starmap:'Star Map', interact:'Interact', drop:'Drop Item', debug:'Debug Overlay', viewToggle:'Toggle View', map:'Open World Map', rotate:'Rotate Placement' };
const DEFAULT_KEYS={ forward:'KeyW', back:'KeyS', left:'KeyA', right:'KeyD', jump:'Space', sprint:'ShiftLeft', crouch:'KeyC', inventory:'KeyE', build:'KeyB', starmap:'KeyN', interact:'KeyF', drop:'KeyQ', debug:'KeyR', viewToggle:'KeyV', map:'KeyM', rotate:'KeyT' };
let KEYBINDS={};
function loadKeybinds(){ try{ const s=JSON.parse(localStorage.getItem('voxhaven_keybinds')||'null'); KEYBINDS=Object.assign({},DEFAULT_KEYS,s||{}); }catch(e){ KEYBINDS=Object.assign({},DEFAULT_KEYS); } }
function saveKeybinds(){ try{ localStorage.setItem('voxhaven_keybinds',JSON.stringify(KEYBINDS)); }catch(e){} }
function actionForCode(code){ for(const a in KEYBINDS) if(KEYBINDS[a]===code) return a; return null; }
function keyLabel(code){ return ({Space:'Space',ShiftLeft:'Shift',ControlLeft:'Ctrl'})[code] || (code&&code.startsWith('Key')?code.slice(3):code&&code.startsWith('Digit')?code.slice(5):code||'?'); }
let listeningFor=null;
function renderKeybindList(){
  const list=$('keybindList'); if(!list) return; list.innerHTML='';
  for(const action in KEY_LABELS){ const row=el('div','keyrow');
    row.appendChild(el('span',null,KEY_LABELS[action]));
    const btn=el('button',null,keyLabel(KEYBINDS[action]));
    btn.onclick=()=>{ if(listeningFor){ const prev=document.querySelector('.keyrow button.listening'); if(prev) prev.classList.remove('listening'); }
      listeningFor=action; btn.textContent='...'; btn.classList.add('listening');
    };
    row.appendChild(btn); list.appendChild(row);
  }
}
addEventListener('keydown',e=>{
  if(!listeningFor) return;
  e.preventDefault();
  if(e.code==='Escape'){ listeningFor=null; renderKeybindList(); return; }   // cancel rebind, keep old key
  if(e.code.startsWith('Digit')) return;                                    // hotbar keys are fixed
  KEYBINDS[listeningFor]=e.code; saveKeybinds(); listeningFor=null; renderKeybindList(); if(typeof updateActionHotkeys==='function') updateActionHotkeys();
},true);

// ---------- icon url cache ----------
const iconCache={};
function iconURL(itemId){ if(!iconCache[itemId]){ iconCache[itemId]=game.iconCanvas(itemId).toDataURL(); } return iconCache[itemId]; }

/* ================= boot ================= */
function boot(){
  buildAtlas();   // build texture atlas once
  loadKeybinds(); renderKeybindList();
  // settings menu wiring
  $('rdSlider').oninput=e=>{ settings.rd=+e.target.value; $('rdVal').textContent=settings.rd; if(game)game.renderDist=settings.rd; };
  $('msSlider').oninput=e=>{ settings.sens=+e.target.value; $('msVal').textContent=settings.sens.toFixed(1); if(game)game.sens=settings.sens; };
  $('volSlider').oninput=e=>{ settings.vol=+e.target.value/100; $('volVal').textContent=e.target.value; Audio.vol=settings.vol; };
  $('gfxSel').onchange=e=>{ settings.gfx=e.target.value; };
  $('autoJumpChk').onchange=e=>{ settings.autoJump=e.target.checked; if(game&&game.player) game.player.autoJump=settings.autoJump; };
  $('btnSettings').onclick=()=>{ $('settings').classList.toggle('hidden'); };
  $('btnResetKeys').onclick=()=>{ KEYBINDS=Object.assign({},DEFAULT_KEYS); saveKeybinds(); renderKeybindList(); };

  // game mode selector (start menu)
  document.querySelectorAll('#modeSelect .modeBtn').forEach(b=>{
    b.onclick=()=>{ selectedMode=b.dataset.mode; document.querySelectorAll('#modeSelect .modeBtn').forEach(x=>x.classList.toggle('sel',x===b)); };
  });

  // "New World" only reveals the name/seed/mode picker; mode is chosen up
  // front and locked once the world starts (no in-game mode switching).
  $('btnNew').onclick=()=>{ $('mainMenuButtons').classList.add('hidden'); $('newWorldPanel').classList.remove('hidden'); };
  $('btnBackNew').onclick=()=>{ $('newWorldPanel').classList.add('hidden'); $('mainMenuButtons').classList.remove('hidden'); };
  $('btnStartNew').onclick=()=>{ Audio.init(); const s=$('seedInput').value.trim(); const seed=s? hashStr(s) : (Math.random()*1e9)|0;
    const noItems=$('noStartItems').checked;
    const list=Storage.listWorlds();
    const name=$('worldNameInput').value.trim() || ('World '+(list.length+1));
    // each new world gets its own save key — starting this one never touches
    // (or deletes) whatever was previously active, so it's still there in
    // the world list to resume later
    const key=Storage.newWorldKey(seed); Storage.setActive(key);
    Storage.registerWorld({ key, name, seed, mode:selectedMode, day:1, health:20, maxHealth:20, createdAt:Date.now(), lastPlayed:Date.now() });
    startGame(()=>{ game.newWorld(seed,selectedMode,noItems); doSave(); });
  };

  // ---------- world select screen ----------
  $('btnWorlds').onclick=()=>{ renderWorldList(); $('startScreen').classList.add('hidden'); $('worldListScreen').classList.remove('hidden'); };
  $('btnWorldsBack').onclick=()=>{ $('worldListScreen').classList.add('hidden'); $('startScreen').classList.remove('hidden'); };

  // pause menu
  $('btnResume').onclick=resume;
  $('btnSave').onclick=()=>{ doSave(); flashText($('loadtext'),'Saved'); };
  $('btnPauseSettings').onclick=()=>{ $('settings').classList.toggle('hidden'); $('pauseScreen').appendChild($('settings')); };
  $('btnQuit').onclick=quitToMenu;
  $('btnRespawn').onclick=()=>{ game.respawn(); $('deathScreen').classList.add('hidden'); requestLock(); };
  $('btnToggleView').onclick=()=>{ game.toggleView(); updateModeViewLabels(); };
  for(const b of document.querySelectorAll('#timeRow .timeBtns button')) b.onclick=()=>{ game.time=parseFloat(b.dataset.t); };

  // chat + cheats at bottom right
  const chatMsgs = $('chatMessages');
  const chatIn = $('chatInput');
  function addChat(msg, isCmd){ 
    const d=el('div', isCmd?'msg cmd':'msg', msg); 
    chatMsgs.appendChild(d); 
    chatMsgs.scrollTop=chatMsgs.scrollHeight; 
  }
  chatIn.addEventListener('keydown', e=>{
    if(e.key==='Enter'){
      const v=chatIn.value.trim(); if(v){
        if(v[0]==='/'){ processCheat(v); } else { addChat(v); }
      }
      chatIn.value=''; chatIn.blur();
    } else if(e.key==='Escape'){
      chatIn.value=''; chatIn.blur();
    }
  });
  window.addChat = addChat; // for debug

  function processCheat(cmd){
    addChat(cmd, true);
    const p = cmd.slice(1).trim().toLowerCase().split(/\s+/);
    if(p[0]==='gamemode' || p[0]==='gm' || p[0]==='cheat'){
      let m = p[1]||'';
      if(m==='0'||m==='s'||m==='survival') m='survival';
      else if(m==='1'||m==='c'||m==='creative') m='creative';
      else if(m==='2'||m==='sp'||m==='spectator') m='spectator';
      if(['survival','creative','spectator'].indexOf(m)>=0){
        game.setMode(m);
        updateModeViewLabels();
        if(uiPanel==='inv') renderInventory();
        flashPrompt('Gamemode: '+m);
        addChat('> set to '+m);
      }else addChat('> bad mode (0/1/2 or names)');
    }else if(p[0]==='time' && p[1]==='set'){
      const v = p[2]||'';
      if(v==='day'||v==='d'){ game.time=0.30; game.day = (game.day||1); addChat('> time set to day'); }
      else if(v==='night'||v==='n'){ game.time=0.78; addChat('> time set to night'); }
      else addChat('> use day or night');
    }else if(p[0]==='give'){
      const id = p[1]||''; const n = p[2] ? (parseInt(p[2])||1) : 1;
      if(ITEMS[id]){ game.giveItem(id, n); if(uiPanel==='inv') renderInventory(); if(typeof refreshHotbar==='function') refreshHotbar(); addChat('> gave '+id+' x'+n); }
      else addChat('> unknown item');
    }else if(p[0]==='heal'){
      if(game.player){ game.player.health = game.player.maxHealth||20; game.player.hunger = game.player.maxHunger||20; addChat('> healed'); }
    }else if(p[0]==='kill'){
      if(game.player) game.player.health=0;
      addChat('> killed');
    }else if(p[0]==='clear'){
      if(game.player && game.player.inv){ game.player.inv.fill(null); game.player.sel=0; }
      if(typeof refreshHotbar==='function') refreshHotbar();
      if(uiPanel==='inv') renderInventory();
      addChat('> inventory cleared');
    }else if(p[0]==='day'){ game.time=0.30; addChat('> set to day'); }
    else if(p[0]==='night'){ game.time=0.78; addChat('> set to night'); }
    else if(p[0]==='spawn'){
      const pl=game.player; if(pl && pl.spawn && pl.setPos){ pl.setPos(pl.spawn.x||pl.pos.x, pl.spawn.y||pl.pos.y, pl.spawn.z||pl.pos.z); addChat('> to spawn'); }
    }else if(p[0]==='mars' || p[0]==='colonize'){
      if(game.mode !== 'creative'){
        game.setMode('creative');
        updateModeViewLabels();
        if(uiPanel==='inv') renderInventory();
      }
      flashPrompt('Mars colony items available');
      addChat('> Colony blocks and items now appear in the BLOCKS, GEAR, FOOD, and other creative tabs (pick them from the catalog instead of direct give).');
    }else if(p[0]==='tesla'){
      game.giveItem('cybertruck',1); game.giveItem('battery',8); game.giveItem('solar_panel',4); addChat('> Tesla Cybertruck deployed. 0-60 in 2s (voxel time).');
    }else if(p[0]==='xai' || p[0]==='grok'){
      addChat('> xAI Grok: "The goal is to understand the true nature of the universe." Mars colony online. Full send.');
      game.giveItem('neuralink',1); game.giveItem('diamond',32); game.giveItem('starship',1);
    }else if(p[0]==='help'){
      addChat('> /gm 0/1/2 | /give <item> [n] | /heal | /clear | /day | /night | /spawn | /tesla | /xai');
      addChat('> TO SPACE (no cheats): mine Voidcrystal + Quartz deep underground → craft a Circuit & Science Lab → build a rocket + Spacesuit → fuel the tank → click the Launchpad. See the Star Map [N] for the steps.');
    }else{
      addChat('> unknown. try /help');
    }
  }

  requestAnimationFrame(loop);
}
function hashStr(s){ let h=2166136261; for(let i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=Math.imul(h,16777619); } return h>>>0; }

/* ================= game start / loading ================= */
function startGame(genFn){
  $('startScreen').classList.add('hidden');
  $('loadScreen').classList.remove('hidden');
  setFill(0); $('loadtext').textContent='Carving the world…';
  if(!game){ game=new Game($('game')); window.__voxhavenGame=game; wireGameCallbacks(); }
  game.renderDist=settings.rd; game.sens=settings.sens; game.gfx=settings.gfx; Audio.vol=settings.vol;
  // defer so the loading screen paints
  setTimeout(()=>{ genFn(); loadInitial(()=>{ enterPlay(); }); }, 40);
}
function loadInitial(done){
  game.maintainChunks();
  const total=game.loadQueue.length||1;
  function step(t){
    // Build up to 8 chunks per tick during loading (fast fill of the progress bar).
    // Clamp to ~12ms of real time so the loading bar still paints on slow machines.
    const budget=8;
    game.processLoad(budget);
    const remain=game.loadQueue.length;
    setFill(1-remain/total);
    if(remain>0) requestAnimationFrame(step);
    else { setFill(1); setTimeout(done,150); }
  }
  requestAnimationFrame(step);
}
function enterPlay(){
  $('loadScreen').classList.add('hidden');
  $('hud').classList.remove('hidden'); $('crosshair').classList.remove('hidden');
  game.player.autoJump=settings.autoJump;
  buildHUD(); refreshHotbar(); onSelChange(); updateTopBar._n=worldName(); updateActionHotkeys(); running=true; requestLock();
  if(window.addChat) window.addChat('> Voxhaven. Survive, build, and reach for the stars — mine deep for Voidcrystal to begin the journey to Aethon. Open the Star Map [N] for the path. /help for commands.');
}
function setFill(f){ $('loadfill').style.width=Math.round(clampN(f,0,1)*100)+'%'; }
function clampN(v,a,b){ return v<a?a:v>b?b:v; }

/* ================= pointer lock ================= */
function requestLock(){ if(game&&!uiPanel&&!game._rocketUI&&!game.paused&&!game.dead) game.renderer.domElement.requestPointerLock(); }
document.addEventListener('pointerlockchange',()=>{
  const locked=document.pointerLockElement===game?.renderer.domElement;
  if(game) game.input.enabled=locked;
  if(!locked && running && !uiPanel && !(game&&game._rocketUI) && !game.dead && !game.paused){ pause(); }
});
function onCanvasClick(){ if(running && !uiPanel && !(game&&game._rocketUI) && !game.paused && !game.dead) requestLock(); }

/* ================= main loop ================= */
function loop(t){
  requestAnimationFrame(loop);
  const dt=Math.min(0.05,(t-last)/1000)||0; last=t;
  if(!game||!running){ return; }
  // build movement control from held keys (frozen when a panel is open)
  const inp=game.input; const chatFoc = !!(document.activeElement && document.activeElement.id==='chatInput');
  // during rocket flight the avatar is frozen — flight reads keys directly in _rocketTick
  const flight=game._rocketActive; const active=game.input.enabled && !uiPanel && !game._rocketUI && !flight && !game.paused && !game.dead && !chatFoc;
  const ctl={ f:active&&inp.down(KEYBINDS.forward), b:active&&inp.down(KEYBINDS.back), l:active&&inp.down(KEYBINDS.left), r:active&&inp.down(KEYBINDS.right),
    jump:active&&inp.down(KEYBINDS.jump), sprint:active&&inp.down(KEYBINDS.sprint), crouch:active&&inp.down(KEYBINDS.crouch) };

  // hotbar via wheel
  const w=inp.consumeWheel(); if(active && w){ game.player.sel=( (game.player.sel+ (w>0?1:-1)) +9)%9; onSelChange(); }

  // mining / attacking (hold left) — never inside the cockpit room
  if(active && game.dimension!=='cockpit'){
    if(inp.mouseDown[0] && !noMine){ game.holdBreak(dt); }
  }

  try{
    game.update(dt,ctl);
    game.render();
    updateHUD();
    if(debugOn) updateDebug(dt);
  }catch(err){
    if(!loop._lastErr || loop._lastErr!==err.message){ loop._lastErr=err.message; console.error('Frame error:', err); }
  }
}

/* ================= discrete input ================= */
let noMine=false;
addEventListener('mousedown',e=>{
  if(!game||!running) return;
  if(uiPanel||game.paused||game.dead) return;
  if(document.pointerLockElement!==game.renderer.domElement){ return; }
  const held=game.selItem?game.selItem():null;
  if(held && held.fishes && game.fishing && game.fishing.state==='biting'){ game.useItem(); refreshHotbar(); return; }
  if(e.button===0){ // left: attack a closer mob, otherwise mine (holdBreak handles the actual hold-to-break)
    // interact() used to also run here, which made furniture/beds permanently
    // unminable — clicking one always opened/toggled it and set noMine=true
    // before the hold-to-break loop ever got a turn. Right-click and the F
    // key already cover interact, so left-click is attack-or-mine only.
    const blockD = game.selBlock ? Math.hypot(game.selBlock.x+0.5-game.player.pos.x, (game.selBlock.y+0.5)-(game.player.pos.y+game.player.eye), game.selBlock.z+0.5-game.player.pos.z) : Infinity;
    const mobD = game.peekMobDist();
    if(mobD < blockD - 0.4){ if(game.attack()) noMine=true; }
    else if(game.attack()){ noMine=true; }
  } else if(e.button===2){ // right: equip armor > interact > place > eat
    if(equipArmorFromSlot('inv', game.player.sel, false)) {}
    else if(game.interact()) {}
    else { const it=game.selItem(); if(it&&it.blockId) game.place(); else game.useItem(); }
    refreshHotbar();
  }
});
addEventListener('mouseup',e=>{ if(e.button===0){ noMine=false; if(game) game.cancelBreak(); } });
addEventListener('contextmenu',e=>e.preventDefault());
game_canvas_click_bind();
function game_canvas_click_bind(){ // attach canvas click after game exists
  const obs=setInterval(()=>{ if(game){ game.renderer.domElement.addEventListener('click',onCanvasClick); clearInterval(obs); } },200);
}

let lastJumpPress=0;
addEventListener('keydown',e=>{
  if(listeningFor) return;             // a rebind capture is in progress
  if(!game||!running) return;
  if(document.activeElement && document.activeElement.id==='chatInput') return;  // let chat handle keys
  // ---- rocket states intercept keys (dashboard / cockpit / countdown / flight) ----
  if(game._inCockpit){ if(e.code==='Escape') game._closeCockpitUI&&game._closeCockpitUI(); return; }  // checklist panel open
  if(game._rocketUI){ if(e.code==='Escape'){ game._closeRocketDash(); } else if(e.code==='KeyL'){ game._rocketBoard&&game._rocketBoard(); } return; }
  if(game.rocket && game.rocket.phase==='countdown'){ if(e.code==='KeyX'){ game._rocketAbort(); return; } }
  if(game._rocketActive){ if(e.code==='Escape') game._rkComplete('home'); return; }  // flight reads keys via game.input; swallow panel keys
  // digits select hotbar
  if(e.code.startsWith('Digit')){ const n=+e.code.slice(5); if(n>=1&&n<=9){ game.player.sel=n-1; onSelChange(); } return; }
  // / opens chat for cheats (like Minecraft)
  if(e.code==='Slash' && !uiPanel && !game.paused && !game.dead){
    e.preventDefault();
    const ci=$('chatInput'); if(ci){ ci.focus(); ci.value='/'; }
    return;
  }
  // double-tap jump toggles creative flight on/off
  if(!e.repeat && e.code===KEYBINDS.jump && !uiPanel && !game.paused && !game.dead){
    const now=performance.now();
    if(now-lastJumpPress<300 && game.mode==='creative'){ game.toggleFly(); flashPrompt('Flying: '+(game.player.flying?'ON':'OFF')); }
    lastJumpPress=now;
  }
  if(e.code==='Escape'){
    if(uiPanel){ closePanel(); }
    else if(document.activeElement && document.activeElement.id==='chatInput'){ $('chatInput').blur(); return; }
    else if(game.dead){}
    else if(game.paused){ resume(); }
    else pause();
    return;
  }
  const action=actionForCode(e.code);
  switch(action){
    case 'inventory': if(game.paused||game.dead) break; if(uiPanel==='inv') closePanel(); else if(!uiPanel) openInventory(null); else closePanel(); break;
    case 'build': if(game.paused||game.dead) break; if(uiPanel==='inv') closePanel(); else if(!uiPanel){ openInventory(null); setInvTab(game.mode==='creative'?'blocks':'craft'); } break;
    case 'starmap': if(game.paused||game.dead) break; if(uiPanel==='starmap') closePanel(); else if(!uiPanel) openStarMap(); break;
    case 'interact': if(!uiPanel&&!game.paused&&!game.dead) doInteractKey(); break;
    case 'drop': if(!uiPanel&&!game.paused&&!game.dead && game.mode!=='spectator'){ game.dropSelected(); refreshHotbar(); } break;
    case 'debug': debugOn=!debugOn; $('debug').classList.toggle('hidden',!debugOn); break;
    case 'viewToggle': if(!uiPanel&&!game.paused&&!game.dead){ game.toggleView(); updateModeViewLabels(); } break;
    case 'map': if(game.paused||game.dead) break; if(uiPanel==='map') closePanel(); else if(!uiPanel) openMap(); break;
    case 'rotate': if(!uiPanel&&!game.paused&&!game.dead){ const r=game.cyclePlaceRot(); if(r!=null) flashPrompt('Rotation: '+Math.round(r*180/Math.PI)+'°'); } break;
  }
});
function updateModeViewLabels(){
  if(!game) return;
  const m=$('pauseModeLabel'); if(m) m.textContent=game.mode[0].toUpperCase()+game.mode.slice(1);
  const v=$('pauseViewLabel'); if(v) v.textContent=game.viewMode==='first'?'First-person':game.viewMode==='third'?'Third (face)':'Third (behind)';
  const tr=$('timeRow'); if(tr) tr.classList.toggle('hidden', game.mode!=='creative');
}
function doInteractKey(){
  if(game.interact()) return;
  const m=game.findLookMob(true); if(m){ game.heldSwing=1; openTrade(m); }
}
function itemDesc(it){ if(it.armorSlot)return 'Armor ('+it.armorSlot+') · '+it.def+' def'; if(it.shoots)return 'Ranged weapon · '+it.dmg+' dmg'; if(it.id==='arrow')return 'Ammo for bows'; if(it.effect)return 'Potion · '+it.effect+' ('+it.effectDur+'s)'; if(it.fishes)return 'Fishing rod · cast anywhere'; if(it.tool)return 'Tool · tier '+it.tier+(it.dmg?' · '+it.dmg+' dmg':''); if(it.food)return 'Food · +'+it.food+' stamina'; if(it.fuel)return 'Fuel'; if(it.blockId)return 'Placeable block'; if(it.smelt)return 'Smeltable'; return ''; }
function onSelChange(){ refreshHotbar(); const s=game.player.inv[game.player.sel]; showItemName(s?ITEMS[s.item]:null); }

/* ================= pause / quit ================= */
function pause(){ if(game.dead)return; game.paused=true; document.exitPointerLock(); updateModeViewLabels(); $('pauseScreen').classList.remove('hidden'); }
function resume(){ game.paused=false; $('pauseScreen').classList.add('hidden'); requestLock(); }
function quitToMenu(){ doSave(); running=false; game.paused=false; $('pauseScreen').classList.add('hidden'); $('hud').classList.add('hidden'); $('crosshair').classList.add('hidden'); $('startScreen').classList.remove('hidden'); document.exitPointerLock(); }
function doSave(){
  if(!game||!game.world) return;
  const k=Storage.activeKey(); if(!k) return;
  Storage.save(k,game.serialize());
  Storage.touchWorld(k, { mode:game.mode, day:game.day, health:Math.ceil(game.player.health), maxHealth:game.player.maxHealth, lastPlayed:Date.now() });
}
function worldDateLabel(ts){
  if(!ts) return '';
  const d=new Date(ts), now=new Date();
  const sameDay=d.toDateString()===now.toDateString();
  const time=d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
  return sameDay ? ('Today '+time) : d.toLocaleDateString([], {month:'short',day:'numeric'})+' '+time;
}
function renderWorldList(){
  const list=Storage.listWorlds();
  const node=$('worldList'); node.innerHTML='';
  $('worldListEmpty').classList.toggle('hidden', list.length>0);
  const modeColors={survival:'#3a7d4e',creative:'#3a6e9e',spectator:'#5a4a7a'};
  for(const w of list){
    const card=el('div','worldCard');
    const thumb=el('div','worldThumb'); thumb.textContent=(w.name||'?')[0].toUpperCase();
    thumb.style.background=modeColors[w.mode]||'#3a7d4e';
    card.appendChild(thumb);
    const info=el('div','worldInfo');
    const nameEl=el('div','wName'); nameEl.textContent=w.name||'World'; info.appendChild(nameEl);
    const meta=el('div','wMeta');
    const badge=el('span','wModeBadge '+(w.mode||'survival'), w.mode||'survival');
    meta.appendChild(badge);
    meta.appendChild(el('span',null,'Day <b>'+(w.day||1)+'</b>'));
    if(w.mode==='survival') meta.appendChild(el('span',null,'❤ <b>'+(w.health!=null?w.health:20)+'/'+(w.maxHealth||20)+'</b>'));
    meta.appendChild(el('span',null,'Seed <b>'+w.seed+'</b>'));
    meta.appendChild(el('span',null,worldDateLabel(w.lastPlayed)));
    info.appendChild(meta);
    card.appendChild(info);
    const actions=el('div','worldActions');
    const playBtn=el('button',null,'Play');
    playBtn.onclick=(e)=>{ e.stopPropagation(); Audio.init(); Storage.setActive(w.key); const save=Storage.load(w.key);
      if(!save){ alert('Save was corrupt or missing.'); return; }
      $('worldListScreen').classList.add('hidden'); startGame(()=>game.load(save));
    };
    const delBtn=el('button','danger','Delete');
    delBtn.onclick=(e)=>{ e.stopPropagation(); if(confirm('Delete "'+(w.name||'this world')+'"? This cannot be undone.')){ Storage.deleteWorld(w.key); renderWorldList(); } };
    actions.appendChild(playBtn); actions.appendChild(delBtn);
    card.appendChild(actions);
    card.onclick=()=>playBtn.onclick({stopPropagation(){}});
    node.appendChild(card);
  }
}
addEventListener('beforeunload',()=>{ if(game&&game.world&&running) doSave(); });

/* ================= game callbacks ================= */
function wireGameCallbacks(){
  game.onOpenChest=(x,y,z)=>{ chestPos=[x,y,z]; openChest(); };
  game.onOpenFurnace=(x,y,z)=>{ furnacePos=[x,y,z]; openFurnace(); };
  game.onOpenCraft=(station)=>{ openInventory(station); };
  game.onFlash=(msg)=>flashPrompt(msg);
  game.onRequestLock=()=>requestLock();
  game.onDamage=()=>{ const f=$('damageFlash'); f.classList.add('show'); setTimeout(()=>f.classList.remove('show'),120); };
  game.onDeath=(msg)=>{ $('deathMsg').textContent=msg+'  ·  survived '+game.day+' day(s)'; $('deathScreen').classList.remove('hidden'); document.exitPointerLock(); };
  game.onToast=(t)=>{ flashPrompt(t); };
  game.onSleep=()=>{ 
    const fade=$('fade'); 
    game.paused = true; // prevent pointerlockchange from calling pause() and showing pauseScreen during sleep
    fade.classList.add('show'); 
    document.exitPointerLock(); 
    setTimeout(()=>{ 
      game.finishSleep(); 
      fade.classList.remove('show'); 
      flashPrompt('Good morning — Day '+game.day); 
      game.paused = false; 
      requestLock(); 
    },1100); 
  };
}

/* ================= HUD ================= */
function buildHUD(){
  const hb=$('hotbar'); hb.innerHTML='';
  for(let i=0;i<9;i++){ const s=el('div','slot'); s.dataset.i=i;
    s.innerHTML='<span class="keynum">'+(i+1)+'</span><img><span class="count"></span><div class="durbar" style="display:none"><i></i></div>';
    s.onclick=()=>{ game.player.sel=i; onSelChange(); };
    hb.appendChild(s);
  }
  const hr=$('heartRow'); hr.innerHTML=''; for(let i=0;i<10;i++) hr.appendChild(el('div','pip heart-full'));
  const fr=$('hungerRow'); fr.innerHTML=''; for(let i=0;i<10;i++) fr.appendChild(el('div','pip food-full'));
  const wr=$('warmthRow'); wr.innerHTML=''; for(let i=0;i<10;i++) wr.appendChild(el('div','pip warm-full'));
  const br=$('breathRow'); br.innerHTML=''; for(let i=0;i<10;i++) br.appendChild(el('div','pip air-full'));
  const sr=$('staminaRow'); sr.innerHTML=''; for(let i=0;i<10;i++) sr.appendChild(el('div','pip sta-full'));
  const ox=$('oxygenRow'); ox.innerHTML=''; for(let i=0;i<10;i++) ox.appendChild(el('div','pip oxy-full'));
}
function refreshHotbar(){
  const hb=$('hotbar');
  for(let i=0;i<9;i++){ const slot=hb.children[i]; const s=game.player.inv[i];
    const img=slot.querySelector('img'), cnt=slot.querySelector('.count'), dur=slot.querySelector('.durbar');
    slot.classList.toggle('sel',i===game.player.sel);
    if(s){ const u=iconURL(s.item); if(img.dataset.id!==s.item){ img.src=u; img.dataset.id=s.item; } img.style.display='';
      cnt.textContent=s.count>1?s.count:'';
      const it=ITEMS[s.item];
      if(it.dur){ const d=s.dur==null?it.dur:s.dur; dur.style.display=''; const b=dur.querySelector('i'); const f=d/it.dur; b.style.width=(f*100)+'%'; b.style.background=f>0.5?'#5ec46a':f>0.25?'#d9a441':'#cf4b4b'; } else dur.style.display='none';
    } else { img.style.display='none'; img.dataset.id=''; cnt.textContent=''; dur.style.display='none'; }
  }
}
function updateHUD(){
  if(game.player.sel!==lastSel){ lastSel=game.player.sel; refreshHotbar(); }
  // hearts
  const hp=game.player.health; const hr=$('heartRow');
  for(let i=0;i<10;i++){ const v=hp-i*2; hr.children[i].className='pip '+(v>=2?'heart-full':v>=1?'heart-half':'heart-empty'); }
  const hu=game.player.hunger; const fr=$('hungerRow');
  for(let i=0;i<10;i++){ const v=hu-i*2; fr.children[i].className='pip '+(v>=2?'food-full':v>=1?'food-half':'food-empty'); }
  const st=game.player.stamina, sr=$('staminaRow');
  const showSta=game.mode==='survival' && st<game.player.maxStamina;
  sr.classList.toggle('hidden',!showSta);
  if(showSta) for(let i=0;i<10;i++){ const v=st-i*10; sr.children[i].className='pip '+(v>=10?'sta-full':v>=5?'sta-half':'sta-empty'); }
  updateSurvivalFx();
  updateTopBar();
  // interaction prompt
  const held=(game && game.selItem) ? game.selItem() : null;
  if(held && held.fishes && game && game.fishing && !uiPanel){
    showPrompt( game.fishing.state==='biting' ? 'Click to reel!' : 'Fishing...' );
  }else if(game.dimension==='cockpit' && game.selBlock && !uiPanel){ const sb=game.selBlock;
    if(game.world.getBlock(sb.x,sb.y,sb.z)===B.SCIENCE_BENCH && game._cockpitPrompt) showPrompt(game._cockpitPrompt(sb.x,sb.y,sb.z)); else hidePrompt();
  }else if(game.selBlock && !uiPanel){ const id=game.world.getBlock(game.selBlock.x,game.selBlock.y,game.selBlock.z);
    const map={[B.CHEST]:'[F/RMB] Open chest',[B.FURNACE]:'[F/RMB] Use kiln',[B.BENCH]:'[F/RMB] Craft',[B.DOOR]:'[F/RMB] Toggle door',[B.METAL_DOOR]:'[F/RMB] Open/close hatch',[B.BED]:'[F/RMB] Sleep',[B.BED_FOOT]:'[F/RMB] Sleep'};
    if(id===B.LAUNCHPAD) showPrompt(game.dimension==='planet'?'[F] Board rocket — fly home':'[F] Rocket dashboard');
    else if(id===B.SCIENCE_BENCH && game.world.getMeta(game.selBlock.x,game.selBlock.y,game.selBlock.z) && game.world.getMeta(game.selBlock.x,game.selBlock.y,game.selBlock.z).rkConsole) showPrompt('[F] Rocket console');
    else if(map[id]) showPrompt(map[id]); else hidePrompt();
  } else hidePrompt();
  if(refreshHotbar._t==null)refreshHotbar._t=0; refreshHotbar._t++; if(refreshHotbar._t%15===0) refreshHotbar();
}
function worldName(){ try{ const k=Storage.activeKey(); const w=Storage.listWorlds().find(x=>x.key===k); return (w&&w.name)||'Voxhaven'; }catch(e){ return 'Voxhaven'; } }
function updateTopBar(){
  const wl=$('worldLabel'), bl=$('biomeLabel'); if(!wl||!bl) return;
  if(updateTopBar._n==null) updateTopBar._n=worldName();
  wl.textContent='WORLD: '+updateTopBar._n;
  let biome;
  if(game.dimension==='planet') biome='AETHON';
  else { const px=Math.floor(game.player.pos.x), pz=Math.floor(game.player.pos.z); biome=game.world.biomeName(px,pz); }
  bl.textContent='BIOMES: '+biome;
  // coords + Day N + clock
  const cl=$('coordLabel');
  if(cl){ const p=game.player.pos;
    if(game.day==null) game.day=1;
    if(updateTopBar._lt!=null && game.time < updateTopBar._lt-0.5) game.day++;   // passed midnight → new day
    updateTopBar._lt=game.time;
    const hh=Math.floor(game.time*24), mm=Math.floor((game.time*24-hh)*60);
    cl.textContent=`${Math.floor(p.x)}, ${Math.floor(p.y)}, ${Math.floor(p.z)}  ·  Day ${game.day}  ·  ${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;
  }
}
function updateSurvivalFx(){
  const surv=game.mode==='survival', p=game.player;
  const wr=$('warmthRow'), br=$('breathRow'), fx=$('statusFx'), frost=$('frostFlash');
  // oxygen row — only in space; cyan pips driven by game.oxygen/oxygenMax
  const ox=$('oxygenRow'), showOxy=!!game.inSpace;
  ox.classList.toggle('hidden',!showOxy);
  if(showOxy){ const omax=game.oxygenMax||10, cur=game.oxygen!=null?game.oxygen:omax;
    for(let i=0;i<10;i++){ const v=cur/omax*10-i; ox.children[i].className='pip '+(v>=1?'oxy-full':v>=0.5?'oxy-half':'oxy-empty'); } }
  // warmth row — only shown once you start getting cold, to keep the HUD clean
  const showWarm=surv && p.warmth<p.maxWarmth;
  wr.classList.toggle('hidden',!showWarm);
  if(showWarm) for(let i=0;i<10;i++){ const v=p.warmth-i*2; wr.children[i].className='pip '+(v>=2?'warm-full':v>=1?'warm-half':'warm-empty'); }
  // breath row — only while underwater (air depletes over the 8s drown timer)
  const air=surv?Math.max(0,8-(game._airT||0)):8;
  const showAir=surv && (game._airT||0)>0.1;
  br.classList.toggle('hidden',!showAir);
  if(showAir){ const pips=Math.ceil(air/8*10); for(let i=0;i<10;i++) br.children[i].className='pip '+(i<pips?'air-full':'air-empty'); }
  // frost vignette
  frost.style.opacity = surv ? String((game._frostLevel||0)*0.85) : '0';
  // status text — most urgent environmental warning
  let msg='';
  if(surv){
    if((game._airT||0)>4) msg='Drowning!';
    else if(p.warmth<=0) msg='❄ Freezing!';
    else if(p.warmth<5) msg='❄ Cold';
    else if((game._queasyT||0)>0) msg='Queasy';
  }
  if(msg){ fx.textContent=msg; fx.classList.remove('hidden'); } else fx.classList.add('hidden');
}
let promptOn=false;
function showPrompt(t){ const p=$('interactPrompt'); p.textContent=t; if(!promptOn){ p.classList.add('show'); promptOn=true; } }
function hidePrompt(){ if(promptOn){ $('interactPrompt').classList.remove('show'); promptOn=false; } }
function flashPrompt(t){ const p=$('interactPrompt'); p.textContent=t; p.classList.add('show'); clearTimeout(flashPrompt._t); flashPrompt._t=setTimeout(()=>{ p.classList.remove('show'); promptOn=false; },1600); }
function showItemName(it){ const e=$('itemName'); clearTimeout(showItemName._t);
  if(!it){ e.classList.remove('show'); return; }
  const d=itemDesc(it); e.innerHTML='<b>'+it.name+'</b>'+(d?'<div class="itemNameDesc">'+d+'</div>':''); e.classList.add('show');
}
function flashText(e,t){ const o=e.textContent; e.textContent=t; setTimeout(()=>e.textContent=o,900); }

/* ================= debug overlay ================= */
let fpsAcc=0,fpsN=0,fps=0;
function updateDebug(dt){ fpsAcc+=dt;fpsN++; if(fpsAcc>=0.5){ fps=Math.round(fpsN/fpsAcc); fpsAcc=0;fpsN=0; }
  const p=game.player; const cx=Math.floor(p.pos.x/CHUNK_X),cz=Math.floor(p.pos.z/CHUNK_Z);
  const look=game.selBlock?BLOCKS[game.world.getBlock(game.selBlock.x,game.selBlock.y,game.selBlock.z)].name:'-';
  const hh=Math.floor(game.time*24), mm=Math.floor((game.time*24-hh)*60);
  $('debug').textContent=
`Voxhaven  FPS:${fps}
pos ${p.pos.x.toFixed(1)} ${p.pos.y.toFixed(1)} ${p.pos.z.toFixed(1)}
chunk ${cx},${cz}   biome ${game.world.biomeName(Math.floor(p.pos.x),Math.floor(p.pos.z))}
look ${look}
mobs ${game.mobs.length}   drops ${game.drops.length}
renderDist ${game.renderDist}   seed ${game.world.seed}
mode ${game.mode}   view ${game.viewMode}
day ${game.day}  time ${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;
}

/* ================= slot model (generic move) ================= */
function getSlot(cont,idx){
  if(cont==='inv') return game.player.inv[idx];
  if(cont==='armor') return game.player.armor[idx];
  if(cont==='chest') return game.world.getChest(...chestPos)[idx];
  if(cont==='furnace'){ const f=game.world.getFurnace(...furnacePos); return f[idx]; }
}
function setSlot(cont,idx,val){
  if(cont==='inv') game.player.inv[idx]=val;
  else if(cont==='armor') game.player.armor[idx]=val;
  else if(cont==='chest') game.world.getChest(...chestPos)[idx]=val;
  else if(cont==='furnace'){ const f=game.world.getFurnace(...furnacePos); f[idx]=val; }
}
function maxStack(itemId){ return (ITEMS[itemId]&&ITEMS[itemId].max)||99; }
function equipArmorFromSlot(cont,idx,render=true){
  const cur=getSlot(cont,idx);
  const it=cur&&ITEMS[cur.item];
  if(!it || !it.armorSlot) return false;
  const slot=it.armorSlot;
  const moving=Object.assign({},cur,{count:1});
  const existing=getSlot('armor',slot);
  if((cur.count||1)>1){
    cur.count--;
    setSlot(cont,idx,cur);
    if(existing) game.giveItem(existing.item, existing.count||1);
  } else {
    setSlot(cont,idx,existing||null);
  }
  setSlot('armor',slot,moving);
  Audio.play('click');
  if(render){ renderOpenPanel(); updateDragGhost(); }
  refreshHotbar();
  return true;
}
function clickSlot(cont,idx,evt){
  // shift+click a chest/furnace slot to instantly pull that whole stack into
  // the player inventory, merging into matching stacks first (same logic
  // giveItem already uses for picked-up drops) — no cursor/drag needed
  if(evt && evt.shiftKey && cont!=='inv'){
    const cur=getSlot(cont,idx); if(!cur) return;
    const leftover=game.giveItem(cur.item,cur.count);
    setSlot(cont,idx, leftover>0?{item:cur.item,count:leftover}:null);
    return finishClick();
  }
  // armor slots only accept the matching equipment piece — everything else
  // (placing, splitting, output-take) goes through the generic path below
  if(cont==='armor'){
    const cur=getSlot(cont,idx);
    if(cursor){
      const it=ITEMS[cursor.item]; if(!it.armorSlot || it.armorSlot!==idx) return;
      const swap=cur; setSlot(cont,idx,cursor); cursor=swap;
    } else if(cur){ cursor=cur; setSlot(cont,idx,null); }
    return finishClick();
  }
  const cur=getSlot(cont,idx);
  // output slots are take-only
  const outputOnly=(cont==='furnace'&&idx==='output');
  if(!cursor){ 
    if(cur){ 
      const it=ITEMS[cur.item];
      if(evt && evt.button===2 && it && it.armorSlot) return equipArmorFromSlot(cont,idx,true);
      if(evt&&evt.button===2 && cur.count>1){ const half=Math.ceil(cur.count/2); cursor={item:cur.item,count:half}; cur.count-=half; if(cur.count<=0)setSlot(cont,idx,null); } else { cursor=cur; setSlot(cont,idx,null); } 
    } 
  }
  else {
    if(outputOnly){ if(cur&&cur.item===cursor.item){ cursor.count+=cur.count; setSlot(cont,idx,null);} return finishClick(); }
    if(!cur){ if(evt&&evt.button===2){ setSlot(cont,idx,{item:cursor.item,count:1}); cursor.count--; if(cursor.count<=0)cursor=null; } else { setSlot(cont,idx,cursor); cursor=null; } }
    else if(cur.item===cursor.item){ const m=maxStack(cur.item); const add=Math.min(m-cur.count,cursor.count); cur.count+=add; cursor.count-=add; if(cursor.count<=0)cursor=null; }
    else { setSlot(cont,idx,cursor); cursor=cur; }
  }
  finishClick();
}
function finishClick(){ Audio.play('click'); renderOpenPanel(); refreshHotbar(); updateDragGhost(); }
function returnCursor(){ if(cursor){ game.giveItem(cursor.item,cursor.count); cursor=null; updateDragGhost(); refreshHotbar(); } }
function updateDragGhost(){ const g=$('dragGhost'); if(cursor){ g.classList.remove('hidden'); g.innerHTML=''; const im=el('img'); im.src=iconURL(cursor.item); g.appendChild(im); } else g.classList.add('hidden'); }
addEventListener('mousemove',e=>{ if(cursor){ const g=$('dragGhost'); g.style.left=(e.clientX-20)+'px'; g.style.top=(e.clientY-20)+'px'; } });
// clicking the dimmed backdrop (not the panel itself) while holding a stack:
// on the inventory screen this DISCARDS it (the only intentional way to delete
// items); on chest/furnace/trade screens that would be a surprising, unrecoverable
// loss, so there we hand the carried stack back instead.
for(const ov of document.querySelectorAll('.overlay')) ov.addEventListener('mousedown',e=>{ if(e.target===ov && cursor){ if(ov.id==='inventoryScreen'){ cursor=null; updateDragGhost(); Audio.play('break'); } else { returnCursor(); } } });

/* slot DOM builder */
function makeCell(cont,idx){ const c=el('div','cell'); const s=getSlot(cont,idx);
  if(s){ const im=el('img'); im.src=iconURL(s.item); c.appendChild(im); if(s.count>1) c.appendChild(el('span','count',s.count));
    const it=ITEMS[s.item]; if(it.dur){ const d=s.dur==null?it.dur:s.dur; const bar=el('div','durbar'); const i=el('i'); const f=d/it.dur; i.style.width=(f*100)+'%'; i.style.background=f>0.5?'#5ec46a':f>0.25?'#d9a441':'#cf4b4b'; bar.appendChild(i); c.appendChild(bar); }
    c.onmouseenter=ev=>showTip(ev,it); c.onmouseleave=hideTip;
  }
  c.onmousedown=ev=>{ ev.preventDefault(); clickSlot(cont,idx,ev); };
  return c;
}
function fillGrid(node,cont,from,to){ node.innerHTML=''; for(let i=from;i<to;i++) node.appendChild(makeCell(cont,i)); }

/* ================= tooltip ================= */
function showTip(ev,it){ const t=$('tooltip'); let d=''; if(it.fishes)d='Fishing rod · use anywhere for catches'; else if(it.tool)d='Tool · tier '+it.tier+(it.dmg?' · '+it.dmg+' dmg':''); else if(it.food)d='Food · +'+it.food+' stamina'; else if(it.fuel)d='Fuel'; else if(it.blockId)d='Placeable block'; else if(it.smelt)d='Smeltable';
  t.innerHTML='<div class="tname">'+it.name+'</div>'+(d?'<div class="tdesc">'+d+'</div>':''); t.classList.remove('hidden'); moveTip(ev);
}
function moveTip(ev){ const t=$('tooltip'); t.style.left=(ev.clientX+14)+'px'; t.style.top=(ev.clientY+14)+'px'; }
function hideTip(){ $('tooltip').classList.add('hidden'); }
addEventListener('mousemove',ev=>{ if(!$('tooltip').classList.contains('hidden')) moveTip(ev); });

/* ================= panels ================= */
let invTab='craft';
function openInventory(station){ craftStation=station; uiPanel='inv'; invTab = (game.mode==='creative' ? 'blocks' : 'craft'); document.exitPointerLock();
  $('craftStation').textContent=station==='bench'?'(Bench)':station==='science'?'(Science Lab)':''; $('invTitle').textContent=station==='bench'?'Crafting Bench':station==='science'?'Science Lab':'Inventory';
  $('tabBlocks').classList.toggle('hidden', game.mode!=='creative');
  $('tabGear').classList.toggle('hidden', game.mode!=='creative');
  $('tabFood').classList.toggle('hidden', game.mode!=='creative');
  $('inventoryScreen').classList.remove('hidden'); renderInventory();
}
function setInvTab(tab){ 
  if (game.mode !== 'creative' && (tab === 'blocks' || tab === 'gear' || tab === 'food')) tab = 'craft';
  invTab=tab; $('tabCraft').classList.toggle('sel',tab==='craft'); $('tabBlocks').classList.toggle('sel',tab==='blocks'); $('tabGear').classList.toggle('sel',tab==='gear'); $('tabFood').classList.toggle('sel',tab==='food'); $('tabGuide').classList.toggle('sel',tab==='guide');
  const grid=(tab==='blocks'||tab==='gear'||tab==='food');
  $('recipeList').classList.toggle('hidden',grid||tab==='guide');
  $('blocksList').classList.toggle('hidden',!grid);
  $('guideList').classList.toggle('hidden',tab!=='guide');
  $('guideSearch').classList.toggle('hidden',tab!=='guide');
  $('invRightLabel').classList.toggle('hidden',grid||tab==='guide'); renderInventory();
}
$('tabCraft').onclick=()=>setInvTab('craft');
$('tabBlocks').onclick=()=>setInvTab('blocks');
$('tabGear').onclick=()=>setInvTab('gear');
$('tabFood').onclick=()=>setInvTab('food');
$('tabGuide').onclick=()=>setInvTab('guide');
$('guideSearch').oninput=()=>renderGuideTab();
// (legacy top-right corner buttons removed — replaced by the bottom action menu; Map opens with [M])
// ---------- bottom action menu ----------
function uiReady(){ return game && running && !uiPanel && !game.paused && !game.dead; }
$('btnActInv').onclick=()=>{ if(uiReady()) openInventory(null); };
$('btnActMap').onclick=()=>{ if(game && running && !game.paused && !game.dead){ if(uiPanel==='map') closePanel(); else if(!uiPanel) openMap(); } };
$('btnStarMap').onclick=()=>{ if(game && running && !game.paused && !game.dead) openStarMap(); };
function openStarMap(){ if(uiPanel) closePanel(); uiPanel='starmap'; document.exitPointerLock();
  $('starDim').textContent=game.dimension==='planet'?'Aethon':'Overworld';
  $('starOxy').textContent=(game.oxygen!=null?Math.round(game.oxygen):game.oxygenMax||10)+' / '+(game.oxygenMax||10);
  $('starMapScreen').classList.remove('hidden');
}
// sync the key badges on the action buttons with the (rebindable) keybinds
function updateActionHotkeys(){
  const set=(id,code)=>{ const k=$(id); if(k) k.textContent=keyLabel(code); };
  set('kbInv',KEYBINDS.inventory); set('kbMap',KEYBINDS.map); set('kbStar',KEYBINDS.starmap);
}
function renderInventory(){ 
  if (game.mode !== 'creative' && (invTab === 'blocks' || invTab === 'gear' || invTab === 'food')) invTab = 'craft';
  fillGrid($('invGrid'),'inv',9,36); fillGrid($('invHotbar'),'inv',0,9); renderArmorSlots();
  if(invTab==='blocks') renderBlocksTab(); else if(invTab==='gear') renderGearTab(); else if(invTab==='food') renderFoodTab(); else if(invTab==='guide') renderGuideTab(); else renderRecipes();
}
function renderArmorSlots(){ const node=$('armorSlots'); node.innerHTML='';
  for(const slot of ['head','chest','legs','feet']) node.appendChild(makeCell('armor',slot));
}
// ---------- item guide: every "use" line is derived live from the actual data
// tables (RECIPES/SMELT/FUEL/TRADES/MOB_DEF), so it can never drift out of
// sync with a future item/recipe/mob change the way a hand-written wiki would.
function itemUses(id){
  const it=ITEMS[id]; const uses=[];
  if(it.food) uses.push('Food: +'+it.food+' stamina'+(it.raw?' (raw — may cause queasiness; cook it first)':''));
  if(it.fuel) uses.push('Fuel: burns '+it.fuel+'s in a kiln');
  if(typeof FUEL!=='undefined' && FUEL[id]) uses.push('Fuel: burns '+FUEL[id]+'s in a kiln');
  if(it.tool) uses.push('Tool ('+it.tool+'): tier '+it.tier+', '+(it.dmg||1)+' dmg, '+it.speed+'x speed, '+it.dur+' durability');
  if(it.fishes) uses.push('Fishing rod: right-click anywhere to cast; wait for bite then click to reel');
  if(it.blockId) uses.push('Placeable block');
  if(it.smelt) uses.push('Smelts into '+(ITEMS[it.smelt]?ITEMS[it.smelt].name:it.smelt));
  if(typeof SMELT!=='undefined' && SMELT[id]) uses.push('Smelts into '+(ITEMS[SMELT[id].out]?ITEMS[SMELT[id].out].name:SMELT[id].out)+' ('+SMELT[id].t+'s)');
  if(typeof RECIPES!=='undefined'){
    const craftsTo=[...new Set(RECIPES.filter(r=>r.need.some(n=>n[0]===id)).map(r=>ITEMS[r.out[0]]?ITEMS[r.out[0]].name:r.out[0]))];
    if(craftsTo.length) uses.push('Used to craft: '+craftsTo.join(', '));
    const craftedFrom=RECIPES.filter(r=>r.out[0]===id);
    if(craftedFrom.length) uses.push('Crafted from: '+craftedFrom.map(r=>r.need.map(n=>(ITEMS[n[0]]?ITEMS[n[0]].name:n[0])+' x'+n[1]).join(' + ')).join('  OR  '));
  }
  if(typeof TRADES!=='undefined'){
    const give=TRADES.filter(t=>t.give[0]===id);
    if(give.length) uses.push('Trade with settlers: give '+give.map(t=>t.give[1]+' for '+t.give[1]+'x '+(ITEMS[t.get[0]]?ITEMS[t.get[0]].name:t.get[0])).join(', ').replace(/(\d+) for \1x/,'$1x ->'));
    if(TRADES.some(t=>t.get[0]===id)) uses.push('Obtainable from settler trades');
  }
  if(typeof MOB_DEF!=='undefined'){
    const droppedBy=Object.entries(MOB_DEF).filter(([,d])=>d.drop&&d.drop.some(dr=>dr[0]===id)).map(([k])=>k);
    if(droppedBy.length) uses.push('Dropped by: '+droppedBy.join(', '));
  }
  if(!uses.length) uses.push('No crafting use yet — collect for now');
  return uses;
}
function renderGuideTab(){ const list=$('guideList'); list.innerHTML='';
  const q=($('guideSearch').value||'').toLowerCase();
  for(const it of Object.values(ITEMS)){
    if(q && !it.name.toLowerCase().includes(q)) continue;
    const row=el('div','recipe');
    const im=el('img'); im.src=iconURL(it.id); im.style.cssText='width:32px;height:32px;image-rendering:pixelated;flex-shrink:0';
    row.appendChild(im);
    const info=el('div','rinfo'); info.innerHTML='<b>'+it.name+'</b><div class="rcost">'+itemUses(it.id).join(' · ')+'</div>';
    row.appendChild(info); list.appendChild(row);
  }
}
function renderBlocksTab(){ const list=$('blocksList'); list.innerHTML='';
  const getCat = (id, name) => {
    name = ((id||'')+' '+(name||'')).toLowerCase();   // match on BOTH id and display name
    if (['torch','lantern','lamp','glowstone','beacon','glow'].some(k=>name.includes(k))) return 'Lighting';
    if (['rocket','launch','metal hatch','metal_door','habitat','hab_','reinforced glass','science','fuel tank','fuel_tank','starship','nose cone','hatch'].some(k=>name.includes(k))) return 'Rocket';
    if (['alien','aethon','voidcrystal','mars','regolith','permafrost','asteroid','solar','battery'].some(k=>name.includes(k))) return 'Space';
    if (['seed','potato','carrot','wheat','tomato','beetroot'].some(k=>name.includes(k))) return 'Farming';
    if (['tallgrass','flower','mushroom','cactus','leaves','sugarcane','sugar_cane'].some(k=>name.includes(k))) return 'Plants';
    if (['chest','bench','furnace','door','ladder','fence','stair','slab','bed','bookshelf','rooftile','bed_foot','banner','carpet','path','window','potted'].some(k=>name.includes(k))) return 'Housing & Decor';
    if (['plank','cobble','brick','stonebrick','sandstone','glass','wool','pumpkin','melon','terracotta','basalt','obsidian','smooth','cut_','coal_block','packed','frosted','polished','dark_plank','chiseled','mossy','cracked','hay','quartz','netherbrick','cake'].some(k=>name.includes(k))) return 'Building';
    if (['grass','dirt','stone','sand','gravel','log','nether','mycel','soul','ore','deep','dark','clay','snow','ice','water','searock'].some(k=>name.includes(k))) return 'Natural';
    return 'Other';
  };
  const cats = ['Natural','Building','Housing & Decor','Lighting','Rocket','Space','Farming','Plants','Other'];
  const grouped = {};
  cats.forEach(c => grouped[c]=[]);
  for(const it of Object.values(ITEMS)){
    if(!it.blockId) continue;
    const cat = getCat(it.id, it.name);
    grouped[cat].push(it);
  }
  cats.forEach(cat => {
    if(!grouped[cat].length) return;
    const h=el('div','catHead'); h.textContent=cat; list.appendChild(h);
    grouped[cat].forEach(it => {
      const cell=el('div','cell'); const im=el('img'); im.src=iconURL(it.id); im.style.cssText='width:32px;height:32px;image-rendering:pixelated'; cell.appendChild(im);
      cell.onmouseenter=ev=>showTip(ev,it); cell.onmouseleave=hideTip;
      if(game.mode==='creative') cell.onclick=()=>{ cursor={item:it.id,count:64}; updateDragGhost(); Audio.play('click'); };
      list.appendChild(cell);
    });
  });
}
function renderGearTab(){ const list=$('blocksList'); list.innerHTML='';
  const groups = {
    'Tools': it => it.tool && !it.id.includes('sword') && !it.shoots,
    'Weapons': it => it.shoots || it.id.includes('sword'),
    'Armor': it => it.armorSlot,
    'Space & Rocket': it => ['space_shard','alien_alloy','circuit','rocket_fuel','oxygen_tank','engine_core','guidance_computer','oxidizer_cell','battery','solar_panel','launchpad','fuel_tank','rocket_hull','rocket_nose','rocket_fin','science_bench'].includes(it.id),
    'Misc': it => it.fishes || it.effect || it.id.includes('diamond') || it.id.includes('fiber') || it.id.includes('string') || it.id.includes('gel') || it.id.includes('leather')
  };
  for(const [cat, filter] of Object.entries(groups)){
    const h=el('div','catHead'); h.textContent=cat; list.appendChild(h);
    for(const it of Object.values(ITEMS)){ if(!filter(it)) continue;
      const cell=el('div','cell'); const im=el('img'); im.src=iconURL(it.id); im.style.cssText='width:32px;height:32px;image-rendering:pixelated'; cell.appendChild(im);
      cell.onmouseenter=ev=>showTip(ev,it); cell.onmouseleave=hideTip;
      cell.onmousedown = (ev) => {
        ev.preventDefault();
        if (ev.button === 2 && it.armorSlot) {
          // right click armor in gear tab to equip directly
          const slot = it.armorSlot;
          const existing = game.player.armor[slot];
          if (existing) {
            game.giveItem(existing.item, 1);
          }
          game.player.armor[slot] = {item: it.id, count: 1};
          Audio.play('click');
          renderOpenPanel();
          refreshHotbar();
          return;
        }
        if(game.mode==='creative') {
          cursor={item:it.id,count: ((it.max&&it.max>1)?Math.min(it.max,64):1)};
          updateDragGhost();
          Audio.play('click');
        }
      };
      list.appendChild(cell);
    }
  }
}
function renderFoodTab(){ const list=$('blocksList'); list.innerHTML='';
  const h=el('div','catHead'); h.textContent='Food'; list.appendChild(h);
  for(const it of Object.values(ITEMS)){ if(!it.food || it.blockId) continue;
    const cell=el('div','cell'); const im=el('img'); im.src=iconURL(it.id); im.style.cssText='width:32px;height:32px;image-rendering:pixelated'; cell.appendChild(im);
    cell.onmouseenter=ev=>showTip(ev,it); cell.onmouseleave=hideTip;
    if(game.mode==='creative') cell.onclick=()=>{ cursor={item:it.id,count:64}; updateDragGhost(); Audio.play('click'); };
    list.appendChild(cell);
  }
}
function renderRecipes(){ const list=$('recipeList'); list.innerHTML='';
  let rs=game.recipesFor(craftStation==='bench'?'bench':craftStation==='science'?'science':null);
  for(const r of rs){ const can=game.canCraft(r); const row=el('div','recipe'+(can?'':' no'));
    const out=ITEMS[r.out[0]]; const im=el('img'); im.src=iconURL(r.out[0]); im.style.cssText='width:32px;height:32px;image-rendering:pixelated'; row.appendChild(im);
    const info=el('div','rinfo'); info.innerHTML='<b>'+out.name+(r.out[1]>1?' ×'+r.out[1]:'')+'</b><div class="rcost">'+r.need.map(n=>(ITEMS[n[0]].name+' ×'+n[1]+(game.countItem(n[0])>=n[1]?'':' ✗'))).join(', ')+'</div>'; row.appendChild(info);
    row.onclick=()=>{ if(game.craft(r)){ renderInventory(); refreshHotbar(); } };
    list.appendChild(row);
  }
}
function openChest(){ uiPanel='chest'; document.exitPointerLock(); $('chestScreen').classList.remove('hidden'); renderChest(); }
function renderChest(){ const ch=game.world.getChest(...chestPos); fillGrid($('chestGrid'),'chest',0,ch.length); fillGrid($('chestInvGrid'),'inv',0,36); }
function openFurnace(){ uiPanel='furnace'; document.exitPointerLock(); $('furnaceScreen').classList.remove('hidden'); renderFurnace(); }
function renderFurnace(){ const f=game.world.getFurnace(...furnacePos);
  $('furInput').innerHTML=''; $('furInput').appendChild(makeCell('furnace','input'));
  $('furFuel').innerHTML=''; $('furFuel').appendChild(makeCell('furnace','fuel'));
  $('furOutput').innerHTML=''; $('furOutput').appendChild(makeCell('furnace','output'));
  fillGrid($('furInvGrid'),'inv',0,36);
  $('furFlame').classList.toggle('lit',f.burn>0);
}
function openTrade(m){ tradeMob=m; uiPanel='trade'; document.exitPointerLock(); $('tradeScreen').classList.remove('hidden'); renderTrade(); }
function renderTrade(){ const list=$('tradeList'); list.innerHTML='';
  game.getTrades().forEach((t,i)=>{ const row=el('div','trade'+(t.can?'':' no'));
    const gc=el('img'),rc=el('img'); gc.src=iconURL(t.t.give[0]); rc.src=iconURL(t.t.get[0]);
    gc.style.cssText=rc.style.cssText='width:30px;height:30px;image-rendering:pixelated';
    row.appendChild(gc); row.appendChild(el('span',null,'×'+t.t.give[1]+'&nbsp;&nbsp;→&nbsp;&nbsp;')); row.appendChild(rc); row.appendChild(el('span',null,'×'+t.t.get[1]+'&nbsp;&nbsp;'+ITEMS[t.t.get[0]].name));
    row.onclick=()=>{ if(game.doTrade(i)) renderTrade(); };
    list.appendChild(row);
  });
}
function renderOpenPanel(){ if(uiPanel==='inv')renderInventory(); else if(uiPanel==='chest')renderChest(); else if(uiPanel==='furnace')renderFurnace(); else if(uiPanel==='trade')renderTrade(); else if(uiPanel==='map')renderMap(); }
function closePanel(){ returnCursor(); hideTip();
  if(uiPanel==='chest' && chestPos && game) game.setChestOpen(...chestPos,false);
  ['inventoryScreen','chestScreen','furnaceScreen','tradeScreen','mapScreen','starMapScreen'].forEach(id=>$(id).classList.add('hidden'));
  uiPanel=null; chestPos=null; furnacePos=null; tradeMob=null; doSave();  // autosave on container close
  requestLock();
}

// ---------- map ----------
// samples the world's deterministic biome/height functions directly (no
// chunk-loading needed) to paint a top-down view centered on the player
function openMap(){ uiPanel='map'; document.exitPointerLock(); $('mapScreen').classList.remove('hidden'); renderMap(); }
function renderMap(){
  const cv=$('mapCanvas'), ctx=cv.getContext('2d'); const S=cv.width;
  const px=game.player.pos.x, pz=game.player.pos.z;
  const range=160;                       // blocks shown edge-to-edge
  const step=Math.max(1, Math.round(range*2/S));
  for(let sy=0; sy<S; sy+=step) for(let sx=0; sx<S; sx+=step){
    const wx=Math.round(px + (sx-S/2)/S*range*2), wz=Math.round(pz + (sy-S/2)/S*range*2);
    const h=game.world.heightAt(wx,wz);
    let color;
    if(h<SEA_LEVEL) color='#2f5d8a';                       // water
    else { const b=game.world.biomeAt(wx,wz,h); color='#'+b.color.toString(16).padStart(6,'0'); }
    ctx.fillStyle=color; ctx.fillRect(sx,sy,step,step);
  }
  // villages discovered so far
  ctx.fillStyle='#f4d35e';
  for(const v of game.world.villages){
    const sx=S/2+(v.x-px)/(range*2)*S, sy=S/2+(v.z-pz)/(range*2)*S;
    if(sx>=0&&sx<S&&sy>=0&&sy<S){ ctx.beginPath(); ctx.arc(sx,sy,4,0,7); ctx.fill(); }
  }
  // player marker — arrow pointing in facing direction
  ctx.save(); ctx.translate(S/2,S/2); ctx.rotate(game.player.yaw);
  ctx.fillStyle='#fff'; ctx.beginPath(); ctx.moveTo(0,-7); ctx.lineTo(5,6); ctx.lineTo(-5,6); ctx.closePath(); ctx.fill();
  ctx.restore();
  $('mapLegend').innerHTML='Yellow dot = village &nbsp;·&nbsp; '+Math.round(range*2)+' blocks across &nbsp;·&nbsp; centered on you';
}

// keep furnace UI live while open
setInterval(()=>{ if(uiPanel==='furnace') renderFurnace(); },500);

if(document.readyState!=='loading') boot(); else addEventListener('DOMContentLoaded',boot);
})();
