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
let settingsHome=null;
let uiPanel=null;            // 'inv'|'chest'|'furnace'|'trade'|null
let cursor=null;             // held stack while moving items {item,count}
let chestPos=null, furnacePos=null, craftStation=null, tradeMob=null;
let debugOn=false, lastSel=-1;
function showRuntimeError(err, context){
  const box=$('runtimeError');
  const detail=(err&&err.stack)||String(err||'Unknown error');
  console.error('[Voxhaven '+context+'] '+detail);
  if(box && (location.hostname==='localhost'||location.hostname==='127.0.0.1')){ box.textContent=context+' failed\n'+detail; box.classList.remove('hidden'); }
  if(game) game.paused=true;
}
document.addEventListener('voxhaven:context',e=>{
  const box=$('runtimeError'); if(!box) return;
  if(e.detail&&e.detail.lost){ box.textContent='Graphics connection interrupted. Recovering...'; box.classList.remove('hidden'); }
  else { box.textContent=''; box.classList.add('hidden'); }
});

// settings
const SETTINGS_DEFAULTS={ rd:4, sens:1.0, vol:0.6, gfx:'med', fx:'med', autoJump:true, adaptive:true, invertY:false, reducedMotion:false, highContrast:false, textScale:'normal', colorblind:'none' };
function loadSettings(){
  let s={}; try{ s=JSON.parse(localStorage.getItem('voxhaven_settings')||'{}')||{}; }catch(e){}
  s=Object.assign({},SETTINGS_DEFAULTS,s);
  s.rd=Math.round(clampN(+s.rd||4,2,8)); s.sens=clampN(+s.sens||1,0.2,2.5); s.vol=clampN(+s.vol||0,0,1);
  if(!['low','med','high'].includes(s.gfx)) s.gfx='med'; if(!['off','low','med','high'].includes(s.fx)) s.fx='med';
  s.autoJump=s.autoJump!==false; s.adaptive=s.adaptive!==false; s.invertY=!!s.invertY; s.reducedMotion=!!s.reducedMotion; s.highContrast=!!s.highContrast; if(!['normal','large'].includes(s.textScale)) s.textScale='normal'; if(!['none','deuteranopia','protanopia','tritanopia'].includes(s.colorblind)) s.colorblind='none'; return s;
}
function saveSettings(){ try{ localStorage.setItem('voxhaven_settings',JSON.stringify(settings)); }catch(e){} }
const settings=loadSettings();
function applyAccessibility(){
  document.body.classList.toggle('vox-reduced-motion',settings.reducedMotion);
  document.body.classList.toggle('vox-high-contrast',settings.highContrast);
  document.body.classList.toggle('vox-text-large',settings.textScale==='large');
  for(const mode of ['deuteranopia','protanopia','tritanopia']) document.body.classList.toggle('vox-color-'+mode,settings.colorblind===mode);
  if(game){ game.invertY=settings.invertY; game.reducedMotion=settings.reducedMotion; }
}
function applyEmpireSettings(s){
  if(!s||typeof s!=='object') return;
  const a=s.audio||{}, v=s.video||{}, c=s.controls||{}, x=s.accessibility||{};
  if(typeof a.master==='number') settings.vol=a.muted?0:clampN(a.master,0,1);
  if(typeof c.mouseSensitivity==='number') settings.sens=clampN(c.mouseSensitivity,0.2,2.5);
  if(typeof c.invertY==='boolean') settings.invertY=c.invertY;
  if(['low','med','high'].includes(v.quality)) settings.gfx=v.quality;
  else if(v.quality==='medium') settings.gfx='med';
  if(typeof x.reducedMotion==='boolean') settings.reducedMotion=x.reducedMotion;
  if(typeof x.highContrast==='boolean') settings.highContrast=x.highContrast;
  if(typeof x.textScale==='number') settings.textScale=x.textScale>1.08?'large':'normal';
  if(['none','deuteranopia','protanopia','tritanopia'].includes(x.colorblindMode)) settings.colorblind=x.colorblindMode;
  Audio.vol=settings.vol; if(game){ game.sens=settings.sens; if(game.applyGraphics) game.applyGraphics(settings.gfx); }
  const set=(id,prop,value)=>{ const n=$(id); if(n) n[prop]=value; };
  set('volSlider','value',Math.round(settings.vol*100)); set('volVal','textContent',Math.round(settings.vol*100)); set('msSlider','value',settings.sens); set('msVal','textContent',settings.sens.toFixed(1)); set('gfxSel','value',settings.gfx);
  set('invertYChk','checked',settings.invertY); set('reducedMotionChk','checked',settings.reducedMotion); set('highContrastChk','checked',settings.highContrast); set('textScaleSel','value',settings.textScale);
  set('colorblindSel','value',settings.colorblind);
  applyAccessibility(); saveSettings();
}
window.__voxhavenApplyEmpireSettings=applyEmpireSettings;
let selectedMode='survival';

// ---------- rebindable controls ----------
const KEY_LABELS={ forward:'Move Forward', back:'Move Back', left:'Move Left', right:'Move Right', jump:'Jump', sprint:'Sprint', crouch:'Crouch / Fly Down', inventory:'Inventory / Craft', build:'Build Menu', starmap:'Star Map', interact:'Interact', drop:'Drop Item', debug:'Debug Overlay', viewToggle:'Toggle View', map:'Open World Map', rotate:'Rotate Placement', rocketBoard:'Board Rocket', rocketAbort:'Abort Launch' };
const DEFAULT_KEYS={ forward:'KeyW', back:'KeyS', left:'KeyA', right:'KeyD', jump:'Space', sprint:'ShiftLeft', crouch:'KeyC', inventory:'KeyE', build:'KeyB', starmap:'KeyN', interact:'KeyF', drop:'KeyQ', debug:'KeyR', viewToggle:'KeyV', map:'KeyM', rotate:'KeyT', rocketBoard:'KeyL', rocketAbort:'KeyX' };
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
  const action=listeningFor, oldCode=KEYBINDS[action], conflict=Object.keys(KEYBINDS).find(a=>a!==action&&KEYBINDS[a]===e.code);
  if(conflict) KEYBINDS[conflict]=oldCode;
  KEYBINDS[action]=e.code; saveKeybinds(); listeningFor=null; renderKeybindList(); if(typeof updateActionHotkeys==='function') updateActionHotkeys();
},true);

// ---------- icon url cache ----------
const iconCache={};
function iconURL(itemId){ if(!iconCache[itemId]){ iconCache[itemId]=game.iconCanvas(itemId).toDataURL(); } return iconCache[itemId]; }

function drawMenuBackdrop(){
  const c=$('menuBackdrop'); if(!c) return; c.width=960; c.height=540;
  const x=c.getContext('2d'), W=c.width,H=c.height;
  const sky=x.createLinearGradient(0,0,0,H); sky.addColorStop(0,'#9dc9e4'); sky.addColorStop(.55,'#d8e3d7'); sky.addColorStop(1,'#54714a'); x.fillStyle=sky;x.fillRect(0,0,W,H);
  const cloud=(cx,cy,s)=>{x.fillStyle='rgba(247,247,235,.78)'; for(const [dx,dy,w,h] of [[0,10,70,18],[16,0,42,24],[50,7,38,20],[-20,14,34,14]])x.fillRect(cx+dx*s,cy+dy*s,w*s,h*s);};
  cloud(120,62,1);cloud(690,45,.85);cloud(420,105,.55);
  x.fillStyle='#6d7e76';x.beginPath();x.moveTo(0,286);x.lineTo(160,202);x.lineTo(270,250);x.lineTo(430,142);x.lineTo(610,238);x.lineTo(760,175);x.lineTo(960,270);x.lineTo(960,540);x.lineTo(0,540);x.fill();
  x.fillStyle='#54704b';x.beginPath();x.moveTo(0,318);x.quadraticCurveTo(180,225,350,315);x.quadraticCurveTo(540,205,720,312);x.quadraticCurveTo(840,245,960,300);x.lineTo(960,540);x.lineTo(0,540);x.fill();
  x.fillStyle='#4b887b';x.beginPath();x.moveTo(390,540);x.quadraticCurveTo(455,420,540,354);x.quadraticCurveTo(610,310,676,288);x.quadraticCurveTo(595,365,566,540);x.fill();
  let seed=19373; const rnd=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  const tree=(px,py,s,far)=>{x.fillStyle=far?'#5c4934':'#4c3828';x.fillRect(px-5*s,py-48*s,10*s,52*s);const cols=far?['#4e7143','#5e8249','#42623b']:['#315c33','#47793b','#5f8e43'];for(let i=0;i<13;i++){x.fillStyle=cols[i%cols.length];const q=(8+rnd()*12)*s;x.fillRect(px+(rnd()-.5)*42*s-q/2,py-(55+rnd()*42)*s-q/2,q,q);}};
  for(let i=0;i<36;i++){const py=280+rnd()*180,s=.45+(py-260)/250;tree(rnd()*W,py,s,true);}
  x.fillStyle='#6e7367';x.fillRect(458,176,48,116);x.fillStyle='#8a8e80';x.fillRect(450,170,64,14);x.fillRect(465,130,34,44);x.fillStyle='#4c4034';x.fillRect(473,194,18,32);x.fillStyle='#726252';x.fillRect(470,115,24,18);x.fillRect(477,92,10,26);
  for(let i=0;i<18;i++){const py=380+rnd()*170,s=.8+(py-370)/160;tree(rnd()*W,py,s,false);}
  const fg=x.createRadialGradient(W/2,H*.48,80,W/2,H*.5,600);fg.addColorStop(.45,'rgba(0,0,0,0)');fg.addColorStop(1,'rgba(3,9,6,.72)');x.fillStyle=fg;x.fillRect(0,0,W,H);
}

