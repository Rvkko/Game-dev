/* =====================================================================
   Voxhaven — rocket.js
   Late-game rocket: build/repair via a Launchpad dashboard, dramatic
   countdown + VFX, then a CONTROLLABLE space-flight phase to Aethon.
   Extends Game.prototype via guarded hooks called from game.js
   (_initRocket, _rocketTick) and overrides _spaceInteract for the pad.
   Self-contained: injects its own UI + CSS. Rocket build state lives in
   the Launchpad block's meta (so it saves with the world for free).
   Depends on globals: THREE, B, BLOCKS, ITEMS, Game, Audio, clamp, M, ME, box.
   ===================================================================== */
(function(){
'use strict';
if(typeof Game==='undefined') return;

// ---------- procedural audio cues (built on the global Audio helper) ----------
const SND = {
  beep(){ Audio.blip(880,0.08,'square',0.22); },
  lowbeep(){ Audio.blip(440,0.1,'square',0.2); },
  alarm(){ Audio.blip(620,0.14,'sawtooth',0.25); setTimeout(()=>Audio.blip(520,0.14,'sawtooth',0.22),150); },
  clank(){ Audio.blip(150,0.18,'square',0.3); Audio.noise(0.12,0.25,200); },
  ignite(){ Audio.noise(0.6,0.5,120); Audio.blip(70,0.7,'sawtooth',0.35); },
  rumble(v){ Audio.noise(0.25,0.18*(v||1),90); },
  click(){ Audio.blip(520,0.04,'square',0.15); },
};

// ---------- detailed multi-part rocket model (~11 units tall, base at y=0) ----------
// The flight rocket. Built to MATCH the in-world voxel ship you walked into —
// blocky, stepped grey metal hull, red engine base, a front glass cockpit band,
// a compact top module + nose, fins and a metal door. Same silhouette/colours/
// door so it reads as the SAME ship on the ground, in the air and in space.
function buildRocketModel(){
  const g=new THREE.Group();
  const steel=M('#aeb4bc'), steel2=M('#c2c6cd'), dark=M('#3a3f47'), red=M('#c64a2a');
  const glass=new THREE.MeshLambertMaterial({color:0x1a3450, emissive:0x0a1a2a});
  const glow=[], nav=[];
  // red ENGINE BASE (wide, short) + deck
  g.add(box(2.6,1.0,2.6, red, 0,0.5,0));
  g.add(box(2.74,0.18,2.74, dark, 0,1.0,0));
  // stepped grey HULL tiers (the screenshot's layered body)
  g.add(box(2.4,2.0,2.4, steel, 0,2.1,0));        // lower hull
  g.add(box(2.0,1.6,2.0, steel2, 0,3.9,0));       // mid hull (stepped in)
  g.add(box(1.5,1.4,1.5, steel, 0,5.4,0));        // upper hull
  // front GLASS cockpit band (−z)
  g.add(box(1.5,0.7,0.07, glass, 0,3.95,-1.02));
  // compact TOP module + red accent + nose
  g.add(box(1.0,0.9,1.0, steel2, 0,6.55,0));
  g.add(box(0.42,0.42,0.12, red, 0,6.7,-0.56));
  const nose=new THREE.Mesh(new THREE.ConeGeometry(0.72,1.3,4), steel2); nose.position.y=7.65; nose.rotation.y=Math.PI/4; g.add(nose);
  // METAL DOOR on the lower hull front (visual continuity with the ship you built)
  g.add(box(0.74,1.5,0.08, dark, 0,1.95,-1.22));
  g.add(box(0.5,1.1,0.07, steel, 0,1.95,-1.25));
  g.add(box(0.8,0.14,0.09, red, 0,1.45,-1.24));   // red door stripe
  // fins at the base corners
  for(let i=0;i<4;i++){ const a=i*Math.PI/2+Math.PI/4; const f=box(0.2,1.3,0.2, dark, Math.cos(a)*1.45,0.8,Math.sin(a)*1.45); g.add(f); }
  // deployable LANDING LEGS (hidden in flight, swung out on descent / when landed)
  const legs=[];
  for(let i=0;i<4;i++){ const a=i*Math.PI/2+Math.PI/4; const leg=new THREE.Group();
    leg.add(box(0.16,1.5,0.16, dark, 0,-0.75,0)); leg.add(box(0.5,0.14,0.5, M('#52555c'), 0,-1.5,0));   // strut + foot pad
    leg.position.set(Math.cos(a)*1.2,1.0,Math.sin(a)*1.2); leg.rotation.z=Math.cos(a)*0.5; leg.rotation.x=-Math.sin(a)*0.5;
    leg.visible=false; g.add(leg); legs.push(leg); }
  // engine bells + flame glow (revealed on thrust)
  for(let i=0;i<5;i++){ const a=i<4?i*Math.PI/2:0, r=i<4?0.72:0; const bx=Math.cos(a)*r, bz=Math.sin(a)*r;
    const bell=new THREE.Mesh(new THREE.ConeGeometry(0.3,0.55,10), M('#52555c')); bell.position.set(bx,-0.15,bz); bell.rotation.x=Math.PI; g.add(bell);
    const fl=new THREE.Mesh(new THREE.ConeGeometry(0.24,0.7,10), ME('#ff8a2a','#ff7a22',1.4)); fl.position.set(bx,-0.6,bz); fl.rotation.x=Math.PI; fl.visible=false; g.add(fl); glow.push(fl); }
  // nav / warning lights (blink in tick)
  const lit=(hex,x,yy,z)=>{ const m=new THREE.Mesh(new THREE.SphereGeometry(0.1,8,6), ME(hex,hex,1.6)); m.position.set(x,yy,z); g.add(m); nav.push(m); };
  lit('#ff3030',-1.22,3.9,0); lit('#30ff50',1.22,3.9,0); lit('#ffd040',0,5.4,0.78);
  return { group:g, glow, nav, legs };
}

// cockpit interior — parented to the camera (so the player can never fall through
// it or clip out). Camera sits at origin looking down -z, out the front window.
function buildCockpit(){
  const g=new THREE.Group();
  const hull=M('#2b3039'), dark=M('#15181f'), trim=M('#39414f'), seatM=M('#3a3026');
  const scr=ME('#123048','#16466a',0.9);
  g.add(box(3.4,0.12,3.4, dark, 0,-1.25,-0.3));   // floor
  g.add(box(3.4,0.12,3.4, hull, 0,1.45,-0.3));    // ceiling
  g.add(box(0.12,2.7,3.4, hull, -1.7,0.1,-0.3));  // left wall
  g.add(box(0.12,2.7,3.4, hull, 1.7,0.1,-0.3));   // right wall
  g.add(box(3.4,2.7,0.12, hull, 0,0.1,1.4));      // back wall
  // front window frame (open in the middle so the world shows through)
  g.add(box(3.4,0.55,0.14, trim, 0,1.12,-1.75));
  g.add(box(0.5,1.5,0.14, trim, -1.45,0.3,-1.75));
  g.add(box(0.5,1.5,0.14, trim, 1.45,0.3,-1.75));
  g.add(box(3.4,0.34,0.14, trim, 0,-0.6,-1.75));
  // angled control console with screens + status lights
  const d=new THREE.Group();
  d.add(box(2.8,0.55,0.6, hull, 0,0,0));
  d.add(box(2.5,0.45,0.06, scr, 0,0.07,0.29));
  d.add(box(0.7,0.3,0.06, ME('#1a3a2a','#1a6a3a',0.8), -0.9,0.08,0.29));
  d.add(box(0.7,0.3,0.06, ME('#3a2a1a','#7a4a1a',0.8), 0.9,0.08,0.29));
  const nav=[]; const cols=['#ff4040','#ffd040','#40ff60','#40c0ff','#c060ff'];
  for(let i=0;i<5;i++){ const L=new THREE.Mesh(new THREE.SphereGeometry(0.045,8,6), ME(cols[i],cols[i],1.4)); L.position.set(-0.5+i*0.25,0.2,0.18); d.add(L); nav.push(L); }
  d.position.set(0,-0.5,-1.3); d.rotation.x=-0.5; g.add(d);
  // pilot seat
  const s=new THREE.Group(); s.add(box(0.72,0.16,0.72,seatM,0,0,0)); s.add(box(0.72,0.85,0.16,seatM,0,0.5,0.34)); s.position.set(0,-0.95,0.5); g.add(s);
  g.add(new THREE.PointLight(0x9fc0ff,0.7,5).translateY(0.8));
  g.visible=false;
  return { group:g, nav };
}

// A tiny ENCLOSED voxel room you actually walk in (reuses normal physics/collision
// so the player can never fall through or clip out). Only chunk (0,0) has the room.
class CockpitWorld extends World {
  constructor(seed){ super(seed>>>0); this.isCockpit=true; this._spawn={x:8.5,y:65.02,z:11.5}; }
  heightAt(){ return 64; }
  biomeAt(){ return BIOMES.plains; }
  surfaceY(wx,wz){ return (wx>=2&&wx<=14&&wz>=2&&wz<=14)?64:0; }
  _genFeatures(){}
  _genBase(c,cx,cz){
    if(cx!==0||cz!==0) return;               // everything outside the room is empty space
    const set=(x,y,z,id)=>this._set(c,x,y,z,id);
    const X0=2,X1=14,Z0=2,Z1=14,Y0=64,Y1=68;
    for(let x=X0;x<=X1;x++) for(let z=Z0;z<=Z1;z++){ set(x,Y0,z,B.HAB_FLOOR); set(x,Y1,z,B.HAB_PANEL); }
    for(let y=Y0;y<=Y1;y++) for(let x=X0;x<=X1;x++){
      set(x,y,Z0, (y>=65&&y<=67&&x>=5&&x<=11)?B.GLASS_DOME:B.HAB_PANEL);   // front wall + big window
      set(x,y,Z1,B.HAB_PANEL);                                            // back wall (solid — no exit into void)
    }
    for(let y=Y0;y<=Y1;y++) for(let z=Z0;z<=Z1;z++){ set(X0,y,z,B.HAB_PANEL); set(X1,y,z,B.HAB_PANEL); }
    // side + rear portholes at the same band height as the hull's exterior glass,
    // so the interior window layout matches the ship you boarded
    set(X0,66,8,B.GLASS_DOME); set(X1,66,8,B.GLASS_DOME); set(8,66,Z1,B.GLASS_DOME);
    // front control board: 6 interactable panels (one per launch step), x=5..10 @ z=3
    for(let cx2=5;cx2<=10;cx2++) set(cx2,65,Z0+1,B.SCIENCE_BENCH);
    // pilot dashboard (opens the full overview) + seat, ceiling lights
    set(8,65,Z1-2,B.SCIENCE_BENCH); set(8,65,Z1-1,B.CARPET);
    set(4,67,8,B.STAR_BEACON); set(12,67,8,B.STAR_BEACON);
  }
}

// swap the active world (reuses the dimension-teardown pattern) and place the player safely
Game.prototype._rkSwapWorld = function(target, spawn, dim){
  if(!this.player||!target) return;
  for(const [k,e] of this.chunkMeshes){ for(const m of [e.opaque,e.cutout,e.blend,e.ice]) if(m){ this.scene.remove(m); m.geometry.dispose(); } for(const o of e.objects) this._disposeSpecialObject?this._disposeSpecialObject(o):this.scene.remove(o); }
  this.chunkMeshes.clear(); this.loadQueue=[]; this.dirty=new Set();
  this._stashTamed();
  for(const m of this.mobs) this.scene.remove(m.group); this.mobs=[];
  if(this.drops){ for(const d of this.drops) if(d.spr) this.scene.remove(d.spr); this.drops=[]; }
  this.world=target; this.player.world=target; this.dimension=dim; this.inSpace=(dim==='planet');
  this.player.gravScale=(dim==='planet')?0.4:1; this.player.flying=(this.mode==='spectator');
  this.player.setPos(spawn.x, spawn.y, spawn.z); this.player.vel.set(0,0,0);
  this.maintainChunks(); for(let i=0;i<30;i++) this.processLoad(8);
  this._restoreTamed(dim);
};

// =====================================================================
//  Game.prototype additions
// =====================================================================

Game.prototype._initRocket = function(){
  this.rocket = { phase:'idle' };          // idle|countdown|ignition|ascent|flight|done
  this._rocketActive=false; this._rocketUI=false; this._rocketSuspendChunks=false;
  this._rkVfx=[];                          // pooled smoke/fire/spark particles
  this._rkShake=0;
  rkInjectUI();
};

// ---- block interaction: a Launchpad opens the rocket dashboard ----
const _origSpaceInteract = Game.prototype._spaceInteract;
const _CK_STEPS=['hatch','engines','guidance','padlock','countdown','confirm'];
Game.prototype._ckStationAt = function(x,y,z){ return (y===65 && z===3 && x>=5 && x<=10) ? _CK_STEPS[x-5] : null; };
Game.prototype._spaceInteract = function(id,x,y,z){
  try{
    if(this.dimension==='cockpit'){
      if(id===B.SCIENCE_BENCH){ this.heldSwing=1; const s=this._ckStationAt(x,y,z); if(s) this._rkCockpitStep(s); else this._openCockpitUI(); }
      return true;
    }
    if(id===B.LAUNCHPAD && this.dimension==='planet'){ this.heldSwing=1; this._rkReturnHome(x,y,z); return true; }   // on Aethon: pad = fly home
    if(id===B.LAUNCHPAD){ this.heldSwing=1; this._openRocketDash(x,y,z); return true; }
    // interior console inside a built rocket → open the dashboard for its (buried) pad
    if(id===B.SCIENCE_BENCH){ const m=this.world.getMeta(x,y,z); if(m&&m.rkConsole){ this.heldSwing=1; if(this.dimension==='planet') this._rkReturnHome(m.rkConsole[0],m.rkConsole[1],m.rkConsole[2]); else this._openRocketDash(m.rkConsole[0],m.rkConsole[1],m.rkConsole[2]); return true; } }
  }catch(e){}
  return _origSpaceInteract ? _origSpaceInteract.call(this,id,x,y,z) : false;
};
// HUD prompt shown when looking at a cockpit panel
Game.prototype._cockpitPrompt = function(x,y,z){
  const s=this._ckStationAt(x,y,z); if(!s) return '[F] Flight dashboard';
  const c=this.cockpit||{}, i=_CK_STEPS.indexOf(s);
  const names=['Close Hatch','Arm Engines','Check Guidance','Lock Launch Pad','Start Countdown','Confirm Launch'];
  const done=[c.hatch,c.engines,c.guidance,c.padlock,c.countdownArmed,false][i];
  const prevDone=[true,c.hatch,c.engines,c.guidance,c.padlock,c.countdownArmed][i];
  return '[F] '+names[i]+' — '+(done?'COMPLETE':prevDone?'READY':'WAITING');
};

// the pad always lives in the world you BOARDED from — read it there even while
// you're standing in the separate cockpit dimension
Game.prototype._rkPadW = function(){ return this._rkPadWorld || this.world; };
// read/write the rocket build record stored in the pad block's meta (persists)
Game.prototype._rkMeta = function(x,y,z){
  const W=this._rkPadW(), k=W.bkey(x,y,z); let m=W.getMeta(x,y,z)||{};
  if(!m.rk) m.rk={ engine:false, guid:false, power:false, life:false, fuel:0, ox:0, hatch:'open' };
  W.meta.set(k,m); W.deltas.set(k,B.LAUNCHPAD); return m.rk;
};

// validate the physical rocket (hull stack + nose) and clear sky over the pad
Game.prototype._rkStructure = function(x,y,z){
  const W=this._rkPadW(); let hull=0,nose=false,clear=true;
  for(let dx=-3;dx<=3;dx++) for(let dz=-3;dz<=3;dz++) for(let dy=0;dy<=10;dy++){
    const b=W.getBlock(x+dx,y+dy,z+dz); if(b===B.ROCKET_HULL) hull++; else if(b===B.ROCKET_NOSE) nose=true;
  }
  // clearance over the WHOLE 5×5 footprint, not just the centre column — shell
  // blocks (door/dome/stairs/wool/console) count as clear so it never fails itself
  const own=[B.AIR,B.ROCKET_HULL,B.ROCKET_NOSE,B.ROCKET_FIN,B.METAL_DOOR,B.GLASS_DOME,B.WOOL_RED,B.STAIRS,B.SCIENCE_BENCH];
  outer: for(let dx=-2;dx<=2;dx++) for(let dz=-2;dz<=2;dz++) for(let dy=2;dy<=14;dy++){
    const b=W.getBlock(x+dx,y+dy,z+dz); if(own.indexOf(b)<0){ clear=false; break outer; }
  }
  return { frame:(hull>=3&&nose), hull, nose, clear };
};

// carrying a Fallen Star Core (meteor-crater relic) upgrades the ship for this flight
Game.prototype._rkStarBoost = function(){
  const r=this.rocket; if(!r) return;
  if(this.countItem && this.countItem('star_core')>0){
    r.maxFuel=140; r.fuel=Math.min(140, r.fuel+40); r.hull=130;
    this.onFlash&&this.onFlash('✦ The Star Core resonates — hull reinforced, tanks enlarged');
  }
  if(this.countItem && this.countItem('anomaly_core')>0){   // tier 2 — top of the upgrade tree
    r.maxFuel=Math.max(r.maxFuel,170); r.fuel=Math.min(r.maxFuel, r.fuel+40); r.hull=Math.max(r.hull,150);
    this.onFlash&&this.onFlash('✦✦ The Hollow Star Core hums — this ship fears nothing now');
  }
};
Game.prototype._rkReady = function(rk,st){
  const helm=this.player&&this.player.armor&&this.player.armor.head;
  const oxygenGear=this.mode!=='survival'||!!(helm&&ITEMS[helm.item]&&ITEMS[helm.item].oxygen);
  return st.frame && st.clear && rk.engine && rk.guid && rk.power && rk.life && rk.fuel>=3 && rk.ox>=3 && rk.hatch==='closed' && oxygenGear;
};

// Keep the launch GROUNDED in the real world: re-assert a daytime sky during
// countdown/ascent (p:0 = clear day on the ground, 1 = space) so space never
// shows before liftoff. Runs after updateSky() in the frame, so it wins.
Game.prototype._rkGroundSky = function(p){
  p=clamp(p,0,1);
  // alien-tinted sky when launching FROM Aethon, Earth-blue when launching from home
  const onPlanet = (this.dimension==='planet') || (this._rkReturnDim==='planet');
  const q=this._rkSkyScratch||(this._rkSkyScratch={ground:new THREE.Color(),space:new THREE.Color(0x05060e),mix:new THREE.Color()});
  q.ground.setHex(onPlanet?0x3a1c46:0x9fc8f0); const c=q.mix.copy(q.ground).lerp(q.space,p);
  if(this.scene.background&&this.scene.background.isColor) this.scene.background.copy(c); else this.scene.background=c.clone();
  if(this.scene.fog){ this.scene.fog.color.copy(c);
    this.scene.fog.near=this.renderDist*CHUNK_X*(0.9+p*40); this.scene.fog.far=this.renderDist*CHUNK_X*(1.6+p*60); }
  if(this.stars) this.stars.material.opacity=p;
  this.sun.intensity=0.08+0.5*(1-p); this.hemi.intensity=0.58+0.32*(1-p); this.ambient.intensity=0.40+0.12*(1-p);
};

// clear the launch column above the pad (used by creative auto-clear so the
// rocket never tries to lift off through trees/leaves)
Game.prototype._rkClearColumn = function(x,y,z){
  const W=this._rkPadW();
  for(let dx=-1;dx<=1;dx++) for(let dz=-1;dz<=1;dz++) for(let dy=2;dy<=18;dy++){
    const b=W.getBlock(x+dx,y+dy,z+dz);
    if(b!==B.AIR && b!==B.ROCKET_HULL && b!==B.ROCKET_NOSE && b!==B.ROCKET_FIN){ W.setBlock(x+dx,y+dy,z+dz,B.AIR); W.deltas.set(W.bkey(x+dx,y+dy,z+dz),B.AIR); if(this.world===W) this._markDirtyAround(x+dx,y+dy,z+dz); }
  }
};

// Build a REAL, hollow, walk-in voxel rocket on the pad out of real blocks, in
// the screenshot's style: a red ENGINE BASE (raised 1 block), a stepped grey
// metal HULL, a GLASS cockpit band, a compact TOP module + nose, fins, a real
// openable METAL DOOR, exterior STAIRS up to the raised entrance, and an
// interior control console. Nothing is decorative — every block can be broken,
// removed and replaced, and it satisfies the hull/nose structure check so you
// board & launch this exact ship.
//   footprint = rounded 5×5 (corners cut). dy is relative to the pad cell:
//   dy1 engine base (you step up onto it), dy2..6 hull walls (interior floor =
//   base top, you stand at dy2), dy5 glass band, dy7 taper, dy8 top module, dy9 nose.
Game.prototype._rkBuildShell = function(x,y,z){
  const cells=[]; const put=(dx,dy,dz,id,meta)=>{ this.setBlock(x+dx,y+dy,z+dz,id,meta); cells.push([x+dx,y+dy,z+dz]); };
  const inFoot=(dx,dz)=> (dx*dx+dz*dz)<=5;                 // rounded 5×5 (drops the 4 corners)
  const isWall=(dx,dz)=> inFoot(dx,dz) && !(inFoot(dx-1,dz)&&inFoot(dx+1,dz)&&inFoot(dx,dz-1)&&inFoot(dx,dz+1)); // perimeter ring
  const DOOR_DZ=-2;                                        // entrance faces −z (front)
  // ---- clear the launch column: terrain, trees, and canopy inside and above
  // the FULL 5×5 square (matches the clearance check — sloped ground/corner
  // trees otherwise fill the interior or block liftoff)
  for(let dx=-2;dx<=2;dx++) for(let dz=-2;dz<=2;dz++){
    for(let yy=y+1; yy<=y+15; yy++){ if(this.world.getBlock(x+dx,yy,z+dz)!==B.AIR) this.setBlock(x+dx,yy,z+dz,B.AIR); } }
  // ---- LAUNCH BASE: flatten + fill a solid apron under the whole footprint so
  // the ship rests on a real platform, never balancing on the single pad block.
  // (Plain setBlock, NOT tracked in cells — the platform stays behind at liftoff.)
  for(let dx=-3;dx<=3;dx++) for(let dz=-4;dz<=3;dz++){
    const inApron=(dx*dx+dz*dz<=9) || (dz>=DOOR_DZ-2&&dz<=DOOR_DZ-1&&Math.abs(dx)<=1);   // pad ring + stair landing
    if(!inApron || (dx===0&&dz===0)) continue;
    this.setBlock(x+dx,y,z+dz,B.STONEBRICK);
    for(let yy=y-1; yy>y-9 && !this.world.isSolid(x+dx,yy,z+dz); yy--) this.setBlock(x+dx,yy,z+dz,B.STONE);   // pillars down to solid ground
    for(let yy=y+1; yy<=y+2; yy++){ const b=this.world.getBlock(x+dx,yy,z+dz); if(b===B.TALLGRASS||b===B.FLOWER_R||b===B.FLOWER_B||b===B.MUSHROOM) this.setBlock(x+dx,yy,z+dz,B.AIR); }
  }
  // ---- red ENGINE BASE (dy1): a solid raised deck, red accent ring (the lower engine section) ----
  for(let dx=-2;dx<=2;dx++) for(let dz=-2;dz<=2;dz++){ if(!inFoot(dx,dz)) continue; put(dx,1,dz, isWall(dx,dz)?B.WOOL_RED:B.ROCKET_HULL); }
  // ---- HULL walls dy2..dy6, hollow interior. Metal door at the front, glass cockpit band ----
  for(let dy=2;dy<=6;dy++) for(let dx=-2;dx<=2;dx++) for(let dz=-2;dz<=2;dz++){
    if(!isWall(dx,dz)) continue;
    const isDoorCol=(dx===0&&dz===DOOR_DZ);
    if(isDoorCol && dy===2){ put(dx,dy,dz,B.METAL_DOOR,{rot:0,open:false,hinge:1}); continue; }   // real openable METAL door
    if(isDoorCol && dy===3) continue;                                                              // headroom above the door
    if(dy===5 && dz===DOOR_DZ && Math.abs(dx)<=1){ put(dx,dy,dz,B.GLASS_DOME); continue; }         // front cockpit glass band
    if(dy===5 && (Math.abs(dx)===2||Math.abs(dz)===2) && (dx===0||dz===0)){ put(dx,dy,dz,B.GLASS_DOME); continue; } // side portholes
    put(dx,dy,dz,B.ROCKET_HULL);
  }
  // ---- stepped taper + compact TOP module + nose (the screenshot's upper section) ----
  for(let dx=-1;dx<=1;dx++) for(let dz=-1;dz<=1;dz++) put(dx,7,dz,B.ROCKET_HULL);   // ceiling / step-in
  put(0,8,DOOR_DZ===-2?-1:0,B.WOOL_RED);                                            // small red marker on the top box
  for(let dx=-1;dx<=1;dx++) for(let dz=-1;dz<=1;dz++){ if(Math.abs(dx)+Math.abs(dz)<=1) put(dx,8,dz,B.ROCKET_HULL); } // compact top box (+shape)
  put(0,9,0,B.ROCKET_NOSE);                                                          // nose cap
  // ---- fins at the cut corners (real, removable) ----
  for(const [fx,fz] of [[-2,-2],[2,-2],[-2,2],[2,2]]){ put(fx,1,fz,B.ROCKET_FIN); put(fx,2,fz,B.ROCKET_FIN); }
  // ---- exterior STAIRS up to the raised entrance (rot=π so they rise TOWARD the door) ----
  for(let dx=-1;dx<=1;dx++){ put(dx,1,DOOR_DZ-1,B.STAIRS,{rot:Math.PI}); }
  // ---- interior control console against the back wall, FACING the entrance (rot=π) ----
  put(0,2,1,B.SCIENCE_BENCH,{rkConsole:[x,y,z], rot:Math.PI});
  this._rkShell={ pad:[x,y,z], cells };
  // put the player OUTSIDE at the front door, facing the rocket (never sealed inside)
  if(this.player){ const fz=z+DOOR_DZ-2, sy=this.world.surfaceY(x,fz);
    this.player.setPos(x+0.5, Math.max(sy,y)+1.05, fz+0.5); this.player.vel.set(0,0,0); this.player.yaw=Math.PI; this.player.pitch=0; }
  this.onFlash&&this.onFlash('Rocket built in front of you — walk up the stairs, open the metal door, step inside, and use the console. Every block is real.');
  SND.clank();
};
// remove the physical shell (the rocket "leaves the pad" on launch); leaves the pad block
Game.prototype._rkClearShell = function(){
  const W=this._rkPadW();
  const s=this._rkShell;
  if(s){
    for(const [cx,cy,cz] of s.cells){ const k=W.bkey(cx,cy,cz); W.setBlock(cx,cy,cz,B.AIR); W.deltas.set(k,B.AIR); W.meta.delete(k); if(this.world===W) this._markDirtyAround(cx,cy,cz); }
    this._rkShell=null; return;
  }
  // fallback after a save/reload (the cells list is transient): sweep the known
  // shell footprint around the pad and clear only shell-owned block ids
  if(!this._rkPad) return;
  const [px,py,pz]=this._rkPad;
  const OWN=[B.ROCKET_HULL,B.ROCKET_NOSE,B.ROCKET_FIN,B.METAL_DOOR,B.GLASS_DOME,B.WOOL_RED,B.STAIRS,B.SCIENCE_BENCH];
  for(let dx=-3;dx<=3;dx++) for(let dz=-4;dz<=3;dz++) for(let dy=1;dy<=11;dy++){
    const x=px+dx, y=py+dy, z=pz+dz;
    if(OWN.indexOf(W.getBlock(x,y,z))<0) continue;
    const k=W.bkey(x,y,z); W.setBlock(x,y,z,B.AIR); W.deltas.set(k,B.AIR); W.meta.delete(k);
    if(this.world===W) this._markDirtyAround(x,y,z);
  }
};

// ---------- dashboard ----------
Game.prototype._openRocketDash = function(x,y,z){
  if(this.inSpace){ this.onFlash&&this.onFlash('No launchpad needed on Aethon'); }
  this._rkPad=[x,y,z]; this._rkPadWorld=this.world; this._rocketUI=true;   // remember the pad's world for the cockpit checklist
  try{ document.exitPointerLock(); }catch(e){}
  document.getElementById('rkDash').style.display='flex';
  this._renderRocketDash();
};
Game.prototype._closeRocketDash = function(){
  this._rocketUI=false; document.getElementById('rkDash').style.display='none';
  document.getElementById('rkManual').style.display='none';
};
Game.prototype._renderRocketDash = function(){
  if(!this._rkPad) return;
  const [x,y,z]=this._rkPad, rk=this._rkMeta(x,y,z), st=this._rkStructure(x,y,z);
  const ready=this._rkReady(rk,st), helm=this.player&&this.player.armor&&this.player.armor.head;
  const oxygenGear=this.mode!=='survival'||!!(helm&&ITEMS[helm.item]&&ITEMS[helm.item].oxygen);
  const row=(label,ok,extra)=>`<div class="rkrow"><span>${label}</span><b class="${ok?'ok':'bad'}">${extra||(ok?'READY':'MISSING')}</b></div>`;
  const have=id=>this.countItem(id);
  const btn=(id,label,cond)=>cond?`<button data-rk="${id}" class="rkbtn">${label}</button>`:'';
  document.getElementById('rkBody').innerHTML =
    `<div class="rktitle">🚀 V-1 "PIONEER" — Rocket Status</div>`+
    `<button id="rkAuto" class="rkbtn auto">⚙ Auto-Assemble ${this.mode==='creative'?'(creative: free)':'(uses your parts)'}</button>`+
    `<button id="rkShell" class="rkbtn">🏗 Build Rocket Shell (real, walk-in)</button>`+
    row('Frame &amp; Hull', st.frame, st.frame?'READY':'BUILD 3+ HULL + NOSE — or “Build Rocket Shell”')+
    row('Engine Core', rk.engine)+ btn('engine','Install Engine Core ('+have('engine_core')+')', !rk.engine)+
    row('Guidance Computer', rk.guid)+ btn('guid','Install Guidance ('+have('guidance_computer')+')', !rk.guid)+
    row('Power Battery', rk.power)+ btn('power','Install Battery ('+have('battery')+')', !rk.power)+
    row('Life Support', rk.life)+ btn('life','Install Oxygen Tank ('+have('oxygen_tank')+')', !rk.life)+
    row('Oxygen Helmet', oxygenGear, oxygenGear?'EQUIPPED':'EQUIP A SPACESUIT HELMET')+
    row('Fuel Cells', rk.fuel>=3, rk.fuel+'/5')+ btn('fuel','Fill Fuel ('+have('rocket_fuel')+' held)', rk.fuel<5)+
    row('Oxidizer Cells', rk.ox>=3, rk.ox+'/5')+ btn('ox','Fill Oxidizer ('+have('oxidizer_cell')+' held)', rk.ox<5)+
    row('Hatch', rk.hatch==='closed', rk.hatch.toUpperCase())+ `<button data-rk="hatch" class="rkbtn">${rk.hatch==='closed'?'Open':'Close'} Hatch</button>`+
    row('Clear Sky', st.clear)+
    row('Launch Pad Lock', true)+
    `<div class="rkrow big"><span>LAUNCH STATUS</span><b class="${ready?'ok':'bad'}">${ready?'READY FOR LAUNCH':'NOT READY'}</b></div>`+
    `<div class="rkactions">`+
      `<button id="rkBoard" class="rkbtn go" ${st.frame?'':'disabled'}>🚀 BOARD ROCKET&nbsp;[L]</button>`+
      `<button id="rkManualBtn" class="rkbtn">📖 Rocket Manual</button>`+
      `<button id="rkClose" class="rkbtn">Close&nbsp;[Esc]</button>`+
    `</div>`;
};
// dashboard button actions (consume an item from inventory, set meta)
Game.prototype._rkInstall = function(part){
  if(!this._rkPad) return; const [x,y,z]=this._rkPad, rk=this._rkMeta(x,y,z);
  const take=(id)=>{ if(this.countItem(id)>0){ this.takeItem(id,1); return true; } this.onFlash&&this.onFlash('Need '+(ITEMS[id]?ITEMS[id].name:id)); return false; };
  let ok=false;
  if(part==='engine'&&!rk.engine) ok=take('engine_core')&&(rk.engine=true);
  else if(part==='guid'&&!rk.guid) ok=take('guidance_computer')&&(rk.guid=true);
  else if(part==='power'&&!rk.power) ok=take('battery')&&(rk.power=true);
  else if(part==='life'&&!rk.life) ok=take('oxygen_tank')&&(rk.life=true);
  else if(part==='fuel'&&rk.fuel<5){ while(rk.fuel<5 && this.countItem('rocket_fuel')>0){ this.takeItem('rocket_fuel',1); rk.fuel++; ok=true; } if(!ok) this.onFlash&&this.onFlash('Need Rocket Fuel'); }
  else if(part==='ox'&&rk.ox<5){ while(rk.ox<5 && this.countItem('oxidizer_cell')>0){ this.takeItem('oxidizer_cell',1); rk.ox++; ok=true; } if(!ok) this.onFlash&&this.onFlash('Need Oxidizer Cells'); }
  else if(part==='hatch'){ rk.hatch = rk.hatch==='closed'?'open':'closed'; ok=true; SND.clank(); }
  if(ok){ SND.click(); const W=this.world,k=W.bkey(x,y,z); const m=W.getMeta(x,y,z); m.rk=rk; W.meta.set(k,m); W.deltas.set(k,B.LAUNCHPAD); this._renderRocketDash(); if(typeof refreshHotbar==='function') refreshHotbar(); }
};
// one-click assembly: install everything you have (creative fabricates the rest), fill cells, close hatch
Game.prototype._rkAutoAssemble = function(){
  if(!this._rkPad) return; const [x,y,z]=this._rkPad, rk=this._rkMeta(x,y,z), creative=this.mode==='creative';
  const miss=[];
  const part=(flag,item)=>{ if(rk[flag]) return; if(this.countItem(item)>0){ this.takeItem(item,1); rk[flag]=true; } else if(creative){ rk[flag]=true; } else miss.push(ITEMS[item].name); };
  part('engine','engine_core'); part('guid','guidance_computer'); part('power','battery'); part('life','oxygen_tank');
  const fill=(key,item)=>{ while(rk[key]<5){ if(this.countItem(item)>0){ this.takeItem(item,1); rk[key]++; } else if(creative){ rk[key]++; } else { if(rk[key]<3) miss.push(ITEMS[item].name); break; } } };
  fill('fuel','rocket_fuel'); fill('ox','oxidizer_cell'); rk.hatch='closed';
  const W=this.world,k=W.bkey(x,y,z); const m=W.getMeta(x,y,z); m.rk=rk; W.meta.set(k,m); W.deltas.set(k,B.LAUNCHPAD);
  if(!this._rkStructure(x,y,z).frame) this._rkBuildShell(x,y,z);   // no frame yet → raise a real walk-in rocket shell
  SND.clank(); this._renderRocketDash(); if(typeof refreshHotbar==='function') refreshHotbar();
  const st=this._rkStructure(x,y,z);
  if(!st.frame) miss.push('Rocket frame: stack 3+ Hull + a Nose Cone by the pad');
  if(!st.clear) miss.push('Clear the sky above the pad');
  this.onFlash && this.onFlash(miss.length ? ('Still need: '+[...new Set(miss)].join(' · ')) : 'Rocket assembled — press L to launch!');
};

// ---------- boarding → cockpit ----------
Game.prototype._rocketBoard = function(){
  if(this._rocketActive || this._inCockpit || (this.rocket && this.rocket.phase!=='idle')){ this.onFlash&&this.onFlash('Already in flight'); return; }
  if(!this._rkPad) return; const [x,y,z]=this._rkPad, st=this._rkStructure(x,y,z);
  if(!st.frame){ this.onFlash&&this.onFlash('Build the rocket frame first: stack 3+ Hull + a Nose Cone'); return; }
  // boarding is physical: you must be standing INSIDE the shell (through the metal door)
  if(this._rkShell && this.player){
    const dx=this.player.pos.x-(x+0.5), dz=this.player.pos.z-(z+0.5), dy=this.player.pos.y-y;
    if(Math.abs(dx)>2.2 || Math.abs(dz)>2.2 || dy<0 || dy>7){
      this._closeRocketDash();
      this.onFlash&&this.onFlash('Walk up the stairs, open the METAL DOOR, and step inside — then board from the console (F).');
      return;
    }
  }
  this._closeRocketDash();
  const fade=document.getElementById('fade'); if(fade) fade.classList.add('show');
  this.onFlash&&this.onFlash('Boarding…');
  setTimeout(()=>{ try{ this._enterCockpitWorld(); }catch(e){} if(fade) setTimeout(()=>fade.classList.remove('show'),160); }, 640);
};
// board → walk inside the cockpit room (a real voxel dimension)
Game.prototype._enterCockpitWorld = function(){
  if(!this.cockpitWorld) this.cockpitWorld=new CockpitWorld(((this.overworld&&this.overworld.seed)||1)^0xC0CC17);
  this._rkReturnWorld=this.world; this._rkReturnDim=this.dimension;   // where BOARD launched from
  this._rkSwapWorld(this.cockpitWorld, this.cockpitWorld._spawn, 'cockpit');
  for(let i=0;i<6;i++) this.setBlock(5+i,65,3,B.SCIENCE_BENCH);   // fresh (un-lit) panels each board
  this.cockpit={ hatch:false, engines:false, guidance:false, padlock:false, countdownArmed:false };
  this.viewMode='first'; this.player.yaw=0; this.player.pitch=0;   // face the console & window (−z)
  this.onFlash&&this.onFlash('Aboard the cockpit. Walk to the glowing console and press F for the launch checklist.');
  this.onRequestLock&&this.onRequestLock();
};
// open / close the checklist panel (freezes the walker while it's up, like the inventory)
Game.prototype._openCockpitUI = function(){
  this._inCockpit=true; this._rocketUI=true;
  try{ document.exitPointerLock(); }catch(e){}
  document.getElementById('rkCockpit').style.display='flex';
  this._renderCockpit(); SND.lowbeep();
};
Game.prototype._closeCockpitUI = function(){
  this._inCockpit=false; this._rocketUI=false;
  try{ document.getElementById('rkCockpit').style.display='none'; }catch(e){}
  this.onRequestLock && this.onRequestLock();
};
// leave the rocket entirely (back to wherever you boarded from)
Game.prototype._rkExitCockpit = function(){
  this._closeCockpitUI();
  const fade=document.getElementById('fade'); if(fade) fade.classList.add('show');
  setTimeout(()=>{
    const p=this._rkPad, tgt=this._rkReturnWorld||this.overworld, dim=this._rkReturnDim||'overworld';
    // exit at the FRONT-door side (entrance faces −z), never inside the back wall
    this._rkSwapWorld(tgt, {x:p[0]+0.5,y:p[1]+1.02,z:p[2]-3.5}, dim);
    this.rocket={phase:'idle'};
    if(fade) setTimeout(()=>fade.classList.remove('show'),140);
    this.onRequestLock && this.onRequestLock();
  }, 520);
};
// cockpit launch checklist (sequential; launch blocked until all complete)
Game.prototype._rkCockpitStep = function(name){
  const c=this.cockpit; if(!c||!this._rkPad) return; const [x,y,z]=this._rkPad, rk=this._rkMeta(x,y,z);
  const f=m=>this.onFlash&&this.onFlash(m);
  if(name==='hatch'){ c.hatch=true; rk.hatch='closed'; SND.clank(); f('Hatch sealed'); }
  else if(name==='engines'){ if(!c.hatch) return f('Close the hatch first'); if(!rk.engine) return f('No Engine Core installed'); c.engines=true; SND.lowbeep(); f('Engines armed'); }
  else if(name==='guidance'){ if(!c.engines) return f('Arm the engines first'); if(!rk.guid) return f('Guidance computer missing — check FAILED'); c.guidance=true; SND.beep(); f('Guidance check passed'); }
  else if(name==='padlock'){ if(!c.guidance) return f('Run the guidance check first'); c.padlock=true; SND.clank(); f('Launch pad locked'); }
  else if(name==='countdown'){ if(!c.padlock) return f('Lock the launch pad first'); if(!(rk.fuel>=3&&rk.ox>=3&&rk.power&&rk.life)) return f('Fuel / Oxidizer / Power / Life-support not ready');
    let st=this._rkStructure(x,y,z); if(!st.clear){ if(this.mode==='creative'){ this._rkClearColumn(x,y,z); } else return f('Launch blocked — clear the column above the rocket'); }
    c.countdownArmed=true; SND.beep(); f('Ready — press CONFIRM LAUNCH'); }
  else if(name==='confirm'){ if(!c.countdownArmed) return f('Start the countdown first'); this._launchFromCockpit(); return; }
  this._ckLightPanel(name);   // glow the panel just completed
  this._renderCockpit();
};
// swap a completed step's panel to a glowing beacon so progress is visible while walking
Game.prototype._ckLightPanel = function(name){
  if(this.dimension!=='cockpit') return;
  const i=_CK_STEPS.indexOf(name); if(i<0||i>4) return;
  this.setBlock(5+i,65,3,B.STAR_BEACON);
};
// confirm → fade out of the cockpit room, back to the pad, third-person countdown + liftoff
Game.prototype._launchFromCockpit = function(){
  this._closeCockpitUI();
  const fade=document.getElementById('fade'); if(fade) fade.classList.add('show');
  setTimeout(()=>{
    const p=this._rkPad, tgt=this._rkReturnWorld||this.overworld, dim=this._rkReturnDim||'overworld';
    // exit at the FRONT-door side (entrance faces −z), never inside the back wall
    this._rkSwapWorld(tgt, {x:p[0]+0.5,y:p[1]+1.02,z:p[2]-3.5}, dim);
    this._rocketLaunchThirdPerson();
    if(fade) setTimeout(()=>fade.classList.remove('show'),180);
  }, 520);
};
Game.prototype._rocketLaunchThirdPerson = function(){
  const [x,y,z]=this._rkPad;
  if(this.mode==='creative') this._rkClearColumn(x,y,z);   // creative: guarantee a clear launch column
  const rk=this._rkMeta(x,y,z), st=this._rkStructure(x,y,z);
  if(!this._rkReady(rk,st)){ this.onFlash&&this.onFlash(!st.clear?'Launch blocked — clear the column above the rocket':'Systems not ready'); return; }
  this._rkClearShell();   // the rocket lifts off the pad — remove the physical shell
  const built=buildRocketModel(); this._rkModel=built.group; this._rkGlow=built.glow; this._rkNav=built.nav; this._rkLegs=built.legs;
  this._rkModel.position.set(x+0.5,y+1,z+0.5); this.scene.add(this._rkModel);
  this._rkHomePad=[x,y,z];   // remember where home launches happen — return flights land here
  this.rocket={ phase:'countdown', pad:[x,y,z], t:0, count:10, fuel:Math.min(100,rk.fuel*20), maxFuel:100, ox:rk.ox*20, hull:100, camMode:0, autoStab:true, dest:'planet' };
  this._rkStarBoost();
  this._rocketActive=true;
  try{ document.getElementById('rkFlight').style.display='block'; }catch(e){}
  this._rkSetMsg('LAUNCH IN 10…','Stand clear of the engine plume'); SND.lowbeep();
};
Game.prototype._renderCockpit = function(){
  const c=this.cockpit; if(!c||!this._rkPad) return; const rk=this._rkMeta(this._rkPad[0],this._rkPad[1],this._rkPad[2]);
  const gauge=(l,v,col)=>`<div class="ckg"><span>${l}</span><div class="ckbar"><i style="width:${Math.max(0,Math.min(100,v))}%;background:${col}"></i></div></div>`;
  const lamp=(l,ok)=>`<div class="cklamp"><span class="dot ${ok?'on':'off'}"></span>${l}</div>`;
  const S=(done,ready,failed)=>failed?'failed':done?'complete':ready?'ready':'waiting';
  const step=(n,l,s)=>`<button data-ck="${n}" class="ckstep ${s}"><span>${l}</span><b>${s.toUpperCase()}</b></button>`;
  const s1=S(c.hatch,true,false), s2=S(c.engines,c.hatch,c.hatch&&!rk.engine), s3=S(c.guidance,c.engines,c.engines&&!rk.guid),
        s4=S(c.padlock,c.guidance,false), s5=S(c.countdownArmed,c.padlock,c.padlock&&!(rk.fuel>=3&&rk.ox>=3&&rk.power&&rk.life)), s6=S(false,c.countdownArmed,false);
  document.getElementById('rkCockBody').innerHTML =
    `<div class="cktitle">🛰 PIONEER — Cockpit · close hatch → arm → check → lock → countdown → confirm</div>`+
    `<div class="ckgauges">`+gauge('FUEL',rk.fuel/5*100,'#4fd07a')+gauge('OXIDIZER',rk.ox/5*100,'#4fc0e0')+gauge('POWER',rk.power?100:0,'#e0c040')+gauge('HULL',100,'#7adf8a')+`</div>`+
    `<div class="cklamps">`+lamp('Life Support',rk.life)+lamp('Guidance',rk.guid)+lamp(c.hatch?'Hatch Sealed':'Hatch Open',c.hatch)+lamp('Pad Lock',c.padlock)+`</div>`+
    `<div class="cksteps">`+step('hatch','1 · Close Hatch',s1)+step('engines','2 · Arm Engines',s2)+step('guidance','3 · Check Guidance',s3)+step('padlock','4 · Lock Launch Pad',s4)+step('countdown','5 · Start Countdown',s5)+step('confirm','6 · Confirm Launch',s6)+`</div>`+
    `<div class="ckactions"><button id="ckResume" class="rkbtn">↩ Back to walking</button><button id="ckManualBtn" class="rkbtn">📖 Manual</button><button id="ckExit" class="rkbtn">⏏ Exit Rocket</button></div>`;
};
// fire the countdown from the cockpit
Game.prototype._rocketIgnite = function(){
  const [x,y,z]=this._rkPad, rk=this._rkMeta(x,y,z), st=this._rkStructure(x,y,z);
  if(!this._rkReady(rk,st)){ this.onFlash&&this.onFlash('Systems not ready'); return; }
  this._rkHomePad=[x,y,z];
  this.rocket={ phase:'countdown', pad:[x,y,z], t:0, count:10, fuel:Math.min(100,rk.fuel*20), maxFuel:100, ox:rk.ox*20, hull:100, camMode:0, autoStab:true, cockpit:true, dest:'planet' };
  this._rkStarBoost();
  document.getElementById('rkCockBody').innerHTML =
    `<div class="cktitle">🛰 LAUNCH SEQUENCE</div><div id="ckCount">LAUNCH IN 10…</div><div id="ckCountSub">Systems online</div>`+
    `<button id="ckAbort2" class="rkbtn" style="margin-top:14px;width:100%">⏹ ABORT&nbsp;[X]</button>`;
  SND.lowbeep();
};
Game.prototype._rocketAbort = function(){
  if(!this.rocket || this.rocket.phase!=='countdown') return;
  this.rocket={phase:'idle'}; SND.alarm();
  this._rkTeardownFlight(false); this._rkSetMsg('LAUNCH ABORTED — emergency shutdown','');
  setTimeout(()=>this._rkSetMsg('',''),1500); this.onRequestLock&&this.onRequestLock();
};
// liftoff: leave the cockpit, spawn the rocket, hand off to third-person ascent
Game.prototype._rkCockpitLiftoff = function(){
  const r=this.rocket; r.cockpit=false; r.phase='ascent'; r.t=0;
  if(this._cockpit) this._cockpit.visible=false;
  this._inCockpit=false; this._rocketUI=false;
  try{ document.getElementById('rkCockpit').style.display='none'; }catch(e){}
  this._rkClearShell();
  const built=buildRocketModel(); this._rkModel=built.group; this._rkGlow=built.glow; this._rkNav=built.nav; this._rkLegs=built.legs;
  const [px,py,pz]=r.pad; this._rkModel.position.set(px+0.5,py+1,pz+0.5); this.scene.add(this._rkModel);
  for(const fl of this._rkGlow) fl.visible=true;
  this._rocketActive=true; this._consumeLaunchFuel();
  try{ document.getElementById('rkFlight').style.display='block'; }catch(e){}
  this._rkSetMsg('LIFTOFF','Switching to flight control'); SND.ignite(); this._rkShake=0.5;
};
// reset all rocket flow state (called from newWorld so a fresh/loaded world is clean)
Game.prototype._resetRocket = function(){
  // if a flight was live (quit-to-menu mid-flight), tear it down first so the
  // next world doesn't inherit the widened FOV/far plane or the floating space scene
  this._rkTeardownFlight && this._rkTeardownFlight(false);
  this.rocket={phase:'idle'}; this._inCockpit=false; this._rocketActive=false; this._rocketSuspendChunks=false; this.cockpit=null; this._rkPad=null; this._rkPadWorld=null; this.cockpitWorld=null;
  document.body.classList.remove('rk-flying');
  try{ if(this._cockpit) this._cockpit.visible=false;
    ['rkCockpit','rkDash','rkManual','rkFlight','rkGauges'].forEach(id=>{ const e=document.getElementById(id); if(e) e.style.display='none'; });
    const f=document.getElementById('fade'); if(f) f.classList.remove('show');
    const ch=document.getElementById('crosshair'); if(ch) ch.classList.remove('hidden');
  }catch(e){}
  if(this._rkHidden){ for(const m of this._rkHidden) m.visible=true; this._rkHidden=null; }
  if(this._rkModel){ this.scene.remove(this._rkModel); this._rkModel=null; }
  this._rkRemoveLanded&&this._rkRemoveLanded();
  this._rkShell=null;   // drop transient tracking; any built shell is real saved blocks
};

// ---------- per-frame: countdown FSM + flight controls + VFX ----------
Game.prototype._rocketTick = function(dt, ctl){
  const r=this.rocket; if(!r) return;
  try{
    // keep the held item stowed + blink cockpit lights while seated
    if(this._inCockpit){ if(this.heldGroup) this.heldGroup.visible=false;
      if(this._cockpitNav){ this._ckBlink=(this._ckBlink||0)+dt*4; const on=(Math.floor(this._ckBlink)%2)===0; for(const n of this._cockpitNav) n.material.emissiveIntensity=on?1.5:0.35; } }
    if(this._rkModel){ const on=(Math.floor(r.t*2)%2)===0; if(this._rkNav) for(const n of this._rkNav) n.visible=on; }
    if(r.phase==='idle'){ return; }
    r.t+=dt; this._rkUpdateVfx(dt);
    if(this.heldGroup) this.heldGroup.visible=false;   // stow the held item while piloting

    if(r.phase==='countdown'){
      const prev=Math.ceil(r.count); r.count-=dt; const now=Math.ceil(r.count);
      if(now!==prev && now>=0){ SND.beep(); this._rkShake=Math.max(this._rkShake, r.cockpit?0.06:0.04);
        if(r.cockpit){ const cc=document.getElementById('ckCount'), cs=document.getElementById('ckCountSub'); if(cc)cc.textContent='LAUNCH IN '+Math.max(0,now)+'…'; if(cs)cs.textContent=rkCountText(now); }
        else this._rkSetMsg('LAUNCH IN '+Math.max(0,now)+'…', rkCountText(now)); }
      // grounded front-on camera: rocket stands UPRIGHT on the pad, normal world sky behind it
      if(r.pad && !r.cockpit){ const [px,py,pz]=r.pad; this._rkGroundSky(0); this.camera.position.set(px+0.5, py+4, pz+13); this.camera.lookAt(px+0.5, py+5, pz+0.5); }
      if(r.count<6) this._rkEmit('smoke', 2);
      if(r.count<3){ this._rkEmit('spark',2); if(this._rkGlow) for(const f of this._rkGlow) f.visible=true; SND.rumble(0.6); }
      if(r.count<=0){ r.phase='ignition'; r.t=0; SND.ignite(); this._rkShake=0.5; SND.clank(); return; }
      this._rkApplyShake();
      return;
    }
    if(r.phase==='ignition'){
      this._rkEmit('smoke',6); this._rkEmit('fire',4); this._rkShake=Math.max(this._rkShake,0.45);
      this._rkSetMsg('IGNITION','Lift-off!');
      if(r.pad && !r.cockpit){ const [px,py,pz]=r.pad; this._rkGroundSky(0); this.camera.position.set(px+0.5, py+4, pz+13); this.camera.lookAt(px+0.5, py+5, pz+0.5); }
      if(r.t>1.4){ r.phase='ascent'; r.t=0; this._consumeLaunchFuel(); this._rkLookBase=this.player?this.player.yaw:0; if(this.player) this.player.pitch=0; }
      this._rkApplyShake(); return;
    }
    if(r.phase==='ascent'){
      // LONG staged climb in the REAL world: low atmosphere → high atmosphere →
      // edge of space → orbit. The terrain/weather stays visible below the whole
      // way; the sky blends by ALTITUDE (no snap) and the stars fade in.
      const rise=Math.min(300, r.t*r.t*4);
      const [px,py,pz]=r.pad; this._rkModel.position.set(px+0.5, py+1+rise, pz+0.5);
      this._rkEmit('fire',3); this._rkEmit('smoke',rise<90?3:1);
      this._rkShake=Math.max(this._rkShake*0.96, 0.18*(1-r.t/9));
      const alt=Math.round(rise*8);
      this._rkSetMsg('ASCENT', 'Altitude '+alt+' m'+(rise>230?' — EDGE OF SPACE':rise>120?' — upper atmosphere':''));
      this._rkGroundSky(clamp(rise/250,0,1));
      // free chase camera with MOUSE LOOK — turn around and watch the world,
      // villages, water, and weather shrink away beneath you
      const m=this._rkModel.position;
      const lookYaw=this.player?(this.player.yaw-(this._rkLookBase||0)):0, lookPitch=clamp(this.player?this.player.pitch:0,-1.25,1.25);
      const cq=this._rkAscentCamScratch||(this._rkAscentCamScratch={dir:new THREE.Vector3(),right:new THREE.Vector3()});
      const cdir=cq.dir.set(0,0,1).applyAxisAngle(_WUP,lookYaw);
      const crt=cq.right.crossVectors(_WUP,cdir).normalize(); cdir.applyAxisAngle(crt,lookPitch);
      this.camera.position.set(m.x+cdir.x*14, m.y+4+cdir.y*14, m.z+cdir.z*14);
      this.camera.lookAt(m.x, m.y+2, m.z);
      this._rkApplyShake();
      // handoff to orbit behind a quick atmospheric white-out — position and
      // velocity carry straight through, so the world "becomes" the globe below
      if(rise>=300 && !r._handoff){
        r._handoff=true;
        const fade=document.getElementById('fade'); if(fade) fade.classList.add('show');
        setTimeout(()=>{ if(this.rocket!==r) return; try{ this._rkBeginFlight(); }catch(e){} if(fade) setTimeout(()=>fade.classList.remove('show'),240); }, 380);   // skip if the world was swapped mid-fade
      }
      return;
    }
    if(r.phase==='flight'){ this._rkFlight(dt); return; }
  }catch(e){ /* never crash the frame */ }
};

Game.prototype._consumeLaunchFuel = function(){
  // remove fuel/ox cells + open hatch from the pad record (used up by the launch)
  const p=this.rocket.pad; if(!p) return; const rk=this._rkMeta(p[0],p[1],p[2]);
  rk.fuel=0; rk.ox=0; const W=this.world,k=W.bkey(p[0],p[1],p[2]); const m=W.getMeta(p[0],p[1],p[2]); m.rk=rk; W.meta.set(k,m); W.deltas.set(k,B.LAUNCHPAD);
};

// ---------- enter controllable space flight ----------
Game.prototype._rkBeginFlight = function(){
  const r=this.rocket; r.phase='flight'; r.t=0;
  this._rocketActive=true; this._rocketSuspendChunks=true;
  this._milestone&&this._milestone('space','You reached space.');
  document.body.classList.add('rk-flying');   // CSS hides the survival HUD
  // hide terrain (cheap clean space scene); space.js also hides its sky planet while _rocketActive
  this._rkHidden=[]; for(const [k,e] of this.chunkMeshes){ for(const mh of [e.opaque,e.cutout,e.blend,e.ice]) if(mh&&mh.visible){ mh.visible=false; this._rkHidden.push(mh); } for(const o of e.objects) if(o.visible){ o.visible=false; this._rkHidden.push(o); } }
  this._rkSpaceBg=new THREE.Color(0x04050c);
  // build the space scene ONCE: HOME (your green/blue voxel world) + DESTINATION (Aethon, rust+ring) + asteroids
  if(!this._rkScene){
    const Sg=new THREE.Group();
    // HOME: a real Earth-like globe — oceans, continents, clouds, atmosphere,
    // lit by the sun so it has a day side and a night side
    const home=rkBuildEarth(150, true, (this.overworld&&this.overworld.seed)||7);
    home.position.set(60,-70,560); this._rkHome=home; Sg.add(home);
    const dest=new THREE.Group();
    dest.add(new THREE.Mesh(new THREE.SphereGeometry(150,30,24), new THREE.MeshLambertMaterial({color:0xc06a36,emissive:0x4a1e08})));
    dest.add(new THREE.Mesh(new THREE.SphereGeometry(168,24,16), new THREE.MeshBasicMaterial({color:0xff9a5a,transparent:true,opacity:0.22,side:THREE.BackSide,fog:false})));
    const ring=new THREE.Mesh(new THREE.RingGeometry(195,255,48), new THREE.MeshBasicMaterial({color:0xe0c090,transparent:true,opacity:0.5,side:THREE.DoubleSide,fog:false})); ring.rotation.x=Math.PI*0.42; dest.add(ring);
    dest.position.set(0,-20,-1150); this._rkDest=dest; Sg.add(dest);
    // asteroids: a belt along the classic route PLUS wide scatter so free-roam
    // explorers off the lane still find rocks (and risk)
    this._rkRocks=[];
    const addRock=(x,y,z)=>{ const rock=new THREE.Mesh(new THREE.DodecahedronGeometry(2+Math.random()*5), new THREE.MeshLambertMaterial({color:0x6a6a72,emissive:0x101014}));
      // keep the orbit-entry points above both worlds safe — no spawn-kill rocks
      for(const [ex,ey,ez] of [[70,145,600],[10,195,-1110]]){ if(Math.hypot(x-ex,y-ey,z-ez)<140){ y+=200; break; } }
      rock.position.set(x,y,z); rock.rotation.set(Math.random()*3,Math.random()*3,0); Sg.add(rock); this._rkRocks.push(rock); };
    for(let i=0;i<14;i++) addRock((Math.random()-0.5)*300,(Math.random()-0.5)*200,-100-Math.random()*1000);
    for(let i=0;i<16;i++) addRock((Math.random()-0.5)*1600,(Math.random()-0.5)*900,700-Math.random()*2200);
    // dense starfield filling EVERY direction (sphere of points, follows the camera) + faint far layer
    const mkStars=(N,size,base)=>{ const geo=new THREE.BufferGeometry(), pos=new Float32Array(N*3), col=new Float32Array(N*3);
      for(let i=0;i<N;i++){ const u=Math.random()*2-1, th=Math.random()*Math.PI*2, rr=Math.sqrt(1-u*u), R=2400+Math.random()*900;
        pos[i*3]=Math.cos(th)*rr*R; pos[i*3+1]=u*R; pos[i*3+2]=Math.sin(th)*rr*R;
        const b=base+Math.random()*(1-base), t=Math.random(); col[i*3]=b*(t<0.25?0.8:1); col[i*3+1]=b*(t>0.8?0.85:1); col[i*3+2]=b*(t>0.55?1:0.82); }
      geo.setAttribute('position',new THREE.BufferAttribute(pos,3)); geo.setAttribute('color',new THREE.BufferAttribute(col,3));
      return new THREE.Points(geo, new THREE.PointsMaterial({size,sizeAttenuation:false,vertexColors:true,fog:false,transparent:true})); };
    this._rkStars=mkStars(1500,2.1,0.55); this._rkStarsFar=mkStars(900,1.1,0.35); Sg.add(this._rkStars); Sg.add(this._rkStarsFar);
    // a SUN: bright emissive sphere + glow halo, far off to one side (lights direction, sells scale)
    const sun=new THREE.Group();
    sun.add(new THREE.Mesh(new THREE.SphereGeometry(120,24,18), new THREE.MeshBasicMaterial({color:0xfff2c0,fog:false})));
    sun.add(new THREE.Mesh(new THREE.SphereGeometry(180,20,14), new THREE.MeshBasicMaterial({color:0xffd060,transparent:true,opacity:0.35,side:THREE.BackSide,fog:false})));
    sun.add(new THREE.Mesh(new THREE.SphereGeometry(260,16,12), new THREE.MeshBasicMaterial({color:0xffa030,transparent:true,opacity:0.16,side:THREE.BackSide,fog:false})));
    sun.position.set(1700,700,-300); this._rkSun=sun; Sg.add(sun);
    this._rkSunLight=new THREE.DirectionalLight(0xfff0d0,1.1); this._rkSunLight.position.copy(sun.position); Sg.add(this._rkSunLight);
    // collectible ENERGY CRYSTALS scattered along the route (fly into them → refuel)
    this._rkCrystals=[]; for(let i=0;i<12;i++){ const cm=new THREE.Mesh(new THREE.OctahedronGeometry(3.4), ME('#4fe0ff','#4fe0ff',1.5));
      cm.position.set((Math.random()-0.5)*300,(Math.random()-0.5)*180,-120-Math.random()*1000); Sg.add(cm); this._rkCrystals.push({mesh:cm,collected:false}); }
    for(let i=0;i<8;i++){ const cm=new THREE.Mesh(new THREE.OctahedronGeometry(3.4), ME('#4fe0ff','#4fe0ff',1.5));   // off-lane refuel stashes for explorers
      cm.position.set((Math.random()-0.5)*1400,(Math.random()-0.5)*800,650-Math.random()*2000); Sg.add(cm); this._rkCrystals.push({mesh:cm,collected:false}); }
    // THE HOLLOW STAR — a dark anomaly drifting far off the lane (boss ladder finale).
    // Ram it at speed three times to shatter it; touch it slowly and it lashes out.
    const anom=new THREE.Group();
    anom.add(new THREE.Mesh(new THREE.SphereGeometry(16,20,16), new THREE.MeshBasicMaterial({color:0x05030a,fog:false})));
    anom.add(new THREE.Mesh(new THREE.SphereGeometry(19,18,14), new THREE.MeshBasicMaterial({color:0x7a2aff,transparent:true,opacity:0.28,side:THREE.BackSide,fog:false})));
    anom.add(new THREE.Mesh(new THREE.SphereGeometry(23,16,12), new THREE.MeshBasicMaterial({color:0x3a0a66,transparent:true,opacity:0.12,side:THREE.BackSide,fog:false})));
    anom.position.set(640,290,-380);
    this._rkAnom={g:anom,hp:3,cool:0}; Sg.add(anom);
    this._rkScene=Sg; this.scene.add(Sg);
  }
  if(this.stars) this.stars.visible=false;   // hide the overworld star-dome; the flight starfield replaces it
  if(this._rkCrystals){ for(const c of this._rkCrystals){ c.collected=false; c.mesh.visible=true; } }   // reset pickups each flight
  if(this._rkAnom){ const dead=!!(this.milestones&&this.milestones.anomaly); this._rkAnom.g.visible=!dead; if(!dead) this._rkAnom.hp=3; }
  this._rkScene.visible=true;
  // two-way travel: the flight target is HOME when launching from Aethon
  r.dest=r.dest||'planet';
  this._rkDestPos = r.dest==='home' ? this._rkHome.position : this._rkDest.position;
  if(this._rkHome&&this._rkHome.userData.clouds) this._rkHome.userData.clouds.rotation.y+=0.4;
  this._rkLookBase=this.player?this.player.yaw:0; if(this.player) this.player.pitch=0;   // mouse-look starts centred behind the ship
  // NO SNAP, NO RAIL: you emerge in orbit directly above the world you just
  // climbed away from — nose still pointing up, still coasting on your ascent
  // velocity. The destination is a HUD marker, never forced steering. Look
  // down: the globe below is home (or Aethon, on the return trip).
  const fromBody = (r.dest==='home') ? this._rkDest : this._rkHome;
  r.pos = fromBody.position.clone().add(new THREE.Vector3(10,215,40));
  r.quat = new THREE.Quaternion();                       // nose (+y) straight up — the climb simply continues
  const fwd0=new THREE.Vector3(0,1,0);
  r.vel=fwd0.clone().multiplyScalar(18);                 // residual ascent speed; coast, stabilize, or burn — your call
  r.angv=new THREE.Vector3(); r.camMode=0; r.autoStab=true; r.arrived=false; r.landing=false; r.crystals=0; r.crystalTotal=this._rkCrystals?this._rkCrystals.length:0;
  this._rkModel.scale.set(1,1,1); for(const f of this._rkGlow) f.visible=true;
  this._rkCamPos=r.pos.clone().addScaledVector(fwd0,-15).addScaledVector(_WUP,5);   // start the chase cam behind the ship
  // WIDE space view: broaden the FOV and push the far plane out so the full
  // starfield, sun and both planets are visible around you (restored on teardown)
  this._rkPrevFov=this.camera.fov; this._rkPrevFar=this.camera.far;
  this.camera.fov=90; this.camera.far=6000; this.camera.updateProjectionMatrix();
  this._rkLastMsg=null; this._rkBigMsg('ORBIT REACHED — FREE FLIGHT. Steer with the MOUSE · C first/third person · Space burn · '+(r.dest==='home'?'HOME':'AETHON')+' marked on HUD · H aborts home');
  SND.lowbeep();
};

const _WUP=new THREE.Vector3(0,1,0);
// Spaceship flight: quaternion local control (no inversion), persistent inertia/drift,
// RCS puffs, smoothed chase cam, destination marker + arrival. Objective = reach Aethon.
Game.prototype._rkFlight = function(dt){
  const r=this.rocket, inp=this.input, d=c=>inp.down(c);
  const q=this._rkFlightScratch||(this._rkFlightScratch={
    turn:new THREE.Euler(0,0,0,'XYZ'), dq:new THREE.Quaternion(),
    fwd:new THREE.Vector3(), eye:new THREE.Vector3(), look:new THREE.Vector3(),
    right:new THREE.Vector3(), side:new THREE.Vector3(), up:new THREE.Vector3(), dir:new THREE.Vector3(), target:new THREE.Vector3(),
    away:new THREE.Vector3(), toTarget:new THREE.Vector3()
  });
  if(this._rkSpaceBg) this.scene.background=this._rkSpaceBg;
  if(this.scene.fog){ this.scene.fog.near=9000; this.scene.fog.far=10000; }
  if(this.stars) this.stars.visible=false;
  // starfields follow the camera so they surround you in every direction
  if(this._rkStars) this._rkStars.position.copy(this.camera.position);
  if(this._rkStarsFar) this._rkStarsFar.position.copy(this.camera.position);
  // ---- rotation: build angular momentum from input, apply in LOCAL frame ----
  // control axes (nose = local +Y): local X = pitch(+climb), local Z = yaw(+left),
  // local Y = roll about the nose. Verified against the live quaternion.
  const tr=2.4;  let pitchIn=0,yawIn=0,rollIn=0;
  if(d('KeyW')) pitchIn+=1; if(d('KeyS')) pitchIn-=1;   // W climb, S dive
  if(d('KeyA')) yawIn+=1;   if(d('KeyD')) yawIn-=1;     // A yaw-left, D yaw-right
  if(d('KeyQ')) rollIn+=1;  if(d('KeyE')) rollIn-=1;    // Q/E roll
  // ---- MOUSE FLIGHT: the ship turns toward where you look. Moving the mouse
  // deflects the view; the ship steers to follow and the view eases back to
  // centre (self-centering "fly-by-mouse" — far easier than key-only turns).
  const mlYaw=this.player?(this.player.yaw-(this._rkLookBase||0)):0;
  const mlPitch=clamp(this.player?this.player.pitch:0,-1.2,1.2);
  const steer=4.6, syaw=clamp(mlYaw,-0.7,0.7), spitch=clamp(mlPitch,-0.7,0.7);
  yawIn   += syaw*steer;                      // look right → yaw right (mouse-right lowers player.yaw → syaw<0 → yaw right, matching KeyD)
  pitchIn += spitch*steer;                    // look up → nose up (climb)
  const rec=Math.min(1,7*dt);                 // bleed the view offset back to centre as the ship comes around
  if(this.player){ this.player.yaw -= mlYaw*rec; this.player.pitch -= mlPitch*rec; }
  const rotating=!!(pitchIn||yawIn||rollIn);
  r.angv.x+=pitchIn*tr*dt; r.angv.z+=yawIn*tr*dt; r.angv.y+=rollIn*tr*dt;
  if(d('KeyR')){ if(!r._rT){ r.autoStab=!r.autoStab; r._rT=1; this._rkBigMsg('AUTO-STABILIZE '+(r.autoStab?'ON':'OFF')); } } else r._rT=0;
  if(d('KeyC')){ if(!r._cT){ r.camMode=(r.camMode+1)%2; r._cT=1; } } else r._cT=0;
  if(d('KeyN')) this._rkPointToTarget(r,dt);                 // assist: aim at destination
  r.angv.multiplyScalar(r.autoStab?0.88:0.985);             // momentum (auto-stab damps more)
  q.turn.set(r.angv.x*dt,r.angv.y*dt,r.angv.z*dt,'XYZ');
  r.quat.multiply(q.dq.setFromEuler(q.turn));
  if(rotating && (this._rkRcsT=(this._rkRcsT||0)+dt)>0.04){ this._rkRcsT=0; this._rkRcsPuff(r); }
  // ---- translation: thrust along nose, velocity PERSISTS (true space drift) ----
  const fwd=q.fwd.set(0,1,0).applyQuaternion(r.quat);
  const boost=d('ShiftLeft')||d('ShiftRight'); let thr=0;
  if(d('Space') && r.fuel>0){ thr=boost?40:20; r.fuel-=(boost?16:7)*dt; this._rkEmit('fire',boost?3:2); }
  if(d('ControlLeft')||d('ControlRight')) r.vel.multiplyScalar(0.95);   // brake/stabilize (eases, never freezes instantly)
  r.vel.addScaledVector(fwd, thr*dt);
  if(r.vel.length()>130) r.vel.setLength(130);
  r.pos.addScaledVector(r.vel, dt);
  r.fuel=clamp(r.fuel,0,r.maxFuel);
  this._rkModel.quaternion.copy(r.quat); this._rkModel.position.copy(r.pos);
  // ---- MOUSE-LOOK offset: the mouse moves the CAMERA only (never the steering) ----
  const lookYaw=this.player?(this.player.yaw-(this._rkLookBase||0)):0, lookPitch=clamp(this.player?this.player.pitch:0,-1.1,1.1);
  // ---- camera: C toggles 1st-person cockpit ↔ 3rd-person chase ----
  if(r.camMode===1){           // first-person: ride in the cockpit, mouse looks around the window (model hidden)
    this._rkModel.visible=false;
    const eye=q.eye.copy(r.pos).addScaledVector(fwd,2.4).addScaledVector(_WUP,1.2);
    this._rkCamPos.lerp(eye, 1-Math.pow(0.00002,dt));
    this.camera.position.copy(this._rkCamPos);
    const look=q.look.copy(fwd).applyAxisAngle(_WUP,lookYaw); const rt=q.right.crossVectors(_WUP,look).normalize(); look.applyAxisAngle(rt,lookPitch);
    this.camera.lookAt(eye.x+look.x*40, eye.y+look.y*40, eye.z+look.z*40);
  } else {                     // third-person: behind + above; mouse orbits the camera around the ship
    this._rkModel.visible=true;
    const dir=q.dir.copy(fwd).negate().applyAxisAngle(_WUP,lookYaw); const rt=q.right.crossVectors(_WUP,dir).normalize(); dir.applyAxisAngle(rt,lookPitch);
    const side=q.side.set(1,0,0).applyQuaternion(r.quat), shipUp=q.up.set(0,0,1).applyQuaternion(r.quat);
    const camTarget=q.target.copy(r.pos).addScaledVector(dir,12).addScaledVector(shipUp,5).addScaledVector(side,6);
    this._rkCamPos.lerp(camTarget, 1-Math.pow(0.0009,dt));
    this.camera.position.copy(this._rkCamPos);
    this.camera.lookAt(r.pos.x, r.pos.y+1, r.pos.z);
  }
  // ---- collectible energy crystals: spin them, collect on contact (refuel) ----
  if(this._rkCrystals && !r.landing){ for(const c of this._rkCrystals){ if(c.collected) continue;
    c.mesh.rotation.y+=dt*1.6; c.mesh.rotation.x+=dt*0.9;
    if(r.pos.distanceTo(c.mesh.position)<14){ c.collected=true; c.mesh.visible=false; r.crystals++; r.fuel=clamp(r.fuel+20,0,r.maxFuel); SND.beep(); this._rkBigMsg('⬢ ENERGY CRYSTAL +20% fuel  ('+r.crystals+'/'+r.crystalTotal+')'); } } }
  // ---- objective / HUD / automatic arrival + landing (no button, no phasing) ----
  const dist=r.pos.distanceTo(this._rkDestPos), spd=r.vel.length();
  // ---- hazards: asteroid strikes, overheat on a hot approach, hull failure ----
  if(this._rkRocks && !r.landing){ for(const rock of this._rkRocks){
    if(rock._cool>0){ rock._cool-=dt; continue; }
    if(r.pos.distanceTo(rock.position) < (rock.geometry.parameters.radius||4)+4){
      rock._cool=1.5;
      r.hull=Math.max(0, r.hull-(8+Math.random()*10));
      const away=q.away.copy(r.pos).sub(rock.position).normalize();
      r.vel.multiplyScalar(0.5).addScaledVector(away,22);
      this._rkShake=0.5; SND.alarm(); this._rkEmit('spark',6);
      this._rkBigMsg('⚠ ASTEROID STRIKE — hull '+Math.round(r.hull)+'%');
    } } }
  // ---- THE HOLLOW STAR: proximity warning, ram-to-shatter, slow-touch punishment ----
  if(this._rkAnom && this._rkAnom.g.visible && !r.landing){
    const A=this._rkAnom; A.cool=Math.max(0,A.cool-dt);
    A.g.rotation.y+=dt*0.4; const pu=1+Math.sin((r.t||0)*2.2)*0.06; A.g.scale.set(pu,pu,pu);
    const ad=r.pos.distanceTo(A.g.position);
    if(ad<220 && !A.warn){ A.warn=true; SND.alarm(); this._rkBigMsg('⚠ ANOMALY DETECTED — a hollow star drifts here. RAM it at full burn… if you dare'); }
    if(ad>300) A.warn=false;
    if(ad<28 && A.cool<=0){
      A.cool=1.2;
      const away=q.away.copy(r.pos).sub(A.g.position).normalize();
      if(r.vel.length()>60){
        A.hp--; this._rkShake=0.7; SND.ignite(); this._rkEmit('spark',10);
        r.vel.multiplyScalar(0.4).addScaledVector(away,30);
        if(A.hp<=0){
          A.g.visible=false; this._rkEmit('fire',12); this._rkEmit('spark',12);
          r.fuel=r.maxFuel; this._giveOrDrop&&this._giveOrDrop('anomaly_core',1);
          this._milestone&&this._milestone('anomaly','You shattered the Hollow Star.');
          this._rkBigMsg('✦✦ THE HOLLOW STAR SHATTERS — its core is yours (tanks refilled)');
        } else this._rkBigMsg('ANOMALY CRACKED '+(3-A.hp)+'/3 — come around and ram it again!');
      } else {
        r.hull=Math.max(0,r.hull-15); this._rkShake=0.6; SND.alarm(); this._rkEmit('spark',6);
        r.vel.multiplyScalar(0.3).addScaledVector(away,26);
        this._rkBigMsg('⚠ The anomaly lashes out — hull '+Math.round(r.hull)+'%. Hit it FASTER (boost!)');
      }
    }
  }
  r.heat=r.heat||0;
  if(!r.landing && dist<420 && spd>70){
    r.heat=Math.min(120, r.heat+dt*(spd-70)*0.55);
    if((r._heatT=(r._heatT||0)+dt)>1.4){ r._heatT=0; SND.alarm(); this._rkBigMsg('⚠ ENTRY TOO FAST — heat '+Math.round(r.heat)+'% — BRAKE (Ctrl)'); }
    this._rkShake=Math.max(this._rkShake, r.heat*0.004);
  } else r.heat=Math.max(0, r.heat-dt*10);
  if(r.heat>=100) r.hull=0;
  if(r.fuel<=0 && !r._fuelWarned){ r._fuelWarned=true; SND.alarm(); this._rkBigMsg('⚠ OUT OF FUEL — drift into a crystal or press H to abort home'); }
  if(r.fuel>0) r._fuelWarned=false;
  if(r.hull<=0 && !r.landing){ this._rkCrash(dist<600); return; }
  this._rkFlightHUD(r, spd, dist, fwd);
  if(d('KeyH') && !r.landing){ this._rkComplete('home'); return; }
  if(!r.landing && dist<240){ r.landing=true; r.autoStab=true; SND.beep(); this._rkBigMsg('DESTINATION REACHED — entering landing sequence'); }
  if(r.landing){               // cinematic auto-descent: steer in, slow as you near, touch down (never phases through)
    if(this._rkLegs) for(const l of this._rkLegs) l.visible=true;   // deploy landing legs
    this._rkPointToTarget(r,dt);
    const toP=q.toTarget.copy(this._rkDestPos).sub(r.pos).normalize();
    r.vel.copy(toP).multiplyScalar(Math.max(14, Math.min(60, dist*0.45)));   // descend, slowing as the surface nears (applied next frame)
    this._rkEmit('fire',2); this._rkShake=Math.max(this._rkShake,0.12);
    this._rkSetMsg('LANDING',(r.dest==='home'?'Home — ':'Aethon — ')+Math.round(Math.max(0,dist-160))+' km');
    if(dist<185){ this._rkComplete(r.dest==='home'?'home':'land'); return; }   // touch down (fade → surface) before reaching the mesh
  }
};
// hull gone: crash-land on Aethon if close, else limp home — either way it hurts
Game.prototype._rkCrash = function(nearDest){
  const r=this.rocket; if(!r || r.phase!=='flight') return;
  this._rkShake=1; SND.alarm(); SND.ignite();
  this._rkBigMsg('✖ HULL FAILURE — '+(nearDest?'CRASH LANDING ON AETHON':'EMERGENCY RETURN'));
  this._rkCrashed=true;
  this._rkComplete(nearDest ? (r.dest==='home'?'home':'land') : 'home');
};
// gentle autopilot: rotate the nose toward Aethon (does not steal full control)
Game.prototype._rkPointToTarget = function(r,dt){
  const q=this._rkPointScratch||(this._rkPointScratch={to:new THREE.Vector3(),want:new THREE.Quaternion()});
  const toT=q.to.copy(this._rkDestPos).sub(r.pos).normalize();
  const want=q.want.setFromUnitVectors(_WUP,toT);
  r.quat.slerp(want, Math.min(1,dt*1.2)); r.angv.multiplyScalar(0.7);
};
// small RCS thruster puff while turning (reuses the vfx pool)
Game.prototype._rkRcsPuff = function(r){
  let active=0; for(const q of this._rkVfx) if(q.active&&++active>90) return;
  let v=this._rkVfx.find(q=>!q.active);
  if(!v){ const geo=this._rkVfxGeo||(this._rkVfxGeo=new THREE.BoxGeometry(1,1,1)), mesh=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({transparent:true})); this.scene.add(mesh); v={mesh,vel:new THREE.Vector3(),active:false}; this._rkVfx.push(v); }
  v.active=true; v.mesh.visible=true; v.kind='fire'; v.life=0.3; v.mesh.scale.set(0.16,0.16,0.16);
  v.mesh.position.set(r.pos.x+(Math.random()-0.5)*2.4,r.pos.y+(Math.random()-0.5)*2.4,r.pos.z+(Math.random()-0.5)*2.4);
  v.vel.set((Math.random()-0.5)*4,(Math.random()-0.5)*4,(Math.random()-0.5)*4);
  v.mesh.material.color.set('#bfe6ff'); v.mesh.material.opacity=0.9;
};

// ---------- finish the mission ----------
Game.prototype._rkComplete = function(mode){
  const r=this.rocket; if(!r||r.phase==='done') return; r.phase='done';
  const fade=document.getElementById('fade'); if(fade) fade.classList.add('show');   // safe return is never abrupt
  const finish=()=>{
    this._rkTeardownFlight(true);
    if(mode==='land' && this.travelTo){ this.rocketMissionDone=true; this._skipPlanetArrivalPad=true; this.travelTo('planet'); this._rkSpawnLanded(); this._rkSetMsg('TOUCHDOWN','Welcome to Aethon'); this._milestone&&this._milestone('aethon','You set foot on Aethon.'); }
    else {
      if(this.dimension==='planet' && this.travelTo) this.travelTo('overworld');
      // the ship comes home WITH you — it stands at the original pad again
      const hp=this._rkHomePad||r.pad;
      if(hp){ this._rkPad=[hp[0],hp[1],hp[2]]; this._rkPadWorld=this.world; this._rkBuildShell(hp[0],hp[1],hp[2]); }
      else if(this.player){ const sy=this.world.surfaceY(0,0)+1; this.player.setPos(0.5,sy+1,2.5); }
      this._rkSetMsg('RETURNED SAFELY','Welcome home'); this.rocketMissionDone=true;
      if(r.dest==='home') this._milestone&&this._milestone('roundTrip','Round trip complete — Aethon and back.');
    }
    if(fade) setTimeout(()=>fade.classList.remove('show'),160);
    this.onRequestLock && this.onRequestLock();
    // crash aftermath: you live, but it costs you — and the ship needs repairs
    if(this._rkCrashed){
      this._rkCrashed=false; this._rkWrecked=true;
      if(this.mode==='survival') this.hurtPlayer(8);
      if(mode==='home'){ const dp=this._rkHomePad||r.pad; if(dp){ const rk=this._rkMeta(dp[0],dp[1],dp[2]); rk.engine=false; rk.fuel=0; } }
      this.onFlash&&this.onFlash('You crawl from the wreck. Patch the hull with 3 Alien Alloy before it flies again.');
    }
    // mission over → rocket returns to idle so it can be prepped and launched again
    this.rocket={phase:'idle'};
    setTimeout(()=>{ this._rkSetMsg('',''); try{ document.getElementById('rkFlight').style.display='none'; }catch(e){} },1600);
  };
  setTimeout(finish, 520);
};

// place YOUR rocket (same model) standing on the Aethon surface where you touched
// down, legs deployed, and stand the player in front of it
Game.prototype._rkSpawnLanded = function(){
  this._rkRemoveLanded(); if(!this.player) return;
  // landing-site validation: pick the FLATTEST spot near touchdown for the 5×5 footprint
  let px=Math.floor(this.player.pos.x), pz=Math.floor(this.player.pos.z), best=99;
  const cx0=px, cz0=pz;
  for(let dx=-8;dx<=8;dx+=2) for(let dz=-8;dz<=8;dz+=2){
    let mn=999,mx=-999;
    for(let fx=-2;fx<=2;fx++) for(let fz=-2;fz<=2;fz++){ const h=this.world.surfaceY(cx0+dx+fx,cz0+dz+fz); if(h<mn)mn=h; if(h>mx)mx=h; }
    if(mx-mn<best){ best=mx-mn; px=cx0+dx; pz=cz0+dz; if(best<=1) break; }
  }
  const py=this.world.surfaceY(px,pz);
  this.world.setBlock(px,py,pz,B.LAUNCHPAD);   // the landing site gets a real pad under the ship
  // the REAL, walk-in voxel rocket (the same one you build & fly) lands here — not a decorative mesh.
  // _rkBuildShell stands the player at the front door; press F on the pad/console inside to fly home.
  this._rkPad=[px,py,pz]; this._rkPadWorld=this.world;
  this._rkBuildShell(px,py,pz);
  this._rkBuildLandingSite(px,pz);
  this.onFlash&&this.onFlash('Landed on Aethon — this is YOUR rocket. Walk up, open the metal door, step inside, and press F on the pad/console to fly home.');
};
// reward + points of interest at the Aethon landing site: a loot supply cache + glowing crystal spires
Game.prototype._rkBuildLandingSite = function(px,pz){
  try{ const W=this.world;
    // supply-cache CHEST a few blocks from the rocket (expedition reward — real chest you open)
    const cx=px+5, cz=pz+2, cy=W.surfaceY(cx,cz);
    if(cy>0 && !W.chests.has(W.bkey(cx,cy+1,cz))){
      W.setBlock(cx,cy+1,cz,B.CHEST); this._markDirtyAround(cx,cy+1,cz);
      const slots=new Array(27).fill(null);
      const loot=[['space_shard',6],['alien_alloy',3],['crystal',5],['rocket_fuel',2],['oxidizer_cell',2],['circuit',2],['gold_ingot',3],['battery',1]];
      loot.forEach((l,i)=>{ if(ITEMS[l[0]]) slots[i]={item:l[0],count:l[1]}; });
      W.chests.set(W.bkey(cx,cy+1,cz),slots);
    }
    // glowing alien crystal spires (points of interest, real ALIEN_CRYSTAL you can mine)
    for(const [ox,oz] of [[-4,3],[5,-3],[-3,-6],[6,4]]){ const bx=px+ox, bz=pz+oz, by=W.surfaceY(bx,bz); if(by<=0) continue;
      const ht=2+((bx+bz)&1); for(let h=1;h<=ht;h++) W.setBlock(bx,by+h,bz,B.ALIEN_CRYSTAL);
      W.setBlock(bx,by+ht+1,bz,B.STAR_BEACON); this._markDirtyAround(bx,by+ht,bz); }
  }catch(e){}
};
Game.prototype._rkRemoveLanded = function(){ if(this._rkLanded){ this.scene.remove(this._rkLanded); this._rkLanded=null; } };
// re-board the landed rocket and fly back to the launch site on Earth
Game.prototype._rkReturnHome = function(px,py,pz){
  if(this.dimension!=='planet') return false;
  // a wrecked ship must be patched before it flies — 3 Alien Alloy (survival only)
  if(this._rkWrecked){
    if(this.mode!=='survival' || this.countItem('alien_alloy')>=3){
      if(this.mode==='survival') this.takeItem('alien_alloy',3);
      this._rkWrecked=false; SND.clank();
      this.onFlash&&this.onFlash('Hull patched with Alien Alloy — systems back online. Press F again to fly home.');
    } else {
      SND.lowbeep();
      this.onFlash&&this.onFlash('The rocket is WRECKED. Patch it with 3 Alien Alloy (smelt Voidcrystal shards + iron at a Science Lab — or mine the crystals glowing in the rock here).');
    }
    return true;
  }
  // pre-flight checks: this is a real return LAUNCH, not a teleport
  if(this.rocket && this.rocket.phase && this.rocket.phase!=='idle'){ this.onFlash&&this.onFlash('Already in flight'); return true; }
  // use the clicked pad (survives a save/reload where _rkPad is null), else the ground under you
  const pad=this._rkPad||(px!=null?[px,py,pz]:[Math.floor(this.player.pos.x),Math.floor(this.player.pos.y-1),Math.floor(this.player.pos.z)]);
  this._rkPad=[pad[0],pad[1],pad[2]]; this._rkPadWorld=this.world;   // set BEFORE _rkClearShell so its footprint-sweep fallback can clear the landed shell
  const st=this._rkStructure(pad[0],pad[1],pad[2]);
  if(!st.clear){ SND.lowbeep(); this.onFlash&&this.onFlash('Launch blocked: clear the sky above the rocket'); return true; }
  this.onFlash&&this.onFlash('Pre-flight complete — RETURN LAUNCH. Destination: HOME');
  this._rkClearShell();          // the ship lifts off the alien pad
  this._rkRemoveLanded();
  const built=buildRocketModel(); this._rkModel=built.group; this._rkGlow=built.glow; this._rkNav=built.nav; this._rkLegs=built.legs;
  this._rkModel.position.set(pad[0]+0.5,pad[1]+1,pad[2]+0.5); this.scene.add(this._rkModel);
  this.rocket={ phase:'countdown', pad:[pad[0],pad[1],pad[2]], t:0, count:10, fuel:100, maxFuel:100, ox:100, hull:100, camMode:0, autoStab:true, dest:'home' };
  this._rkStarBoost();
  this._rocketActive=true;
  try{ document.getElementById('rkFlight').style.display='block'; }catch(e){}
  this._rkSetMsg('RETURN LAUNCH IN 10…','Destination: HOME'); SND.beep();
  return true;
};
// restore terrain/scene after flight (keepModel=false removes the rocket model)
Game.prototype._rkTeardownFlight = function(keepModel){
  this._rocketActive=false; this._rocketSuspendChunks=false;
  document.body.classList.remove('rk-flying');
  if(this._rkHidden){ for(const m of this._rkHidden) m.visible=true; this._rkHidden=null; }
  this._rkSpaceBg=null;   // updateSky reclaims background/fog next frame
  if(this._rkScene) this._rkScene.visible=false;
  if(this.stars) this.stars.visible=true;   // restore the overworld star-dome
  if(this._rkModel){ this.scene.remove(this._rkModel); this._rkModel=null; }
  for(const v of this._rkVfx){ v.mesh.visible=false; v.active=false; }
  // restore the walking-world camera (flight widened FOV + far plane)
  if(this._rkPrevFov){ this.camera.fov=this._rkPrevFov; this.camera.far=this._rkPrevFar||1000; this.camera.updateProjectionMatrix(); this._rkPrevFov=null; }
  try{ document.getElementById('rkGauges').style.display='none'; document.getElementById('rkFlight').style.display='none'; }catch(e){}
  this._rkShell=null;
  // hand control back to the player avatar
  if(this.player){ this.player.vel.set(0,0,0); this.player.pitch=0; }
};

// =====================================================================
//  VFX — pooled smoke / fire / spark boxes (capped, auto-fade)
// =====================================================================
Game.prototype._rkEmit = function(kind, n){
  if(!this._rkModel) return;
  const pad=this.rocket&&this.rocket.pad, base=this._rocketActive ? this._rkModel.position : (pad ? (this._rkPadVfxBase||(this._rkPadVfxBase=new THREE.Vector3())).set(pad[0]+0.5,pad[1]+0.4,pad[2]+0.5) : null);
  if(!base) return;
  let active=0; for(const q of this._rkVfx) if(q.active) active++;
  for(let i=0;i<n;i++){
    if(active>90) break;
    let v=this._rkVfx.find(q=>!q.active);
    if(!v){ const geo=this._rkVfxGeo||(this._rkVfxGeo=new THREE.BoxGeometry(1,1,1)), mesh=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({transparent:true})); this.scene.add(mesh); v={mesh,vel:new THREE.Vector3(),active:false}; this._rkVfx.push(v); }
    v.active=true; active++; v.mesh.visible=true; v.kind=kind;
    v.life=kind==='smoke'?1.6+Math.random()*0.6:kind==='fire'?0.35+Math.random()*0.25:0.35+Math.random()*0.2; v.maxLife=v.life;
    const s=(kind==='smoke'?0.42:kind==='fire'?0.28:0.09)*(0.8+Math.random()*0.7); v.mesh.scale.set(s,s,s);
    v.mesh.position.set(base.x+(Math.random()-0.5)*1.2, base.y-0.4-Math.random()*0.8, base.z+(Math.random()-0.5)*1.2);
    const spread=kind==='spark'?6:2;
    v.vel.set((Math.random()-0.5)*spread, kind==='smoke'?(0.35+Math.random()*0.9):-(2.5+Math.random()*3.5), (Math.random()-0.5)*spread);
    const roll=Math.random();
    v.mesh.material.color.set(kind==='smoke'?(roll<0.35?'#59616a':roll<0.75?'#8d969e':'#c1c8ca'):kind==='fire'?(roll<0.35?'#ff5a1f':roll<0.75?'#ffad2f':'#fff0a1'):'#fff3b0');
    v.mesh.material.opacity=kind==='smoke'?0.62:1;
  }
};
Game.prototype._rkUpdateVfx = function(dt){
  for(const v of this._rkVfx){ if(!v.active) continue; v.life-=dt;
    if(v.life<=0){ v.active=false; v.mesh.visible=false; continue; }
    v.mesh.position.addScaledVector(v.vel, dt);
    if(v.kind==='smoke'){ const g=1+dt*1.35; v.mesh.scale.multiplyScalar(g); v.mesh.material.opacity=0.62*Math.max(0,v.life/v.maxLife); v.vel.multiplyScalar(0.96); }
    else if(v.kind==='fire'){ v.mesh.scale.multiplyScalar(Math.max(0.2,1-dt*1.8)); v.mesh.material.opacity=Math.max(0,v.life/v.maxLife); }
    else { v.vel.y-=12*dt; }
  }
};
Game.prototype._rkApplyShake = function(){
  if(this.reducedMotion){ this._rkShake=0; return; }
  if(this._rkShake<=0.001) return;
  this.camera.position.x += (Math.random()-0.5)*this._rkShake;
  this.camera.position.y += (Math.random()-0.5)*this._rkShake;
  this.camera.position.z += (Math.random()-0.5)*this._rkShake;
  this._rkShake*=0.92;
};