/* ================= boot ================= */
function boot(){
  buildAtlas();   // build texture atlas once
  drawMenuBackdrop(); addEventListener('resize',drawMenuBackdrop);
  loadKeybinds(); renderKeybindList();
  settingsHome=$('settings').parentElement;
  // settings menu wiring
  $('rdSlider').value=settings.rd; $('rdVal').textContent=settings.rd;
  $('msSlider').value=settings.sens; $('msVal').textContent=settings.sens.toFixed(1);
  $('volSlider').value=Math.round(settings.vol*100); $('volVal').textContent=Math.round(settings.vol*100);
  $('gfxSel').value=settings.gfx; $('fxSel').value=settings.fx; $('autoJumpChk').checked=settings.autoJump; $('adaptiveChk').checked=settings.adaptive;
  $('invertYChk').checked=settings.invertY; $('reducedMotionChk').checked=settings.reducedMotion; $('highContrastChk').checked=settings.highContrast; $('textScaleSel').value=settings.textScale; $('colorblindSel').value=settings.colorblind; applyAccessibility();
  $('rdSlider').oninput=e=>{ settings.rd=+e.target.value; $('rdVal').textContent=settings.rd; if(game)game.renderDist=settings.rd; saveSettings(); };
  $('msSlider').oninput=e=>{ settings.sens=+e.target.value; $('msVal').textContent=settings.sens.toFixed(1); if(game)game.sens=settings.sens; saveSettings(); };
  $('volSlider').oninput=e=>{ settings.vol=+e.target.value/100; $('volVal').textContent=e.target.value; Audio.vol=settings.vol; saveSettings(); };
  $('gfxSel').onchange=e=>{ settings.gfx=e.target.value; if(game&&game.applyGraphics) game.applyGraphics(settings.gfx); saveSettings(); };
  $('fxSel').onchange=e=>{ settings.fx=e.target.value; if(game) game.fxQuality=settings.fx; saveSettings(); };
  $('autoJumpChk').onchange=e=>{ settings.autoJump=e.target.checked; if(game&&game.player) game.player.autoJump=settings.autoJump; saveSettings(); };
  $('adaptiveChk').onchange=e=>{ settings.adaptive=e.target.checked; if(!settings.adaptive&&game&&game.setAdaptiveScale) game.setAdaptiveScale(1); resetAdaptiveQuality(); saveSettings(); };
  $('invertYChk').onchange=e=>{ settings.invertY=e.target.checked; applyAccessibility(); saveSettings(); };
  $('reducedMotionChk').onchange=e=>{ settings.reducedMotion=e.target.checked; applyAccessibility(); saveSettings(); };
  $('highContrastChk').onchange=e=>{ settings.highContrast=e.target.checked; applyAccessibility(); saveSettings(); };
  $('textScaleSel').onchange=e=>{ settings.textScale=e.target.value; applyAccessibility(); saveSettings(); };
  $('colorblindSel').onchange=e=>{ settings.colorblind=e.target.value; applyAccessibility(); saveSettings(); };
  $('btnSettings').onclick=()=>{ if($('settings').parentElement!==settingsHome) settingsHome.appendChild($('settings')); settingsHome.classList.add('settings-open'); $('mainMenuButtons').classList.add('hidden'); $('settings').classList.remove('hidden'); $('settings').scrollTop=0; setTimeout(()=>$('rdSlider').focus(),0); };
  $('btnSettingsBack').onclick=()=>{ const fromPause=$('settings').parentElement===$('pauseScreen'); $('settings').classList.add('hidden'); settingsHome&&settingsHome.classList.remove('settings-open'); $('pauseScreen').classList.remove('settings-open'); if($('settings').parentElement===settingsHome) $('mainMenuButtons').classList.remove('hidden'); setTimeout(()=>(fromPause?$('btnPauseSettings'):$('btnSettings')).focus(),0); };
  $('btnResetKeys').onclick=()=>{ KEYBINDS=Object.assign({},DEFAULT_KEYS); saveKeybinds(); renderKeybindList(); updateActionHotkeys(); };

  // game mode selector (start menu)
  document.querySelectorAll('#modeSelect .modeBtn').forEach(b=>{
    b.onclick=()=>{ selectedMode=b.dataset.mode; document.querySelectorAll('#modeSelect .modeBtn').forEach(x=>x.classList.toggle('sel',x===b)); };
  });

  // "New World" only reveals the name/seed/mode picker; mode is chosen up
  // front and locked once the world starts (no in-game mode switching).
  $('btnNew').onclick=()=>{ $('mainMenuButtons').classList.add('hidden'); $('newWorldPanel').classList.remove('hidden'); setTimeout(()=>$('worldNameInput').focus(),0); };
  $('btnBackNew').onclick=()=>{ $('newWorldPanel').classList.add('hidden'); $('mainMenuButtons').classList.remove('hidden'); setTimeout(()=>$('btnNew').focus(),0); };
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
  $('btnWorlds').onclick=()=>{ renderWorldList(); $('startScreen').classList.add('hidden'); $('worldListScreen').classList.remove('hidden'); setTimeout(()=>(document.querySelector('#worldList button')||$('btnWorldsBack')).focus(),0); };
  $('btnWorldsBack').onclick=()=>{ $('worldListScreen').classList.add('hidden'); $('startScreen').classList.remove('hidden'); setTimeout(()=>$('btnWorlds').focus(),0); };

  // pause menu
  $('btnResume').onclick=resume;
  $('btnSave').onclick=()=>{ doSave(); flashText($('loadtext'),'Saved'); };
  $('btnPauseSettings').onclick=()=>{ const box=$('settings'); if(box.parentElement!==$('pauseScreen')) $('pauseScreen').appendChild(box); $('pauseScreen').classList.add('settings-open'); box.classList.remove('hidden'); box.scrollTop=0; };
  $('btnQuit').onclick=quitToMenu;
  function respawnPlayer(){
    if(!game || !game.dead) return;
    try{ game.respawn(); $('deathScreen').classList.add('hidden'); requestLock(); }
    catch(err){ showRuntimeError(err,'Respawn'); }
  }
  $('btnRespawn').onclick=respawnPlayer;
  addEventListener('keydown',e=>{ if(game&&game.dead&&(e.code==='Enter'||e.code==='Space')){ e.preventDefault(); respawnPlayer(); } });
  $('btnToggleView').onclick=()=>{ game.toggleView(); updateModeViewLabels(); };
  for(const b of document.querySelectorAll('#timeRow .timeBtns button')) b.onclick=()=>{ game.time=parseFloat(b.dataset.t); };

  // chat + cheats at bottom right
  const chatMsgs = $('chatMessages');
  const chatIn = $('chatInput');
  function addChat(msg, isCmd){ 
    const d=el('div', isCmd?'msg cmd':'msg', msg); 
    chatMsgs.appendChild(d);
    while(chatMsgs.children.length>40) chatMsgs.removeChild(chatMsgs.firstElementChild);
    chatMsgs.scrollTop=chatMsgs.scrollHeight; 
    const chat=$('chat'); chat.classList.add('recent'); clearTimeout(addChat._fade);
    addChat._fade=setTimeout(()=>chat.classList.remove('recent'),6000);
  }
  chatIn.addEventListener('keydown', e=>{
    if(e.key==='Enter'){
      const v=chatIn.value.trim(); if(v){
        if(v[0]==='/'){ processCheat(v); } else { addChat(v); if(typeof LAN!=='undefined'&&LAN.connected) LAN.send({t:'c',text:v}); }
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
    }else if(p[0]==='host'){ LAN.host();
    }else if(p[0]==='join'){ LAN.join();
    }else if(p[0]==='accept'){ LAN.accept();
    }else if(p[0]==='disconnect'){ LAN.close(); addChat('> co-op closed');
    }else if(p[0]==='help'){
      addChat('> /gm 0/1/2 | /give <item> [n] | /heal | /clear | /day | /night | /spawn | /tesla | /xai');
      addChat('> CO-OP (2 players, no server): host types /host → sends code; friend types /join → pastes it, sends reply; host types /accept. /disconnect to end.');
      addChat(`> TO SPACE (no cheats): mine Voidcrystal + Quartz deep underground → craft a Circuit & Science Lab → build a rocket + Spacesuit → fuel the tank → click the Launchpad. See the Star Map [${keyLabel(KEYBINDS.starmap)}] for the steps.`);
    }else{
      addChat('> unknown. try /help');
    }
  }

  empireBoot();
  requestAnimationFrame(loop);
}
function hashStr(s){ let h=2166136261; for(let i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=Math.imul(h,16777619); } return h>>>0; }

/* ================= Empire SDK bridge =================
   window.Empire is created by the module script in index.html. Every call is
   guarded so the game still runs if the SDK is unavailable. */
let empireSec=0, empireReported=0;
window.__voxhavenPause=()=>{ if(game&&running&&!game.paused&&!game.dead&&!uiPanel) pause(); };
window.__voxhavenResume=()=>{ if(game&&running&&game.paused&&!game.dead) resume(); };
function empireSave(){
  if(!window.Empire||!game||!game.world) return;
  const k=Storage.activeKey(); if(!k) return;
  const name=updateTopBar._n||worldName();
  const label=name+' — Day '+(game.day||1);
  const blob={ key:k, name, seed:game.world.seed, mode:game.mode, day:game.day||1, dimension:game.dimension||'overworld' };
  try{
    window.Empire.saveState('world', blob, { label, playtimeSec:Math.floor(empireSec), mode:game.mode, seed:String(game.world.seed) });
    window.Empire.setContinuePoint('world', label);
  }catch(e){}
}
function empireReport(){
  if(!window.Empire) return;
  const s=Math.floor(empireSec)-empireReported;
  if(s>0){ empireReported+=s; try{ window.Empire.reportPlaytime(s); }catch(e){} }
}
function empireUnlock(id){ if(window.Empire){ try{ window.Empire.unlockAchievement(id); }catch(e){} } }
function empireBoot(){
  if(!window.Empire) return;
  Promise.resolve(window.Empire.loadState('world')).then(rec=>{
    const b=rec&&rec.blob;
    if(b&&b.key&&Storage.listWorlds().some(w=>w.key===b.key)) Storage.setActive(b.key);
  }).catch(()=>{});
}
window.__voxhavenLoadEmpireSlot=(slot,record)=>{
  const b=record&&record.blob, key=b&&typeof b.key==='string'?b.key:'';
  if(!key||!Storage.listWorlds().some(w=>w.key===key)||!Storage.load(key)){ flashPrompt('RVKKO save is unavailable on this PC'); return false; }
  if(running&&Storage.activeKey()===key) return true;
  if(running) doSave();
  const save=Storage.load(key); if(!save) return false;
  if(uiPanel) closePanel();
  running=false; if(game) game.paused=true; document.exitPointerLock();
  for(const id of ['pauseScreen','deathScreen','worldListScreen']) $(id).classList.add('hidden');
  Storage.setActive(key); Audio.init(); startGame(()=>game.load(save));
  return true;
};

/* ================= game start / loading ================= */
function startGame(genFn){
  $('startScreen').classList.add('hidden');
  $('loadScreen').classList.remove('hidden');
  setFill(0); initLoadingProgress();
  if(!game){ game=new Game($('game')); window.__voxhavenGame=game; wireGameCallbacks(); }
  game.controlHint=action=>keyLabel(KEYBINDS[action]);
  game.renderDist=settings.rd; game.sens=settings.sens; game.invertY=settings.invertY; game.reducedMotion=settings.reducedMotion; if(game.applyGraphics) game.applyGraphics(settings.gfx); else game.gfx=settings.gfx; game.fxQuality=settings.fx; Audio.vol=settings.vol;
  // defer so the loading screen paints
  setTimeout(()=>{ try{ genFn(); loadInitial(()=>{ enterPlay(); }); }
    catch(err){ showRuntimeError(err,'World load'); $('loadScreen').classList.add('hidden'); $('startScreen').classList.remove('hidden'); alert('This world could not be loaded safely. Your save was not changed.'); }
  }, 40);
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
    const f=1-remain/total; setFill(f); updateLoadingProgress(f,remain);
    if(remain>0) requestAnimationFrame(step);
    else { setFill(1); updateLoadingProgress(1,0); setTimeout(done,150); }
  }
  requestAnimationFrame(step);
}
function enterPlay(){
  $('loadScreen').classList.add('hidden');
  $('hud').classList.remove('hidden'); $('crosshair').classList.remove('hidden'); $('chat').classList.remove('hidden');
  game.player.autoJump=settings.autoJump;
  if(game.setAdaptiveScale) game.setAdaptiveScale(1); resetAdaptiveQuality();
  buildHUD(); refreshHotbar(); onSelChange(); updateTopBar._n=worldName(); updateActionHotkeys(); running=true; requestLock();
  empireUnlock('first-world'); empireSave();
  if(window.addChat) window.addChat('> Welcome to Voxhaven. Gather timber, craft a bench, and follow the Expedition Route. N: Star Map · /help: commands.');
}
function setFill(f){ $('loadfill').style.width=Math.round(clampN(f,0,1)*100)+'%'; }
function clampN(v,a,b){ return v<a?a:v>b?b:v; }
const LOAD_STAGES=[
  ['Preparing world','Choosing seed and spawn.'],
  ['Generating terrain','Building nearby hills, caves, water, and biomes.'],
  ['Placing life','Loading villages, trees, creatures, and resources.'],
  ['Warming lights','Applying atmosphere, water, fog, and HUD state.'],
  ['Entering world','Final safety checks before play.']
];
function initLoadingProgress(){
  const wrap=$('loadStages');
  if(wrap){ wrap.innerHTML=''; for(const s of LOAD_STAGES) wrap.appendChild(el('span',null,s[0])); }
  $('loadtext').textContent=LOAD_STAGES[0][0]; $('loadhint').textContent=LOAD_STAGES[0][1];
}
function updateLoadingProgress(f,remain){
  const idx=Math.min(LOAD_STAGES.length-1, Math.floor(clampN(f,0,0.999)*LOAD_STAGES.length));
  $('loadtext').textContent=LOAD_STAGES[idx][0]+(remain>0?'  '+Math.round(f*100)+'%':'');
  $('loadhint').textContent=LOAD_STAGES[idx][1];
  const nodes=$('loadStages') ? $('loadStages').children : [];
  for(let i=0;i<nodes.length;i++) nodes[i].className=i<idx?'done':i===idx?'now':'';
}

/* ================= pointer lock ================= */
function requestLock(allowPaused=false){ if(game&&!uiPanel&&!game._rocketUI&&(!game.paused||allowPaused)&&!game.dead){
  const p=game.renderer.domElement.requestPointerLock();
  if(p&&p.catch&&!allowPaused) p.catch(()=>{});
  return p;
} return null; }
document.addEventListener('pointerlockchange',()=>{
  const locked=document.pointerLockElement===game?.renderer.domElement;
  if(game) game.input.enabled=locked;
  if(game&&!locked) game.input.reset();
  if(locked && game && game.paused && $('pauseScreen').classList.contains('hidden')) game.paused=false;
  if(!locked && running && !uiPanel && !(game&&game._rocketUI) && !game.dead && !game.paused){ pause(); }
});
function onCanvasClick(){ if(running && !uiPanel && !(game&&game._rocketUI) && !game.paused && !game.dead) requestLock(); }

/* ================= main loop ================= */
function loop(t){
  requestAnimationFrame(loop);
  const rawDt=Math.max(0,(t-last)/1000)||0, dt=Math.min(0.05,rawDt); last=t;
  if(!game||!running){ return; }
  if(document.hidden) return;
  // build movement control from held keys (frozen when a panel is open)
  const inp=game.input; const chatFoc = !!(document.activeElement && document.activeElement.id==='chatInput');
  // during rocket flight the avatar is frozen — flight reads keys directly in _rocketTick
  const flight=game._rocketActive; const active=game.input.enabled && !uiPanel && !game._rocketUI && !flight && !game.paused && !game.dead && !chatFoc;
  const ctl=loop._ctl||(loop._ctl={});
  ctl.f=active&&inp.down(KEYBINDS.forward); ctl.b=active&&inp.down(KEYBINDS.back);
  ctl.l=active&&inp.down(KEYBINDS.left); ctl.r=active&&inp.down(KEYBINDS.right);
  ctl.jump=active&&inp.down(KEYBINDS.jump); ctl.sprint=active&&inp.down(KEYBINDS.sprint); ctl.crouch=active&&inp.down(KEYBINDS.crouch);

  // hotbar via wheel
  const w=inp.consumeWheel(); if(active && w){ game.player.sel=( (game.player.sel+ (w>0?1:-1)) +9)%9; onSelChange(); }

  // mining / attacking (hold left) — never inside the cockpit room
  if(active && game.dimension!=='cockpit'){
    if(inp.mouseDown[0] && !noMine){ game.holdBreak(dt); }
  }

  try{
    game.update(dt,ctl);
    game.render(dt);
    updateAdaptiveQuality(rawDt);
    loop._hudT=(loop._hudT||0)+dt;
    if(loop._hudT>=1/30){ loop._hudT%=1/30; updateHUD(); }
    if(debugOn) updateDebug(dt);
  }catch(err){
    if(!loop._lastErr || loop._lastErr!==err.message){ loop._lastErr=err.message; showRuntimeError(err,'Game frame'); }
  }
  // playtime accrues only while a world is actually being played
  if(!game.paused && !game.dead) empireSec+=dt;
  loop._ptT=(loop._ptT||0)+dt; if(loop._ptT>15){ loop._ptT=0; empireReport(); }
  // periodic autosave (wall-clock ~60s) — a crash or power loss loses at most a minute
  loop._asT=(loop._asT||0)+dt;
  if(loop._asT>60){ loop._asT=0; if(!game.dead && !game._rocketActive && !game.paused) doSave(false); }
}

function resetAdaptiveQuality(){ loop._perfT=0; loop._perfFrames=0; loop._perfWarm=8; loop._perfGood=0; }
function updateAdaptiveQuality(rawDt){
  if(!settings.adaptive||!game||game.paused||game.dead||document.hidden||rawDt<=0||rawDt>0.5) return;
  if((loop._perfWarm||0)>0){ loop._perfWarm=Math.max(0,loop._perfWarm-rawDt); return; }
  loop._perfT=(loop._perfT||0)+rawDt; loop._perfFrames=(loop._perfFrames||0)+1;
  if(loop._perfT<3) return;
  const measured=loop._perfFrames/loop._perfT, scale=game._adaptiveScale||1;
  if(measured<48){ game.setAdaptiveScale(Math.max(0.67,scale-0.1)); loop._perfGood=0; }
  else if(measured>57 && scale<1){ loop._perfGood=(loop._perfGood||0)+1; if(loop._perfGood>=2){ game.setAdaptiveScale(Math.min(1,scale+0.05)); loop._perfGood=0; } }
  else loop._perfGood=0;
  loop._perfT=0; loop._perfFrames=0;
}

document.addEventListener('visibilitychange',()=>{
  last=performance.now();
  if(document.hidden){
    if(game){ game.input.enabled=false; game.input.reset(); }
    Audio.suspend();
    if(game&&running&&!game.dead&&!game._rocketActive) doSave();
  } else {
    Audio.resume(); resetAdaptiveQuality();
    if(game&&running) game.input.enabled=document.pointerLockElement===game.renderer.domElement;
  }
});

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
  if(e.code==='Escape'&&!running){
    if(!$('settings').classList.contains('hidden')&&$('settings').parentElement===settingsHome) $('btnSettingsBack').click();
    else if(!$('newWorldPanel').classList.contains('hidden')) $('btnBackNew').click();
    else if(!$('worldListScreen').classList.contains('hidden')) $('btnWorldsBack').click();
    else return;
    e.preventDefault(); return;
  }
  if(!game||!running) return;
  if(document.activeElement && document.activeElement.id==='chatInput') return;  // let chat handle keys
  // F1: showcase mode — hide every HUD element for clean screenshots/clips
  if(e.code==='F1'){ e.preventDefault(); document.body.classList.toggle('showcase'); return; }
  // ---- rocket states intercept keys (dashboard / cockpit / countdown / flight) ----
  if(game._inCockpit){ if(e.code==='Escape') game._closeCockpitUI&&game._closeCockpitUI(); return; }  // checklist panel open
  if(game._rocketUI){ if(e.code==='Escape'){ game._closeRocketDash(); } else if(e.code===KEYBINDS.rocketBoard){ game._rocketBoard&&game._rocketBoard(); } return; }
  if(game.rocket && game.rocket.phase==='countdown'){ if(e.code===KEYBINDS.rocketAbort){ game._rocketAbort(); return; } }
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
  if(game.player.pod){ game._exitPod(); return; }
  if(game.player.mount){ game._dismount(); return; }
  if(game.interact()) return;
  const m=game.findLookMob(true); if(m){ game.heldSwing=1; openTrade(m); return; }
  if(game.interactMount && game.interactMount()){ game.heldSwing=1; return; }
  if(game.interactRuler && game.interactRuler()) game.heldSwing=1;
}
function itemDesc(it){ if(it.id==='sunstone')return 'Relic — carried: you never freeze'; if(it.id==='star_core')return 'Relic — carried at launch: +hull, +fuel'; if(it.id==='tide_charm')return 'Relic — carried: doubles your breath'; if(it.pods)return 'Vehicle — dive the deep, breathe freely'; if(it.boats)return 'Vehicle — skim across water'; if(it.armorSlot)return 'Armor ('+it.armorSlot+') · '+it.def+' def'; if(it.shoots)return 'Ranged weapon · '+it.dmg+' dmg'; if(it.id==='arrow')return 'Ammo for bows'; if(it.effect)return 'Potion · '+it.effect+' ('+it.effectDur+'s)'; if(it.fishes)return 'Fishing rod · cast anywhere'; if(it.tool)return 'Tool · tier '+it.tier+(it.dmg?' · '+it.dmg+' dmg':''); if(it.food)return 'Food · +'+it.food+' stamina'; if(it.fuel)return 'Fuel'; if(it.blockId)return 'Placeable block'; if(it.smelt)return 'Smeltable'; return ''; }
function onSelChange(){ refreshHotbar(); const s=game.player.inv[game.player.sel]; showItemName(s?ITEMS[s.item]:null); }

/* ================= pause / quit ================= */
function pause(){ if(game.dead)return; $('settings').classList.add('hidden'); $('pauseScreen').classList.remove('settings-open'); game.paused=true; document.exitPointerLock(); updateModeViewLabels(); $('pauseScreen').classList.remove('hidden'); setTimeout(()=>$('btnResume').focus(),0); }
function resume(){
  $('settings').classList.add('hidden');
  $('pauseScreen').classList.remove('settings-open');
  $('pauseScreen').classList.add('hidden');
  const failed=()=>{ if(document.pointerLockElement!==game.renderer.domElement){ game.paused=true; $('pauseScreen').classList.remove('hidden'); flashText($('btnResume'),'Click Resume'); $('btnResume').focus(); } };
  try{ const p=requestLock(true); if(p&&p.catch) p.catch(failed); setTimeout(failed,400); }catch(err){ failed(); }
}
function quitToMenu(){ doSave(); empireReport(); running=false; game.paused=false; $('pauseScreen').classList.add('hidden'); $('pauseScreen').classList.remove('settings-open'); $('settings').classList.add('hidden'); if(settingsHome){ settingsHome.classList.remove('settings-open'); if($('settings').parentElement!==settingsHome) settingsHome.appendChild($('settings')); } $('mainMenuButtons').classList.remove('hidden'); $('hud').classList.add('hidden'); $('crosshair').classList.add('hidden'); $('chat').classList.add('hidden'); $('startScreen').classList.remove('hidden'); document.exitPointerLock(); }
function autosaveFingerprint(){
  if(!game||!game.world||!game.player) return '';
  const p=game.player, q=n=>Math.round((Number.isFinite(+n)?+n:0)*4)/4;
  const inv=p.inv.map(s=>s?`${s.item}:${s.count}:${s.dur==null?'':s.dur}`:'').join('|');
  const armor=['head','chest','legs','feet'].map(k=>{ const s=p.armor&&p.armor[k]; return s?`${s.item}:${s.dur==null?'':s.dur}`:''; }).join('|');
  return [Storage.activeKey()||'',game.dimension||'overworld',game.day|0,q(p.pos.x),q(p.pos.y),q(p.pos.z),q(p.health),q(p.hunger),q(p.warmth),q(p.stamina),inv,armor,game.world.deltas.size,game.world.meta.size,game.world.chests.size,game.world.furnaces.size,(game.drops||[]).filter(d=>!d.projectile).length,Object.keys(game.milestones||{}).length].join(';');
}
function doSave(force=true){
  try{
  if(!game||!game.world) return false;
  const k=Storage.activeKey(); if(!k) return false;
  const fingerprint=autosaveFingerprint();
  if(!force && fingerprint===doSave._lastFingerprint) return true;
  const ok=Storage.save(k,game.serialize());
  if(!ok) throw new Error('Storage rejected the world save (quota may be full)');
  Storage.touchWorld(k, { mode:game.mode, day:game.day, health:Math.ceil(game.player.health), maxHealth:game.player.maxHealth, lastPlayed:Date.now() });
  empireSave();
  doSave._lastFingerprint=autosaveFingerprint();
  return true;
  }catch(err){ flashPrompt('SAVE FAILED'); showRuntimeError(err,'Save'); return false; }
}
window.__voxhavenAutosaveFingerprint=autosaveFingerprint;
window.__voxhavenSave=doSave;
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
addEventListener('beforeunload',()=>{ if(game&&game.world&&running) doSave(); empireReport(); });