// ---------- HUD helpers ----------
Game.prototype._rkSetMsg = function(title, sub){
  const t=document.getElementById('rkMsgT'), s=document.getElementById('rkMsgS'), w=document.getElementById('rkFlight');
  if(!w) return; if(!title){ w.querySelector('#rkMsg').style.display='none'; return; }
  w.style.display='block'; w.querySelector('#rkMsg').style.display='block'; if(t)t.textContent=title; if(s)s.textContent=sub||'';
};
// throttled big banner (avoids resetting the DOM every frame)
Game.prototype._rkBigMsg = function(txt){
  if(this._rkLastMsg===txt) return; this._rkLastMsg=txt;
  this._rkSetMsg(txt,''); clearTimeout(this._rkMsgClr);
  this._rkMsgClr=setTimeout(()=>{ this._rkSetMsg('',''); this._rkLastMsg=null; },2600);
};
Game.prototype._rkFlightHUD = function(r, spd, dist, fwd){
  const g=document.getElementById('rkGauges'); if(!g) return; g.style.display='block';
  // Numeric readouts do not need a 60 Hz DOM rebuild. Keeping this panel at
  // 8 Hz removes continuous HTML parsing/layout/GC while aiming stays smooth.
  const now=performance.now();
  if(!this._rkHudNext || now>=this._rkHudNext){
    this._rkHudNext=now+125;
    const fuelPct=Math.round(r.fuel/r.maxFuel*100), low=fuelPct<25;
    const homeDist=this._rkHome?Math.round(r.pos.distanceTo(this._rkHome.position)):0;
    g.innerHTML =
    `<div class="rkObj">▶ OBJECTIVE: ${r.landing?('<b>LANDING — '+(r.dest==='home'?'HOME':'AETHON')+'</b>'):('reach <b>'+(r.dest==='home'?'HOME':'AETHON')+'</b>')}</div>`+
    `<div class="rkStat"><span>PHASE</span><b>${r.landing?'LANDING':dist<420?'APPROACH':'FREE FLIGHT'}</b></div>`+
    `<div class="rkStat"><span>DESTINATION</span><b>${Math.round(dist).toLocaleString()} km</b></div>`+
    `<div class="rkStat"><span>HOME</span><b>${homeDist.toLocaleString()} km</b></div>`+
    `<div class="rkStat"><span>SPEED</span><b>${Math.round(spd*4)} m/s</b></div>`+
    `<div class="rkStat"><span>FUEL</span><b class="${low?'warn':''}">${fuelPct}%</b></div>`+
    `<div class="rkStat"><span>HULL</span><b class="${r.hull<40?'warn':''}">${Math.round(r.hull)}%</b></div>`+
    ((r.heat||0)>5?`<div class="rkStat"><span>HEAT</span><b class="${r.heat>60?'warn':''}">${Math.round(r.heat)}%</b></div>`:'')+
    `<div class="rkStat"><span>STABILIZER</span><b>${r.autoStab?'AUTO ✓':'MANUAL'}</b></div>`+
    `<div class="rkStat"><span>CAMERA</span><b>${r.camMode===1?'1ST-PERSON':'3RD-PERSON'}</b></div>`+
    `<div class="rkStat"><span>CRYSTALS</span><b>${r.crystals||0} / ${r.crystalTotal||0}</b></div>`+
    `<div class="rkKeys">MOUSE steer · Space thrust · Shift boost · Ctrl brake · QE roll · C 1st/3rd view · R stab · N aim · H home</div>`+
      (r.landing?`<div class="rkWarn" style="color:#7ec8e3">▼ AUTO-LANDING — hold on</div>`:(r.fuel<=0?`<div class="rkWarn">⚠ OUT OF FUEL — coasting · press H to return home</div>`:(low?`<div class="rkWarn">⚠ LOW FUEL</div>`:'')));
  }
  // destination marker: centred chevron that rotates to point at Aethon (or ON COURSE)
  const a=document.getElementById('rkArrow'); if(a){ const q=this._rkHudScratch||(this._rkHudScratch={to:new THREE.Vector3(),right:new THREE.Vector3(),up:new THREE.Vector3()});
    const toT=q.to.copy(this._rkDestPos).sub(r.pos).normalize();
    const right=q.right.set(1,0,0).applyQuaternion(r.quat), up=q.up.set(0,0,1).applyQuaternion(r.quat);
    const fc=toT.dot(fwd);
    if(fc>0.985){ a.textContent='◎ ON COURSE'; a.className='oncourse'; }
    else { a.textContent='➤'; a.className=''; a.style.transform='rotate('+Math.atan2(toT.dot(right),toT.dot(up))+'rad)'; }
  }
};