// co-op guest: when the host's init packet arrives, jump into their world —
// same seed + gen version means identical terrain; the host's edits ride along
if(typeof LAN!=='undefined') LAN.onInit=(m)=>{
  const applyPlanet=()=>{ if(!m.planet||typeof PlanetWorld==='undefined') return; const P=game.planetWorld||(game.planetWorld=new PlanetWorld((m.seed>>>0)^0x50ACE)); P.deltas=new Map(Object.entries(m.planet.deltas||{}).map(([k,v])=>[k,+v])); P.meta=new Map(Object.entries(m.planet.meta||{})); P.chests=new Map(Object.entries(m.planet.chests||{})); P.furnaces=new Map(Object.entries(m.planet.furnaces||{})); P.chunks.clear(); };
  if(running && game && game.world && game.world.seed===(m.seed>>>0)){
    LAN._applying=true;
    for(const k in (m.deltas||{})){ const c=k.split(',').map(Number); game.setBlock(c[0],c[1],c[2], +m.deltas[k], m.meta&&m.meta[k]?m.meta[k]:undefined); }
    LAN._applying=false;
    for(const [k,v] of Object.entries(m.chests||{})) game.world.chests.set(k,v);
    for(const [k,v] of Object.entries(m.furnaces||{})) game.world.furnaces.set(k,v);
    applyPlanet();
    addChat('> [co-op] world synced with host');
    return;
  }
  addChat('> [co-op] joining host world (seed '+m.seed+')…');
  startGame(()=>{
    game.newWorld(m.seed>>>0,'survival',false);
    game.world.genVer=m.gen||1;
    for(const k in (m.deltas||{})) game.world.deltas.set(k, +m.deltas[k]);
    for(const k in (m.meta||{})) game.world.meta.set(k, m.meta[k]);
    game.world.chests=new Map(Object.entries(m.chests||{}));
    game.world.furnaces=new Map(Object.entries(m.furnaces||{}));
    applyPlanet();
    game.world.chunks.clear(); game.world.lights.clear(); game.world.villages=[];
    game.time=m.time!=null?m.time:0.3; game.day=m.day||1;
    const key=Storage.newWorldKey(m.seed>>>0); Storage.setActive(key);
    Storage.registerWorld({ key, name:'Co-op world', seed:m.seed, mode:'survival', day:game.day, lastPlayed:Date.now() });
    doSave();
  });
};
window.__voxhavenRefreshContainer=(kind,key,dim)=>{ if(!game||dim!==(game.dimension||'overworld')) return; const pos=kind==='chest'?chestPos:furnacePos; if(!pos||uiPanel!==kind) return; if(game.world.bkey(pos[0],pos[1],pos[2])===key) renderOpenPanel(); };