function rkCountText(n){ return ({10:'Systems online',9:'Hatch sealed',8:'Guidance locked',7:'Fuel pressure rising',6:'Smoke vents open',5:'Engines warming',4:'Ignition sparks',3:'Main engines starting',2:'Launch clamps releasing',1:'Full thrust',0:'LIFTOFF'})[n]||''; }

// =====================================================================
//  UI injection (dashboard + flight HUD + manual) — self-contained
// =====================================================================
function rkInjectUI(){
  if(document.getElementById('rkStyle')) return;
  const css=document.createElement('style'); css.id='rkStyle'; css.textContent=`
  #rkDash{display:none;position:fixed;inset:0;z-index:120;background:rgba(4,8,16,.72);align-items:center;justify-content:center;font-family:system-ui,sans-serif}
  #rkPanel{width:min(440px,92vw);max-height:88vh;overflow:auto;background:linear-gradient(180deg,#10151f,#0a0e16);border:1px solid #2a3850;border-radius:12px;padding:16px 18px;box-shadow:0 10px 40px rgba(0,0,0,.6)}
  .rktitle{color:#7ec8e3;font-weight:800;letter-spacing:.04em;margin-bottom:10px;font-size:15px}
  .rkrow{display:flex;justify-content:space-between;align-items:center;padding:5px 2px;border-bottom:1px solid #1c2536;color:#cdd6e4;font-size:13px}
  .rkrow.big{margin-top:8px;border:0;font-weight:800}
  .rkrow b.ok{color:#5ed27a} .rkrow b.bad{color:#e07a6a}
  .rkbtn{margin:4px 6px 4px 0;padding:6px 11px;border-radius:7px;border:1px solid #34507a;background:linear-gradient(180deg,#26405f,#16263c);color:#dCEbff;font-size:12px;font-weight:700;cursor:pointer}
  .rkbtn:hover{filter:brightness(1.18)} .rkbtn:disabled{opacity:.4;cursor:not-allowed}
  .rkbtn.go{background:linear-gradient(180deg,#2f8a52,#1c5e38);border-color:#3aa05a}
  .rkbtn.auto{display:block;width:100%;margin:2px 0 10px;padding:9px;background:linear-gradient(180deg,#6a4ea8,#3e2c6e);border-color:#7a5ec8;font-size:13px}
  .rkactions{margin-top:12px;display:flex;flex-wrap:wrap;gap:4px}
  #rkManual{display:none;position:fixed;inset:0;z-index:130;background:rgba(4,8,16,.85);align-items:center;justify-content:center}
  #rkManualP{width:min(460px,92vw);max-height:86vh;overflow:auto;background:#0c1119;border:1px solid #2a3850;border-radius:12px;padding:18px 22px;color:#cdd6e4;font-size:14px;line-height:1.55}
  #rkManualP h2{color:#7ec8e3;margin:0 0 8px} #rkManualP ol{padding-left:20px} #rkManualP li{margin:4px 0}
  #rkFlight{display:none;position:fixed;inset:0;z-index:90;pointer-events:none;font-family:system-ui,sans-serif}
  #rkMsg{position:absolute;top:42px;left:0;right:0;padding:0 24px;text-align:center}
  #rkMsgT{max-width:920px;margin:0 auto;font-size:clamp(20px,2.2vw,28px);line-height:1.22;font-weight:900;color:#fff;text-shadow:0 2px 8px #000,0 0 18px #4af;letter-spacing:.035em}
  #rkMsgS{font-size:14px;color:#bcd; text-shadow:0 1px 3px #000;margin-top:4px}
  #rkArrow{position:absolute;top:46%;left:50%;transform:translate(-50%,-50%);font-size:40px;color:#7ed0ff;text-shadow:0 0 10px #2a8fd8;font-weight:900}
  #rkArrow.oncourse{font-size:20px;color:#6ff0a0;text-shadow:0 0 8px #2aa85a}
  #rkGauges{display:none;position:absolute;left:18px;bottom:18px;width:280px;background:rgba(6,11,20,.78);border:1px solid #2a3e5c;border-radius:12px;padding:12px 16px}
  .rkObj{color:#7ed0ff;font-weight:800;font-size:15px;margin-bottom:8px;letter-spacing:.03em} .rkObj b{color:#fff}
  .rkStat{display:flex;justify-content:space-between;align-items:baseline;padding:3px 0;color:#9fb4cc;font-size:13px;font-weight:700}
  .rkStat b{color:#eaf4ff;font-size:18px} .rkStat b.warn{color:#ff7a6a}
  .rkKeys{margin-top:8px;color:#7a8ba6;font-size:10.5px;line-height:1.5}
  .rkWarn{margin-top:8px;color:#ffce5a;font-weight:800;font-size:13px;text-shadow:0 0 8px #a8701a}
  body.rk-flying #statBars,body.rk-flying #hotbar,body.rk-flying #actionMenu,body.rk-flying #itemName,body.rk-flying #interactPrompt,body.rk-flying #topBar,body.rk-flying #objectivePanel,body.rk-flying .chat{display:none!important}
  #rkCockpit{display:none;position:fixed;inset:0;z-index:115;background:radial-gradient(circle at 50% 38%,rgba(10,16,28,.0),rgba(4,7,14,.6));align-items:flex-end;justify-content:center;font-family:system-ui,sans-serif;pointer-events:none}
  #rkCockP{pointer-events:auto;width:min(580px,96vw);margin-bottom:18px;background:linear-gradient(180deg,#0f1622,#0a0e16);border:1px solid #2a3a55;border-radius:14px;padding:14px 18px;box-shadow:0 -6px 30px rgba(0,0,0,.5)}
  .cktitle{color:#7ec8e3;font-weight:800;letter-spacing:.03em;margin-bottom:8px;font-size:13px}
  .ckgauges{display:grid;grid-template-columns:1fr 1fr;gap:6px 14px;margin-bottom:8px}
  .ckg{display:flex;align-items:center;gap:8px;color:#bcd;font-size:11px;font-weight:700} .ckg span{width:64px}
  .ckbar{flex:1;height:9px;background:#1a2536;border-radius:5px;overflow:hidden} .ckbar i{display:block;height:100%}
  .cklamps{display:flex;flex-wrap:wrap;gap:6px 14px;margin-bottom:10px;font-size:11px;color:#9fb0c8}
  .cklamp{display:flex;align-items:center;gap:5px} .dot{width:9px;height:9px;border-radius:50%} .dot.on{background:#5ed27a;box-shadow:0 0 6px #5ed27a} .dot.off{background:#5a3030}
  .cksteps{display:grid;grid-template-columns:1fr 1fr;gap:6px}
  .ckstep{display:flex;justify-content:space-between;align-items:center;padding:8px 11px;border-radius:8px;border:1px solid #2a3a55;background:#16243a;color:#cdd9ea;font-size:12px;font-weight:700;cursor:pointer;text-align:left}
  .ckstep b{font-size:10px;padding:1px 6px;border-radius:4px;margin-left:6px}
  .ckstep.waiting{opacity:.5} .ckstep.waiting b{background:#33405a;color:#9fb0c8}
  .ckstep.ready{border-color:#3a7a5a} .ckstep.ready b{background:#1d5e38;color:#7ef0a8}
  .ckstep.complete{border-color:#2a4a8a} .ckstep.complete b{background:#234a8a;color:#bcd8ff}
  .ckstep.failed{border-color:#7a3030} .ckstep.failed b{background:#6a2020;color:#ff9a9a}
  .ckactions{display:flex;gap:6px;margin-top:10px}
  #ckCount{font-size:30px;font-weight:900;color:#fff;text-align:center;text-shadow:0 0 16px #4af;margin:8px 0}
  #ckCountSub{text-align:center;color:#bcd;font-size:13px}
  `;
  document.head.appendChild(css);
  const dash=document.createElement('div'); dash.id='rkDash'; dash.innerHTML=`<div id="rkPanel"><div id="rkBody"></div></div>`; document.body.appendChild(dash);
  const man=document.createElement('div'); man.id='rkManual'; man.innerHTML=`<div id="rkManualP">
    <h2>📖 Rocket Manual</h2>
    <ol>
      <li>Build a <b>Launchpad</b>, then stack <b>3+ Rocket Hull</b> with a <b>Nose Cone</b> on top.</li>
      <li>Press <b>F</b> on the Launchpad to open the status panel.</li>
      <li>Install <b>Engine Core, Guidance, Battery, Oxygen Tank</b> + <b>3 Fuel</b> &amp; <b>3 Oxidizer</b> (or click <b>Auto-Assemble</b>).</li>
      <li>Click <b>BOARD ROCKET</b> — the screen fades and you spawn inside a cockpit room you can walk around.</li>
      <li>Walk to the <b>6 control panels</b> and press <b>F</b> on each in order: <b>Close Hatch → Arm Engines → Check Guidance → Lock Pad → Start Countdown → Confirm Launch</b>.</li>
      <li>Watch the countdown, then you switch to <b>third-person flight</b>.</li>
      <li>In space: <b>Space</b> thrust · <b>W/S</b> pitch · <b>A/D</b> yaw · <b>Q/E</b> roll · <b>Shift</b> boost · <b>Ctrl</b> brake · <b>R</b> auto-stabilize · <b>C</b> first/third-person camera.</li>
      <li>Fly freely — turn anywhere, circle the planets. Reach <b>Aethon</b> and the <b>landing sequence starts automatically</b> (no button). Press <b>H</b> any time to fly home.</li>
    </ol>
    <button class="rkbtn" id="rkManualClose">Close</button></div>`;
  document.body.appendChild(man);
  const fl=document.createElement('div'); fl.id='rkFlight'; fl.innerHTML=`<div id="rkMsg"><div id="rkMsgT"></div><div id="rkMsgS"></div></div><div id="rkArrow"></div><div id="rkGauges"></div>`; document.body.appendChild(fl);
  const cock=document.createElement('div'); cock.id='rkCockpit'; cock.innerHTML=`<div id="rkCockP"><div id="rkCockBody"></div></div>`; document.body.appendChild(cock);
  // delegated clicks
  dash.addEventListener('click',(e)=>{ const g=window.__voxhavenGame; if(!g) return; const b=e.target.closest('button'); if(!b) return;
    if(b.id==='rkClose'){ g._closeRocketDash(); return; }
    if(b.id==='rkAuto'){ g._rkAutoAssemble(); return; }
    if(b.id==='rkShell'){ const p=g._rkPad; if(p){ g._rkClearShell(); g._rkBuildShell(p[0],p[1],p[2]); g._renderRocketDash(); } return; }
    if(b.id==='rkBoard'){ g._rocketBoard(); return; }
    if(b.id==='rkManualBtn'){ document.getElementById('rkManual').style.display='flex'; return; }
    if(b.dataset.rk){ g._rkInstall(b.dataset.rk); }
  });
  cock.addEventListener('click',(e)=>{ const g=window.__voxhavenGame; if(!g) return; const b=e.target.closest('button'); if(!b) return;
    if(b.dataset.ck){ g._rkCockpitStep(b.dataset.ck); return; }
    if(b.id==='ckManualBtn'){ document.getElementById('rkManual').style.display='flex'; return; }
    if(b.id==='ckResume'){ g._closeCockpitUI(); return; }
    if(b.id==='ckExit'){ g._rkExitCockpit(); return; }
    if(b.id==='ckAbort2'){ g._rocketAbort(); return; }
  });
  man.addEventListener('click',(e)=>{ if(e.target.id==='rkManualClose'||e.target.id==='rkManual') document.getElementById('rkManual').style.display='none'; });
}
})();