/* ================= game callbacks ================= */
function wireGameCallbacks(){
  // mirror world milestones onto Empire achievements (ids match manifest.json)
  const baseMilestone=game._milestone.bind(game);
  const milestoneAchievements={space:'reach-for-stars',night1:'first-night',slayMaw:'gravemaw-slayer',foundCity:'find-aetheria',friendRuler:'aethon-alliance'};
  game._milestone=(key,msg)=>{
    const already=!!(game.milestones&&game.milestones[key]);
    baseMilestone(key,msg);
    const achievement=milestoneAchievements[key];
    if(!already && achievement){ empireUnlock(achievement); empireSave(); }
  };
  game.onOpenChest=(x,y,z)=>{ chestPos=[x,y,z]; openChest(); };
  game.onOpenFurnace=(x,y,z)=>{ furnacePos=[x,y,z]; openFurnace(); };
  game.onOpenCraft=(station)=>{ openInventory(station); };
  game.onFlash=(msg)=>flashPrompt(msg);
  game.onRequestLock=()=>requestLock();
  game.onDamage=()=>{ const f=$('damageFlash'); f.classList.add('show'); setTimeout(()=>f.classList.remove('show'),120); };
  game.onHit=()=>{ const c=$('crosshair'); c.classList.add('hit'); setTimeout(()=>c.classList.remove('hit'),90); };
  game.onDeath=(msg)=>{ if(uiPanel) closePanel(); $('deathMsg').textContent=msg+'  ·  survived '+game.day+' day(s)'; $('deathScreen').classList.remove('hidden'); document.exitPointerLock(); setTimeout(()=>$('btnRespawn').focus(),0); };
  game.onToast=(t)=>{ flashPrompt(t); };
  game.onSleep=()=>{ 
    const fade=$('fade'); 
    game.paused = true; // prevent pointerlockchange from calling pause() and showing pauseScreen during sleep
    fade.classList.add('show'); 
    document.exitPointerLock(); 
    setTimeout(()=>{ 
      game.finishSleep(); 
      updateTopBar._lt=game.time;
      fade.classList.remove('show'); 
      flashPrompt('Good morning — Day '+game.day); 
      resume();
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
      cnt.textContent=s.count>1?fmtCount(s.count):'';
      const it=ITEMS[s.item];
      if(it.dur){ const d=s.dur==null?it.dur:s.dur; dur.style.display=''; const b=dur.querySelector('i'); const f=d/it.dur; b.style.width=(f*100)+'%'; b.style.background=f>0.5?'#5ec46a':f>0.25?'#d9a441':'#cf4b4b'; } else dur.style.display='none';
    } else { img.style.display='none'; img.dataset.id=''; cnt.textContent=''; dur.style.display='none'; }
  }
}
function updateHUD(){
  if(game.player.sel!==lastSel){ lastSel=game.player.sel; refreshHotbar(); }
  // hearts
  const hp=game.player.health; const hr=$('heartRow');
  setMeter(hr,hp,game.player.maxHealth,'Health');
  for(let i=0;i<10;i++){ const v=hp-i*2, cls='pip '+(v>=2?'heart-full':v>=1?'heart-half':'heart-empty'); if(hr.children[i].className!==cls) hr.children[i].className=cls; }
  const hu=game.player.hunger; const fr=$('hungerRow');
  setMeter(fr,hu,game.player.maxHunger,'Food');
  for(let i=0;i<10;i++){ const v=hu-i*2, cls='pip '+(v>=2?'food-full':v>=1?'food-half':'food-empty'); if(fr.children[i].className!==cls) fr.children[i].className=cls; }
  const st=game.player.stamina, sr=$('staminaRow');
  const showSta=game.mode==='survival' && st<game.player.maxStamina;
  setMeter(sr,st,game.player.maxStamina,'Stamina');
  sr.classList.toggle('hidden',!showSta);
  if(showSta) for(let i=0;i<10;i++){ const v=st-i*10; sr.children[i].className='pip '+(v>=10?'sta-full':v>=5?'sta-half':'sta-empty'); }
  updateSurvivalFx();
  updateObjectivePanel();
  updateTopBar();
  const mining=$('miningFeedback'), miningOn=!!(game.breakTarget&&game.breakProg>0&&game.selBlock);
  mining.classList.toggle('hidden',!miningOn);
  if(miningOn){
    const id=game.world.getBlock(game.selBlock.x,game.selBlock.y,game.selBlock.z), it=game.selItem(), wrong=!game.canHarvest(id,it);
    mining.classList.toggle('wrong',wrong); mining.querySelector('i').style.width=(Math.min(1,game.breakProg)*100)+'%';
    mining.querySelector('span').textContent=wrong?'Wrong tool · very slow':(BLOCKS[id]&&BLOCKS[id].name)||'Mining';
  }
  // interaction prompt
  const held=(game && game.selItem) ? game.selItem() : null;
  if(held && held.fishes && game && game.fishing && !uiPanel){
    showPrompt( game.fishing.state==='biting' ? 'Click to reel!' : 'Fishing...' );
  }else if(game.dimension==='cockpit' && game.selBlock && !uiPanel){ const sb=game.selBlock;
    if(game.world.getBlock(sb.x,sb.y,sb.z)===B.SCIENCE_BENCH && game._cockpitPrompt) showPrompt(game._cockpitPrompt(sb.x,sb.y,sb.z)); else hidePrompt();
  }else if(game.selBlock && !uiPanel){ const id=game.world.getBlock(game.selBlock.x,game.selBlock.y,game.selBlock.z);
    const use=`[${keyLabel(KEYBINDS.interact)}]`, map={[B.CHEST]:`${use}/RMB Open chest`,[B.FURNACE]:`${use}/RMB Use kiln`,[B.BENCH]:`${use}/RMB Craft`,[B.DOOR]:`${use}/RMB Toggle door`,[B.METAL_DOOR]:`${use}/RMB Open/close hatch`,[B.BED]:`${use}/RMB Sleep`,[B.BED_FOOT]:`${use}/RMB Sleep`};
    if(id===B.LAUNCHPAD) showPrompt(game.dimension==='planet'?`${use} Board rocket — fly home`:`${use} Rocket dashboard`);
    else if(id===B.SCIENCE_BENCH && game.world.getMeta(game.selBlock.x,game.selBlock.y,game.selBlock.z) && game.world.getMeta(game.selBlock.x,game.selBlock.y,game.selBlock.z).rkConsole) showPrompt(`${use} Rocket console`);
    else if(map[id]) showPrompt(map[id]); else hidePrompt();
  } else hidePrompt();
  if(refreshHotbar._t==null)refreshHotbar._t=0; refreshHotbar._t++; if(refreshHotbar._t%15===0) refreshHotbar();
}
function setMeter(node,value,max,label){
  if(!node) return; const now=Math.max(0,Math.min(max,Math.round(value*10)/10)), text=label+' '+now+' of '+max;
  if(node.getAttribute('aria-valuemin')!=='0') node.setAttribute('aria-valuemin','0');
  if(node.getAttribute('aria-valuemax')!==String(max)) node.setAttribute('aria-valuemax',String(max));
  if(node.getAttribute('aria-valuenow')!==String(now)) node.setAttribute('aria-valuenow',String(now));
  if(node.getAttribute('aria-valuetext')!==text) node.setAttribute('aria-valuetext',text);
}
function worldName(){ try{ const k=Storage.activeKey(); const w=Storage.listWorlds().find(x=>x.key===k); return (w&&w.name)||'Voxhaven'; }catch(e){ return 'Voxhaven'; } }
function updateTopBar(){
  const wl=$('worldLabel'), bl=$('biomeLabel'); if(!wl||!bl) return;
  if(updateTopBar._n==null) updateTopBar._n=worldName();
  const worldText='WORLD: '+updateTopBar._n; if(wl.textContent!==worldText) wl.textContent=worldText;
  let biome;
  if(game.dimension==='planet') biome='AETHON';
  else { const px=Math.floor(game.player.pos.x), pz=Math.floor(game.player.pos.z); biome=game.world.biomeName(px,pz); }
  const biomeText='BIOMES: '+biome; if(bl.textContent!==biomeText) bl.textContent=biomeText;
  // coords + Day N + clock
  const cl=$('coordLabel');
  if(cl){ const p=game.player.pos;
    if(game.day==null) game.day=1;
    const hh=Math.floor(game.time*24), mm=Math.floor((game.time*24-hh)*60);
    const coordText=`${Math.floor(p.x)}, ${Math.floor(p.y)}, ${Math.floor(p.z)}  ·  Day ${game.day}  ·  ${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;
    if(cl.textContent!==coordText) cl.textContent=coordText;
  }
}
function updateSurvivalFx(){
  const surv=game.mode==='survival', p=game.player;
  const wr=$('warmthRow'), br=$('breathRow'), fx=$('statusFx'), frost=$('frostFlash');
  // oxygen row — only in space; cyan pips driven by game.oxygen/oxygenMax
  const ox=$('oxygenRow'), showOxy=!!game.inSpace;
  ox.classList.toggle('hidden',!showOxy);
  if(showOxy){ const omax=game.oxygenMax||10, cur=game.oxygen!=null?game.oxygen:omax;
    setMeter(ox,cur,omax,'Oxygen');
    for(let i=0;i<10;i++){ const v=cur/omax*10-i, cls='pip '+(v>=1?'oxy-full':v>=0.5?'oxy-half':'oxy-empty'); if(ox.children[i].className!==cls) ox.children[i].className=cls; } }
  // warmth row — only shown once you start getting cold, to keep the HUD clean
  const showWarm=surv && p.warmth<p.maxWarmth;
  setMeter(wr,p.warmth,p.maxWarmth,'Warmth');
  wr.classList.toggle('hidden',!showWarm);
  if(showWarm) for(let i=0;i<10;i++){ const v=p.warmth-i*2, cls='pip '+(v>=2?'warm-full':v>=1?'warm-half':'warm-empty'); if(wr.children[i].className!==cls) wr.children[i].className=cls; }
  // breath row — only while underwater (air depletes over the 8s drown timer)
  const airMax=game.countItem&&game.countItem('tide_charm')>0?16:8;
  const air=surv?Math.max(0,airMax-(game._airT||0)):airMax;
  const showAir=surv && (game._airT||0)>0.1;
  setMeter(br,air,airMax,'Air');
  br.classList.toggle('hidden',!showAir);
  if(showAir){ const pips=Math.ceil(air/airMax*10); for(let i=0;i<10;i++){ const cls='pip '+(i<pips?'air-full':'air-empty'); if(br.children[i].className!==cls) br.children[i].className=cls; } }
  // frost vignette
  frost.style.opacity = surv ? String((game._frostLevel||0)*0.85) : '0';
  // status text — most urgent environmental warning
  let msg='';
  if(surv){
    if((game._airT||0)>=airMax*0.5) msg='Drowning! Surface now!';
    else if(p.warmth<=0) msg='❄ Freezing!';
    else if(p.warmth<5) msg='❄ Cold';
    else if((game._queasyT||0)>0) msg='Queasy';
  }
  if(msg){ if(fx.textContent!==msg) fx.textContent=msg; fx.classList.remove('hidden'); } else fx.classList.add('hidden');
}
function updateObjectivePanel(){
  const box=$('objectivePanel'); if(!box||!game||!game.player) return;
  if(updateObjectivePanel._dim!==game.dimension){ updateObjectivePanel._dim=game.dimension; updateObjectivePanel._n=0; }
  updateObjectivePanel._n=(updateObjectivePanel._n||0)+1; if(updateObjectivePanel._n%12!==1) return;
  const route=objectiveRoute(), obj=route.current;
  if(!obj){ box.classList.add('hidden'); return; }
  $('objectiveText').textContent=obj.title;
  $('objectiveHint').textContent=obj.hint;
  $('objectiveNext').textContent=route.next||'Choose your own path';
  $('objectiveLong').textContent=route.long;
  const bar=$('objectiveProgress'), count=$('objectiveCount');
  if(obj.ratio==null){ bar.classList.add('hidden'); count.textContent=obj.progress||''; }
  else { bar.classList.remove('hidden'); bar.firstElementChild.style.width=(Math.max(0,Math.min(1,obj.ratio))*100)+'%'; count.textContent=obj.progress||''; }
  box.classList.remove('hidden');
}
function objectiveRoute(){
  if(game.mode==='creative') return {current:{title:'Shape the world',hint:`Open Inventory [${keyLabel(KEYBINDS.inventory)}], place blocks, press F1 for showcase mode.`},next:'Build a landmark',long:'Create a living settlement'};
  if(game.mode==='spectator') return {current:{title:'Scout the planet',hint:'Use the map and Star Map to plan a survival route.'},next:'Mark a landmark',long:'Chart every region'};
  const c=id=>ITEMS[id]?game.countItem(id):0, ms=game.milestones||{}, made=id=>!!(ms['crafted:'+id]||ms['placed:'+id]||c(id)>0);
  if(game.dimension==='planet'){
    const shards=c('space_shard'), alloy=c('alien_alloy'), metRuler=!!(ms.friendRuler||ms.slayRuler);
    if(shards<3) return {current:{title:'Harvest Voidcrystal',hint:'Mine the glowing cyan veins beneath Aethon turf. Keep oxygen gear equipped.',ratio:Math.min(shards/3,1),progress:`Space Shards ${Math.min(shards,3)} / 3`},next:'Locate the alien court',long:'Return discoveries to Voxhaven'};
    if(!metRuler) return {current:{title:'Find the Aethon court',hint:'Search for crystal pillars and the throne settlement. Approach peacefully or prepare for battle.',progress:alloy?`Alien Alloy recovered: ${alloy}`:'Follow structures across the alien terrain'},next:'Meet the Alien Ruler',long:'Return discoveries to Voxhaven'};
    return {current:{title:'Bring the expedition home',hint:'Return to your landing pad, refuel if needed, and launch for Voxhaven.',progress:`Shards ${shards}  ·  Alloy ${alloy}`},next:'Complete the round trip',long:'Secure Aethon technology'};
  }
  const pickaxes=['stone_pickaxe','copper_pickaxe','iron_pickaxe','gold_pickaxe','crystal_pickaxe'];
  const pickReady=pickaxes.some(made), lightReady=made('torch')||made('lantern');
  const spaceReady=!!(ms.space||ms.aethon||ms.roundTrip), scienceReady=made('science_bench')||spaceReady, circuitReady=made('circuit')||scienceReady;
  const helm=game.player.armor&&game.player.armor.head, oxygenReady=spaceReady||!!(helm&&ITEMS[helm.item]&&ITEMS[helm.item].oxygen);
  const benchReady=made('bench')||pickReady||scienceReady||!!ms.village1;
  const steps=[
    {title:'Gather timber',hint:nearestTimberHint(),done:made('planks')||benchReady,ratio:Math.min(c('log')/3,1),progress:`Logs ${Math.min(c('log'),3)} / 3`},
    {title:'Craft a workbench',hint:`Open Inventory [${keyLabel(KEYBINDS.inventory)}] and craft a bench to unlock better recipes.`,done:benchReady,ratio:Math.min(c('planks')/4,1),progress:`Planks ${Math.min(c('planks'),4)} / 4`},
    {title:'Make a real pickaxe',hint:'Mine stone and craft a pickaxe before going deep.',done:pickReady||!!ms.village1||scienceReady,ratio:(Math.min(c('cobble')/3,1)+Math.min(c('stick')/2,1))/2,progress:`Cobble ${Math.min(c('cobble'),3)}/3  ·  Sticks ${Math.min(c('stick'),2)}/2`},
    {title:'Prepare for caves',hint:'Craft torches or a lantern before mining below the surface.',done:lightReady||!!ms.village1||scienceReady,ratio:(Math.min(c('coal'),1)+Math.min(c('stick'),1))/2,progress:`Coal ${Math.min(c('coal'),1)}/1  ·  Stick ${Math.min(c('stick'),1)}/1`},
    {title:'Survive the first night',hint:'Build a lit shelter or place a bed before darkness. Stay inside, sleep, or defend your camp until dawn.',done:!!ms.night1||scienceReady,progress:game.time>.68||game.time<.24?'Night in progress · stay safe':'Prepare shelter before sunset'},
    {title:'Find a village',hint:'Follow roads and smoke; settlers can trade rare supplies.',done:!!ms.village1||scienceReady,progress:'Explore the overworld'},
    {title:'Assemble a Circuit',hint:'Refine copper, crystal, and gold at a workbench to begin the space program.',done:circuitReady,ratio:(Math.min(c('copper_ingot')/2,1)+Math.min(c('crystal'),1)+Math.min(c('gold_ingot'),1))/3,progress:`Copper ${Math.min(c('copper_ingot'),2)}/2  ·  Crystal ${Math.min(c('crystal'),1)}/1  ·  Gold ${Math.min(c('gold_ingot'),1)}/1`},
    {title:'Build a Science Lab',hint:'Refine metal and circuitry at a bench to unlock rocket parts.',done:scienceReady,ratio:(Math.min(c('circuit')/2,1)+Math.min(c('iron_ingot')/4,1)+Math.min(c('quartz')/2,1))/3,progress:`Circuit ${Math.min(c('circuit'),2)}/2  ·  Iron ${Math.min(c('iron_ingot'),4)}/4  ·  Quartz ${Math.min(c('quartz'),2)}/2`},
    {title:'Prepare oxygen gear',hint:'Craft a Spacesuit Helmet at the Science Lab, then right-click it to equip.',done:oxygenReady,ratio:made('spacesuit_helmet')?0.7:0,progress:made('spacesuit_helmet')?'Helmet crafted · equip it':'Helmet required for launch'},
    {title:'Reach orbit',hint:'Build a Launchpad, assemble and fuel the rocket, then interact with it.',done:spaceReady,ratio:made('launchpad')?0.5:0,progress:made('launchpad')?'Launchpad ready · Rocket pending':'Launchpad required'},
    {title:'Land on Aethon',hint:'Wear space gear and use the rocket to reach the alien world.',done:!!(ms.aethon||ms.roundTrip),progress:'Prepare oxygen and fuel'},
    {title:'Return home',hint:'Repair, refuel, and bring discoveries back to Voxhaven.',done:!!ms.roundTrip,progress:'Complete the first expedition'},
    {title:'Choose your legend',hint:'Explore ruins, hunt bosses, map oceans, or build a settlement.',done:false,progress:'The world is yours'}
  ];
  const at=Math.max(0,steps.findIndex(s=>!s.done)), current=steps[at], next=steps.slice(at+1).find(s=>!s.done);
  const long=!ms.space?'Reach orbit':!ms.aethon?'Land on Aethon':!ms.roundTrip?'Return home':'Complete the Journey Log';
  return {current,next:next&&next.title,long};
}
window.__voxhavenObjectiveRoute=objectiveRoute;
function nearestTimberHint(){
  const now=performance.now();
  if(nearestTimberHint._text && now-(nearestTimberHint._at||0)<1500) return nearestTimberHint._text;
  const p=game.player.pos, px=Math.floor(p.x), pz=Math.floor(p.z); let best=null;
  for(let dx=-32;dx<=32;dx++) for(let dz=-32;dz<=32;dz++){
    const d2=dx*dx+dz*dz; if(d2>1024 || (best&&d2>=best.d2)) continue;
    const x=px+dx,z=pz+dz; if(!proceduralTreeAt(game.world,x,z)) continue;
    const y=game.world.heightAt(x,z); if(game.world.getBlock(x,y+1,z)===B.LOG) best={dx,dz,d2};
  }
  if(best){
    const ns=best.dz< -3?'N':best.dz>3?'S':'', ew=best.dx>3?'E':best.dx< -3?'W':'';
    nearestTimberHint._text=`Nearest timber: ${Math.max(1,Math.round(Math.sqrt(best.d2)))}m ${ns+ew||'nearby'} · break a trunk with the axe`;
  }else nearestTimberHint._text='Look for tree silhouettes nearby · break a trunk with the axe';
  nearestTimberHint._at=now; return nearestTimberHint._text;
}
let promptOn=false;
function showPrompt(t){ const p=$('interactPrompt'); p.classList.remove('milestone'); if(p.textContent!==t) p.textContent=t; if(!promptOn){ p.classList.add('show'); promptOn=true; } }
function hidePrompt(){ if(promptOn){ const p=$('interactPrompt'); p.classList.remove('show','milestone'); promptOn=false; } }
function flashPrompt(t){ const p=$('interactPrompt'), text=String(t), milestone=text.startsWith('★'); p.textContent=text; p.classList.toggle('milestone',milestone); p.classList.add('show'); clearTimeout(flashPrompt._t); flashPrompt._t=setTimeout(()=>{ p.classList.remove('show','milestone'); promptOn=false; },milestone?2600:1600); }
function showItemName(it){ const e=$('itemName'); clearTimeout(showItemName._t);
  if(!it){ e.classList.remove('show'); return; }
  const d=itemDesc(it); e.innerHTML='<b>'+it.name+'</b>'+(d?'<div class="itemNameDesc">'+d+'</div>':''); e.classList.add('show');
}
function flashText(e,t){ const o=e.textContent; e.textContent=t; setTimeout(()=>e.textContent=o,900); }

/* ================= debug overlay ================= */
let fpsAcc=0,fpsN=0,fps=0;
function updateDebug(dt){ fpsAcc+=dt;fpsN++; if(fpsAcc>=0.5){ fps=Math.round(fpsN/fpsAcc); fpsAcc=0;fpsN=0; }
  updateDebug._uiT=(updateDebug._uiT||0)+dt; if(updateDebug._uiT<0.25) return; updateDebug._uiT=0;
  const p=game.player; const cx=Math.floor(p.pos.x/CHUNK_X),cz=Math.floor(p.pos.z/CHUNK_Z);
  const look=game.selBlock?BLOCKS[game.world.getBlock(game.selBlock.x,game.selBlock.y,game.selBlock.z)].name:'-';
  const hh=Math.floor(game.time*24), mm=Math.floor((game.time*24-hh)*60);
  const ri=game.renderer.info.render, activeFx=game.particles.reduce((n,q)=>n+(q.active?1:0),0);
  $('debug').textContent=
`Voxhaven  FPS:${fps}
pos ${p.pos.x.toFixed(1)} ${p.pos.y.toFixed(1)} ${p.pos.z.toFixed(1)}
chunk ${cx},${cz}   biome ${game.world.biomeName(Math.floor(p.pos.x),Math.floor(p.pos.z))}
look ${look}
mobs ${game.mobs.length}   drops ${game.drops.length}
draws ${ri.calls}   triangles ${ri.triangles}   effects ${activeFx}
chunks ${game.chunkMeshes.size}   queue ${game.loadQueue.length}   dirty ${game.dirty.size}
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
    if(existing) game._giveOrDrop(existing.item, existing.count||1);
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
function syncOpenContainer(){ if(typeof LAN==='undefined'||!LAN.connected) return; if(uiPanel==='chest') LAN.syncContainer(game,'chest',chestPos); else if(uiPanel==='furnace') LAN.syncContainer(game,'furnace',furnacePos); }
function finishClick(){ Audio.play('click'); syncOpenContainer(); renderOpenPanel(); refreshHotbar(); updateDragGhost(); }
function returnCursor(){ if(cursor){ game._giveOrDrop(cursor.item,cursor.count); cursor=null; updateDragGhost(); refreshHotbar(); } }
function updateDragGhost(){ const g=$('dragGhost'); if(cursor){ g.classList.remove('hidden'); g.innerHTML=''; const im=el('img'); im.src=iconURL(cursor.item); g.appendChild(im); } else g.classList.add('hidden'); }
addEventListener('mousemove',e=>{ if(cursor){ const g=$('dragGhost'); g.style.left=(e.clientX-20)+'px'; g.style.top=(e.clientY-20)+'px'; } });
// clicking the dimmed backdrop (not the panel itself) while holding a stack:
// on the inventory screen this DISCARDS it (the only intentional way to delete
// items); on chest/furnace/trade screens that would be a surprising, unrecoverable
// loss, so there we hand the carried stack back instead.
for(const ov of document.querySelectorAll('.overlay')) ov.addEventListener('mousedown',e=>{ if(e.target===ov && cursor){ if(ov.id==='inventoryScreen'){ cursor=null; updateDragGhost(); Audio.play('break'); } else { returnCursor(); } } });

/* abbreviate large stack counts (e.g. 4800 -> 4.8k, 14100 -> 14.1k) */
function fmtCount(n){ if(n<1000)return ''+n; if(n<100000)return (n/1000).toFixed(n<10000?1:0).replace(/\.0$/,'')+'k'; return (n/1000000).toFixed(1).replace(/\.0$/,'')+'m'; }
/* slot DOM builder */
function makeCell(cont,idx){ const c=el('div','cell'); const s=getSlot(cont,idx);
  if(s){ const im=el('img'); im.src=iconURL(s.item); c.appendChild(im); if(s.count>1) c.appendChild(el('span','count',fmtCount(s.count)));
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
function openInventory(station){ craftStation=station; uiPanel='inv'; document.exitPointerLock();
  $('craftStation').textContent=station==='bench'?'· Bench':station==='science'?'· Science Lab':'';
  $('inventoryScreen').classList.remove('hidden'); setInvTab('craft');
}
function setInvTab(tab){
  // remap legacy tab ids -> new 3-tab layout (Equipment / Crafting / Smithing)
  if(tab==='blocks') tab='smith'; else if(tab==='gear'||tab==='food') tab='equip';
  invTab=tab;
  const isGuide=tab==='guide', isEquip=tab==='equip', isSmith=tab==='smith', isCraft=tab==='craft';
  $('tabEquip').classList.toggle('sel',isEquip);
  $('tabCraft').classList.toggle('sel',isCraft);
  $('tabSmith').classList.toggle('sel',isSmith);
  const gridTab=isSmith||isEquip;
  $('recipeList').classList.toggle('hidden',!isCraft);
  $('blocksList').classList.toggle('hidden',!gridTab);
  $('guideList').classList.toggle('hidden',!isGuide);
  $('guideSearch').classList.toggle('hidden',!isGuide);
  $('armorSlots').classList.add('hidden');   // armor now lives inside the Equipment page column
  const st=craftStation==='bench'?' — Bench':craftStation==='science'?' — Science Lab':'';
  $('invLeftTitle').textContent=isGuide?'Item Guide':isEquip?'Equipment':isSmith?'Smithing':('Crafting Recipes'+st);
  $('invHelp').classList.toggle('sel',isGuide);
  renderInventory();
}
$('tabEquip').onclick=()=>setInvTab('equip');
$('tabCraft').onclick=()=>setInvTab('craft');
$('tabSmith').onclick=()=>setInvTab('smith');
$('invHelp').onclick=()=>setInvTab(invTab==='guide'?'craft':'guide');
$('invBack').onclick=()=>{ if(uiPanel==='inv') closePanel(); };
$('guideSearch').oninput=()=>renderGuideTab();
// (legacy top-right corner buttons removed — replaced by the bottom action menu; Map opens with [M])
// ---------- bottom action menu ----------
function uiReady(){ return game && running && !uiPanel && !game.paused && !game.dead; }
$('btnActInv').onclick=()=>{ if(uiReady()) openInventory(null); };
$('btnActMap').onclick=()=>{ if(game && running && !game.paused && !game.dead){ if(uiPanel==='map') closePanel(); else if(!uiPanel) openMap(); } };
$('btnStarMap').onclick=()=>{ if(game && running && !game.paused && !game.dead) openStarMap(); };
const MILESTONE_LABELS=[
  ['night1','Survive your first night'],['village1','Discover a village'],['foundLair','Find a sea shrine'],
  ['foundCity','Find Aetheria, the sunken city'],['friendTide','Befriend the Drowned King'],['slayTide','Slay the Drowned King'],['space','Reach space'],
  ['aethon','Set foot on Aethon'],['outpost','Find an alien outpost'],['friendRuler','Befriend the Alien Ruler'],
  ['slayRuler','Slay the Alien Ruler'],['roundTrip','Complete a round trip'],['meteor','Witness a falling star'],
  ['slayMaw','Slay the Gravemaw'],['raid','Repel a village raid'],['scoutShip','Witness an alien landing'],['anomaly','Shatter the Hollow Star'],
];
function openStarMap(){ if(uiPanel) closePanel(); uiPanel='starmap'; document.exitPointerLock();
  $('starDim').textContent=game.dimension==='planet'?'Aethon':'Overworld';
  $('starOxy').textContent=(game.oxygen!=null?Math.round(game.oxygen):game.oxygenMax||10)+' / '+(game.oxygenMax||10);
  // journey log: live checklist of the world's milestones
  let box=$('starMilestones');
  if(!box){ box=document.createElement('div'); box.id='starMilestones';
    box.style.cssText='margin-top:12px;padding:10px 14px;background:rgba(10,16,28,.55);border:1px solid #28304a;border-radius:8px;font-size:12.5px;line-height:1.75;max-height:180px;overflow-y:auto';
    const host=$('starMapScreen').firstElementChild||$('starMapScreen'); host.appendChild(box); }
  const ms=game.milestones||{};
  const jn=game.journal||{mobs:{},kills:{},biomes:{}};
  const allKinds=Object.keys(MOB_DEF), seen=allKinds.filter(k=>jn.mobs[k]);
  const pretty=k=>k.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
  const bestiary=allKinds.map(k=> jn.mobs[k]
    ? '<span style="color:#9ee6ff">'+pretty(k)+(jn.kills[k]?' <span style="color:#c99">×'+jn.kills[k]+'</span>':'')+'</span>'
    : '<span style="color:#3a4763">???</span>').join(' · ');
  const biomes=Object.keys(jn.biomes||{});
  box.innerHTML='<b style="color:#7ec8e3">JOURNEY LOG</b><br>'+MILESTONE_LABELS.map(([k,l])=>
    (ms[k]?'<span style="color:#5ec46a">★ '+l+'</span>':'<span style="color:#5a6a86">☆ '+l+'</span>')).join('<br>')
    +'<br><b style="color:#7ec8e3">BESTIARY</b> <span style="color:#8a9ab6">'+seen.length+' / '+allKinds.length+' creatures</span><br>'
    +'<div style="line-height:1.5">'+bestiary+'</div>'
    +'<b style="color:#7ec8e3">LANDS EXPLORED</b> <span style="color:#8a9ab6">'+biomes.length+'</span> — '+(biomes.map(pretty).join(', ')||'<span style="color:#5a6a86">none yet</span>');
  $('starMapScreen').classList.remove('hidden');
}
// sync the key badges on the action buttons with the (rebindable) keybinds
function updateActionHotkeys(){
  const set=(id,code)=>{ const k=$(id); if(k) k.textContent=keyLabel(code); };
  set('kbInv',KEYBINDS.inventory); set('kbMap',KEYBINDS.map); set('kbStar',KEYBINDS.starmap);
  const mapHint=$('mapCloseHint'); if(mapHint) mapHint.textContent=`[${keyLabel(KEYBINDS.map)}] / [Esc] to close`;
  const credit=$('controlsCredit'); if(credit) credit.innerHTML=`Controls — <b>${keyLabel(KEYBINDS.forward)}/${keyLabel(KEYBINDS.left)}/${keyLabel(KEYBINDS.back)}/${keyLabel(KEYBINDS.right)}</b> move · <b>${keyLabel(KEYBINDS.jump)}</b> jump · <b>${keyLabel(KEYBINDS.sprint)}</b> sprint · mouse look · <b>LMB</b> mine · <b>RMB</b> place/use · <b>${keyLabel(KEYBINDS.inventory)}</b> inventory · <b>${keyLabel(KEYBINDS.interact)}</b> interact · <b>${keyLabel(KEYBINDS.map)}</b> map · <b>${keyLabel(KEYBINDS.starmap)}</b> star map · <b>Esc</b> pause · rebind controls in Options`;
}
function renderInventory(){
  fillGrid($('invGrid'),'inv',9,36); fillGrid($('invHotbar'),'inv',0,9); renderArmorSlots();
  // number the backpack hotbar row 1-9, like the reference
  [...$('invHotbar').children].forEach((c,i)=>{ if(!c.querySelector('.keynum')){ const k=el('span','keynum'); k.textContent=i+1; c.insertBefore(k,c.firstChild); } });
  if(invTab==='smith') renderBlocksTab(); else if(invTab==='equip') renderGearTab(); else if(invTab==='guide') renderGuideTab(); else renderRecipes();
}
function renderArmorSlots(){ const node=$('armorSlots'); node.innerHTML='';
  for(const slot of ['head','chest','legs','feet']){ const c=makeCell('armor',slot);
    if(!game.player.armor[slot]){ const g=el('span','ghostLbl'); g.textContent=slot[0].toUpperCase()+slot.slice(1); c.appendChild(g); }
    node.appendChild(c);
  }
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
    if (['tallgrass','flower','mushroom','cactus','leaves','sugarcane','sugar_cane','kelp','shrub'].some(k=>name.includes(k))) return 'Plants';
    if (['chest','bench','furnace','door','ladder','fence','stair','slab','bed','bookshelf','rooftile','bed_foot','banner','carpet','path','window','potted','barrel'].some(k=>name.includes(k))) return 'Housing & Decor';
    if (['plank','cobble','brick','stonebrick','sandstone','glass','wool','pumpkin','melon','terracotta','basalt','obsidian','smooth','cut_','coal_block','packed','frosted','polished','dark_plank','chiseled','mossy','cracked','hay','quartz','netherbrick','cake'].some(k=>name.includes(k))) return 'Building';
    if (['grass','dirt','stone','sand','gravel','log','nether','mycel','soul','ore','deep','dark','clay','snow','ice','water','searock','rubble'].some(k=>name.includes(k))) return 'Natural';
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
  // Hytale-style equipment page: armor column on the left, live stat readouts beside it
  const wrap=el('div','equipRow'); wrap.style.gridColumn='1/-1';
  const col=el('div','equipCol');
  for(const slot of ['head','chest','legs','feet']){ const c=makeCell('armor',slot);
    if(!game.player.armor[slot]){ const g=el('span','ghostLbl'); g.textContent=slot; c.appendChild(g); }
    col.appendChild(c); }
  wrap.appendChild(col);
  const p=game.player, st=el('div','statCol');
  const line=(ico,v,mx)=>{ const d=el('div','statLine'); d.innerHTML='<span class="sIco">'+ico+'</span> '+Math.max(0,Math.round(v/mx*100))+'/100'; st.appendChild(d); };
  line('❤️',p.health,20); line('🍗',p.hunger,20); line('⚡',p.stamina,p.maxStamina||10);
  wrap.appendChild(st);
  // cosmetic accessory grid (2x4) on the right, like the reference layout
  const acc=el('div','accGrid'); for(let i=0;i<8;i++) acc.appendChild(el('div','cell'));
  wrap.appendChild(acc); list.appendChild(wrap);
  if(game.mode!=='creative') return;   // survival: equipment page only; creative also gets the catalog below
  const groups = {
    'Tools': it => it.tool && !it.id.includes('sword') && !it.shoots,
    'Weapons': it => it.shoots || it.id.includes('sword'),
    'Armor': it => it.armorSlot,
    'Space & Rocket': it => ['space_shard','alien_alloy','circuit','rocket_fuel','oxygen_tank','engine_core','guidance_computer','oxidizer_cell','battery','solar_panel','launchpad','fuel_tank','rocket_hull','rocket_nose','rocket_fin','science_bench'].includes(it.id),
    'Misc': it => it.fishes || it.effect || it.id.includes('diamond') || it.id.includes('fiber') || it.id.includes('string') || it.id.includes('gel') || it.id.includes('leather'),
    // catch-all so every remaining giveable material is reachable in creative
    'Materials': it => !it.blockId && !it.tool && !it.armorSlot && !it.food && !it.shoots && !it.fishes && !it.effect
  };
  const listed=new Set();
  for(const [cat, filter] of Object.entries(groups)){
    const h=el('div','catHead'); h.textContent=cat; list.appendChild(h);
    for(const it of Object.values(ITEMS)){ if(!filter(it) || (cat==='Materials'&&listed.has(it.id))) continue; listed.add(it.id);
      const cell=el('div','cell'); const im=el('img'); im.src=iconURL(it.id); im.style.cssText='width:32px;height:32px;image-rendering:pixelated'; cell.appendChild(im);
      cell.onmouseenter=ev=>showTip(ev,it); cell.onmouseleave=hideTip;
      cell.onmousedown = (ev) => {
        ev.preventDefault();
        if (ev.button === 2 && it.armorSlot) {
          // right click armor in gear tab to equip directly
          const slot = it.armorSlot;
          const existing = game.player.armor[slot];
          if (existing) {
            game._giveOrDrop(existing.item, existing.count||1);
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
    const out=ITEMS[r.out[0]]; const box=el('div','rslot'); const im=el('img'); im.src=iconURL(r.out[0]); box.appendChild(im); row.appendChild(box);
    const info=el('div','rinfo'); const nm=el('b'); nm.textContent=out.name+(r.out[1]>1?' ×'+r.out[1]:''); info.appendChild(nm);
    const cost=el('div','rcost');
    for(const n of r.need){ const has=game.countItem(n[0])>=n[1]; const ring=el('span','ring'+(has?'':' miss'));
      ring.textContent=n[1]+'× '; const ci=el('img'); ci.src=iconURL(n[0]); ci.title=ITEMS[n[0]].name; ring.appendChild(ci); cost.appendChild(ring); }
    info.appendChild(cost); row.appendChild(info);
    row.onclick=()=>{ if(game.craft(r)){ renderInventory(); refreshHotbar(); }
      else { row.classList.remove('denied'); void row.offsetWidth; row.classList.add('denied'); setTimeout(()=>row.classList.remove('denied'),260); } };
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
  syncOpenContainer();
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
