// ===== js/space.js — Space-Age expansion (Writer B) =====
// Distant planet 'Aethon', oxygen system, launch + dimension travel, alien
// PlanetWorld. Runs at load: extends Game.prototype + defines PlanetWorld.
// Every Game hook is optional-chained by the keystone and wrapped here so a
// failure can never blank the screen.

// single alien biome descriptor — surface/filler used by inherited code paths
// (biomeName, _genBase fallbacks); our overrides cap the ground themselves.
const ALIEN_BIOME = { surface:B.ALIEN_GRASS, filler:B.ALIEN_ROCK, tree:0, plant:0, color:0xb86a4a };

// ---------- the alien world ----------
class PlanetWorld extends World {
  constructor(seed){
    super(seed>>>0);
    this.nAlien = new Noise((seed^0xA17E0)>>>0);   // calm alien relief
    this.nVein  = new Noise((seed^0xC2751)>>>0);   // crystal veins
    this.isPlanet = true;
  }
  // calm barren band ~62..78 — gentle dunes, no peaks, no rivers
  heightAt(wx,wz){
    const a = this.nAlien.fbm2(wx*0.011+5, wz*0.011-5, 4);
    const b = this.nAlien.fbm2(wx*0.004-30, wz*0.004+30, 2);
    const h = 64 + (a-0.5)*16 + (b-0.5)*10;
    return Math.floor(clamp(h,58,82));
  }
  biomeAt(wx,wz,h){ return ALIEN_BIOME; }
  // solid alien rock to height, MARS_SOIL patches under a grass/soil cap, crystal
  // veins seeded in the rock; no water, no caves, no depth bands
  _genBase(c,cx,cz){
    const ox=cx*CHUNK_X, oz=cz*CHUNK_Z;
    for(let lz=0;lz<CHUNK_Z;lz++) for(let lx=0;lx<CHUNK_X;lx++){
      const wx=ox+lx, wz=oz+lz;
      const h=this.heightAt(wx,wz);
      const soil = this.nAlien.fbm2(wx*0.03+11, wz*0.03-11, 2) > 0.56;   // MARS_SOIL patch
      for(let y=0;y<=h && y<WORLD_H;y++){
        let id=B.ALIEN_ROCK;
        if(y===h) id = soil ? B.MARS_SOIL : B.ALIEN_GRASS;
        else if(y>h-3) id = soil ? B.MARS_SOIL : B.ALIEN_ROCK;
        // crystal veins down in the rock — glowing ore pockets
        if(id===B.ALIEN_ROCK && y<h-2){
          const v=this.nVein.fbm3(wx*0.07,y*0.07,wz*0.07,2);
          if(v>0.80 && hashRand(wx,wz,(this.seed^0xC2751)+y*131)<0.34) id=B.ALIEN_CRYSTAL;
        }
        this._set(c,lx,y,lz,id);
      }
    }
  }
  // sparse blooms + small alien trees; NO villages, NO caves
  _genFeatures(c,cx,cz){
    const ox=cx*CHUNK_X, oz=cz*CHUNK_Z;
    const stamp=(wx,y,wz,id,force)=>{ const lx=wx-ox, lz=wz-oz; if(lx<0||lx>=CHUNK_X||lz<0||lz>=CHUNK_Z) return; if(!force){ const cur=this._get(c,lx,y,lz); if(cur!==B.AIR && cur!==B.ALIEN_LEAVES) return; } this._set(c,lx,y,lz,id); };
    for(let wz=oz-3; wz<oz+CHUNK_Z+3; wz++) for(let wx=ox-3; wx<ox+CHUNK_X+3; wx++){
      const h=this.heightAt(wx,wz); if(h<=0 || h>=WORLD_H-8) continue;
      const lx=wx-ox, lz=wz-oz;
      const top = (lx>=0&&lx<CHUNK_X&&lz>=0&&lz<CHUNK_Z) ? this._get(c,lx,h,lz) : B.AIR;
      // bloom cross-plants on grass/soil
      if((top===B.ALIEN_GRASS||top===B.MARS_SOIL) && hashRand(wx,wz,this.seed^0xB10)<0.05) stamp(wx,h+1,wz,B.ALIEN_PLANT,false);
      // small alien trees — short log + frond cap
      if(top===B.ALIEN_GRASS && hashRand(wx,wz,this.seed^0x7EE)<0.010){
        const th=3+((hashRand(wx,wz,this.seed^0x7EF)*2)|0);
        for(let i=1;i<=th;i++) stamp(wx,h+i,wz,B.ALIEN_LOG,true);
        for(let dy=th-1; dy<=th+1; dy++) for(let dx=-2;dx<=2;dx++) for(let dz=-2;dz<=2;dz++){
          if(dx*dx+dz*dz+(dy-th)*(dy-th) > 4) continue;
          if(dx===0&&dz===0&&dy<=th) continue;
          stamp(wx+dx,h+dy,wz+dz,B.ALIEN_LEAVES,false);
        }
      }
    }
  }
}

// ---------- planet sky body + dimension/oxygen state ----------
Game.prototype._initSpace = function(){
  try{
    this.dimension='overworld'; this.inSpace=false;
    this.oxygen=10; this.oxygenMax=10;
    this.overworld=this.world||null; this.planetWorld=null;
    this._dimPos={}; this._fueled=false; this._o2Hurt=0;

    const g=new THREE.Group();
    // voxel sphere of cubes — banded rust/orange/teal
    const cols=[0xb5552e,0xd0743a,0xc98a52,0x3f9c93,0x2f7d77,0xa84a36];
    const R=6, cube=new THREE.BoxGeometry(1,1,1);
    const mats=cols.map(c=>new THREE.MeshBasicMaterial({ color:c, fog:false }));
    const counts=new Array(cols.length).fill(0);
    const cells=[];
    for(let x=-R;x<=R;x++) for(let y=-R;y<=R;y++) for(let z=-R;z<=R;z++){
      const d=Math.sqrt(x*x+y*y+z*z); if(d>R || d<R-1.15) continue;       // hollow shell of cubes
      const band=Math.floor(((y/R)*0.5+0.5)*cols.length); const ci=clamp(band,0,cols.length-1);
      cells.push([x,y,z,ci]); counts[ci]++;
    }
    const meshes=mats.map((m,i)=> new THREE.InstancedMesh(cube,m,Math.max(1,counts[i])));
    const idx=new Array(cols.length).fill(0); const mtx=new THREE.Matrix4();
    for(const [x,y,z,ci] of cells){ mtx.makeTranslation(x,y,z); meshes[ci].setMatrixAt(idx[ci]++, mtx); }
    for(const m of meshes){ m.instanceMatrix.needsUpdate=true; m.frustumCulled=false; g.add(m); }
    // ring
    const ring=new THREE.Mesh(new THREE.TorusGeometry(R+3.4,0.7,2,40), new THREE.MeshBasicMaterial({ color:0xc9b08a, fog:false, transparent:true, opacity:0.85 }));
    ring.rotation.x=Math.PI*0.42; ring.rotation.z=0.3; g.add(ring);
    // small moon
    const moon=new THREE.Mesh(new THREE.SphereGeometry(2.2,10,8), new THREE.MeshBasicMaterial({ color:0x8d8a96, fog:false }));
    moon.position.set(R+9,3,-2); g.add(moon);

    g.scale.setScalar(2.2); g.visible=false; g.frustumCulled=false;
    this.planetSphere=g; this.scene.add(g);
  }catch(e){ this.planetSphere=null; }
};

// called by newWorld() — always start fresh on the overworld
Game.prototype._resetSpace = function(seed){
  try{
    this.dimension='overworld'; this.inSpace=false;
    this.oxygen=this.oxygenMax||10; this.oxygenMax=this.oxygenMax||10;
    this.overworld=this.world; this.planetWorld=null;
    this._dimPos={}; this._fueled=false; this._o2Hurt=0;
    if(this.player) this.player.gravScale=1;
    if(this.planetSphere) this.planetSphere.visible=false;
  }catch(e){}
};

// per-frame: planet placement/rotation/visibility + oxygen book-keeping
Game.prototype._spaceTick = function(dt,ctl){
  try{
    // during rocket flight, the rocket module owns the whole space scene —
    // hide both sky bodies so there's never a duplicate planet on screen
    if(this._rocketActive){ if(this.planetSphere) this.planetSphere.visible=false; if(this._homeSphere) this._homeSphere.visible=false; return; }
    const cam=this.camera.position;
    if(this.inSpace){
      // ON AETHON: no alien planet in its own sky — instead your distant home EARTH hangs
      // overhead, and the alien sky stays DARK with fog drifting through.
      if(this.planetSphere) this.planetSphere.visible=false;
      const h=this._ensureHomeSphere();
      if(h){ h.visible=true; h.position.set(cam.x-70, cam.y+95, cam.z-150); h.rotation.y += dt*0.03; }
      this._aethonSky(dt);
    } else {
      if(this._homeSphere) this._homeSphere.visible=false;
      const g=this.planetSphere;
      if(g){ const night = this.time<0.24 || this.time>0.76;
        g.position.set(cam.x+220, cam.y+150, cam.z-260); g.scale.setScalar(2.2); g.visible=night;
        g.rotation.y += dt*0.06; g.rotation.x = 0.15; }
    }
    // oxygen: drains in space without an oxygen helmet (survival only)
    const p=this.player;
    if(p && this.inSpace && this.mode==='survival'){
      const helm=p.armor&&p.armor.head; const hasO2 = helm && ITEMS[helm.item] && ITEMS[helm.item].oxygen;
      if(hasO2){ this.oxygen=Math.min(this.oxygenMax, this.oxygen + dt*2); }
      else {
        this.oxygen=Math.max(0, this.oxygen - dt*0.5);
        this._o2Hurt=(this._o2Hurt||0)+dt;
        if(this.oxygen<=0 && this._o2Hurt>1.5){ this._o2Hurt=0; this.hurtPlayer(1); }
      }
    } else {
      this.oxygen=Math.min(this.oxygenMax||10, (this.oxygen||0) + dt*4);   // regen on the overworld / safe
    }
  }catch(e){}
};

// your HOME world (Earth) as a distant body in Aethon's sky — blue ocean + green
// continents + atmosphere glow, clearly different from the rust alien planet
Game.prototype._ensureHomeSphere = function(){
  if(this._homeSphere) return this._homeSphere;
  try{ const g=new THREE.Group();
    g.add(new THREE.Mesh(new THREE.SphereGeometry(14,28,20), new THREE.MeshBasicMaterial({ color:0x2a6a86, fog:false })));   // ocean
    const land=new THREE.MeshBasicMaterial({ color:0x3f8a44, fog:false });
    for(const [x,y,z] of [[0.6,0.5,0.6],[-0.7,0.2,0.5],[0.1,-0.6,0.7],[-0.4,-0.4,-0.6],[0.55,0.55,-0.45]]){
      const c=new THREE.Mesh(new THREE.SphereGeometry(4.6,10,8), land);
      c.position.copy(new THREE.Vector3(x,y,z).normalize().multiplyScalar(13.8)); c.scale.set(1,1,0.4); c.lookAt(0,0,0); g.add(c); }
    g.add(new THREE.Mesh(new THREE.SphereGeometry(15.6,22,16), new THREE.MeshBasicMaterial({ color:0x9fd0ff, transparent:true, opacity:0.22, side:THREE.BackSide, fog:false })));   // atmosphere
    g.scale.setScalar(2.4); g.frustumCulled=false; g.visible=false; this.scene.add(g); this._homeSphere=g;
  }catch(e){ this._homeSphere=null; }
  return this._homeSphere;
};
// Aethon sky: dark always (no day-cycle brightening), stars out, fog drifting in & out.
// runs every frame AFTER updateSky(), so it wins.
Game.prototype._aethonSky = function(dt){
  try{
    this.scene.background = (this._aethBg || (this._aethBg=new THREE.Color(0x080a16)));
    if(this.stars){ this.stars.visible=true; this.stars.material.opacity=0.9; this.stars.position.copy(this.camera.position); }
    if(this.scene.fog){ this.scene.fog.color.setHex(0x141a2c);
      this._aethFog=(this._aethFog||0)+dt*0.04; const f=Math.sin(this._aethFog)*0.5+0.5;   // slow 0..1 drift → fog "here and there"
      const base=this.renderDist*CHUNK_X; this.scene.fog.near=base*(0.45+f*0.5); this.scene.fog.far=base*(0.9+f*0.6); }
    if(this.sun) this.sun.intensity=0.14; if(this.hemi) this.hemi.intensity=0.5; if(this.ambient) this.ambient.intensity=0.42;   // surface stays visible, sky stays dark
  }catch(e){}
};

// block interactions claimed by the space module (runs at top of interact())
Game.prototype._spaceInteract = function(id,x,y,z){
  try{
    if(id===B.SCIENCE_BENCH){ this.heldSwing=1; this.onOpenCraft&&this.onOpenCraft('science'); return true; }
    if(id===B.FUEL_TANK){
      this.heldSwing=1;
      if(this._fueled){ this.onFlash&&this.onFlash('Fuel tank already full'); return true; }
      if(this.countItem&&this.countItem('rocket_fuel')>0){ this.takeItem('rocket_fuel',1); this._fueled=true; this.onFlash&&this.onFlash('Fuel tank filled'); }
      else this.onFlash&&this.onFlash('Need rocket fuel');
      return true;
    }
    if(id===B.LAUNCHPAD){ this.heldSwing=1; this.tryLaunch(); return true; }
  }catch(e){}
  return false;
};

// validate the rocket then blast off to the planet
Game.prototype.tryLaunch = function(){
  try{
    if(this.inSpace){ this.onFlash&&this.onFlash('Already on Aethon'); return; }
    const p=this.player, W=this.world;
    const px=Math.floor(p.pos.x), pz=Math.floor(p.pos.z), py=Math.floor(p.pos.y);
    // count ROCKET_HULL within radius 3 columns; bonus if a nose caps a stack
    let hull=0, nose=false;
    for(let dx=-3;dx<=3;dx++) for(let dz=-3;dz<=3;dz++) for(let dy=-1;dy<=8;dy++){
      const b=W.getBlock(px+dx,py+dy,pz+dz);
      if(b===B.ROCKET_HULL) hull++; else if(b===B.ROCKET_NOSE) nose=true;
    }
    if(hull<3 || !nose){ this.onFlash&&this.onFlash('Build a rocket: 3+ hull + a nose cone'); return; }
    if(!this._fueled){ this.onFlash&&this.onFlash('Rocket needs fuel — fill the tank'); return; }
    if(this.mode==='survival'){
      const helm=p.armor&&p.armor.head; const hasO2 = helm && ITEMS[helm.item] && ITEMS[helm.item].oxygen;
      if(!hasO2){ this.onFlash&&this.onFlash('Equip a spacesuit helmet first'); return; }
    }
    this._fueled=false;
    this.onFlash&&this.onFlash('Liftoff — destination Aethon');
    this._launchFx&&this._launchFx(px+0.5,py,pz+0.5);
    this.travelTo('planet');
  }catch(e){}
};

// optional exhaust burst at launch
Game.prototype._launchFx = function(x,y,z){
  try{ if(!this.particles) return; for(let i=0;i<14;i++) this._spawnParticles&&this._spawnParticles(x,y,z,i%2?'#ffd27a':'#ff7a2a'); }catch(e){}
};

// swap dimension: tear down meshes/entities, switch world, reposition, reload
Game.prototype.travelTo = function(dim){
  try{
    if(!this.player) return;   // consistency guard — every line below derefs this.player
    // save where we stood in the current dimension
    this._dimPos=this._dimPos||{};
    if(this.player) this._dimPos[this.dimension]={ x:this.player.pos.x, y:this.player.pos.y, z:this.player.pos.z };

    // dispose all chunk meshes + their scene objects
    for(const [k,e] of this.chunkMeshes){
      for(const m of [e.opaque,e.cutout,e.blend]) if(m){ this.scene.remove(m); m.geometry.dispose(); }
      for(const o of e.objects) this.scene.remove(o);
    }
    this.chunkMeshes.clear(); this.loadQueue=[]; this.dirty=new Set();
    // remove mobs / drops / particles from the scene
    for(const m of this.mobs) this.scene.remove(m.group); this.mobs=[];
    if(this.drops){ for(const d of this.drops) if(d.spr) this.scene.remove(d.spr); this.drops=[]; }
    if(this.particles){ for(const q of this.particles) q.active=false; }

    // pick / lazily build the target world
    if(dim==='planet'){
      if(!this.planetWorld) this.planetWorld=new PlanetWorld(((this.overworld&&this.overworld.seed)||this.world.seed)^0x50ACE);
      this.world=this.planetWorld;
    } else {
      this.world=this.overworld||this.world;
    }
    this.player.world=this.world;
    this.dimension=dim; this.inSpace=(dim==='planet');
    this.player.gravScale = dim==='planet'?0.4:1;

    // reposition: restore saved spot, else find a safe alien/overworld surface
    const saved=this._dimPos[dim];
    if(saved && this.world.isSolid(Math.floor(saved.x),Math.floor(saved.y)-1,Math.floor(saved.z))){
      this.player.setPos(saved.x,saved.y,saved.z);
    } else {
      this._spawnPlayerSafely(0,0);
    }

    // lay a return launchpad at the landing site on the planet so you can get home
    if(dim==='planet'){
      const lx=Math.floor(this.player.pos.x), lz=Math.floor(this.player.pos.z);
      const ly=this.world.surfaceY(lx,lz);
      if(ly>0){ this.world.setBlock(lx,ly,lz,B.LAUNCHPAD); this.player.setPos(lx+0.5, ly+1.02, lz+0.5); }
    }

    // burst-load chunks so we don't drop into the void
    this.maintainChunks();
    for(let i=0;i<30;i++) this.processLoad(8);
  }catch(e){}
};

// ---------- save / load ----------
Game.prototype._serializeSpace = function(){
  try{
    const deltas={};
    if(this.planetWorld){ for(const [k,v] of this.planetWorld.deltas) deltas[k]=v; }
    return { dimension:this.dimension, dimPos:this._dimPos, oxygen:this.oxygen, fueled:this._fueled, planetDeltas:deltas };
  }catch(e){ return {}; }
};
Game.prototype._loadSpace = function(save){
  try{
    if(!save) return;
    this.overworld=this.world;            // newWorld already built the overworld
    this.planetWorld=null;
    this._dimPos=save.dimPos||{};
    this.oxygen=(save.oxygen!=null)?save.oxygen:(this.oxygenMax||10);
    this._fueled=!!save.fueled;
    this.dimension='overworld'; this.inSpace=false;
    if(this.player) this.player.gravScale=1;
    const pd=save.planetDeltas;
    if(pd && Object.keys(pd).length){
      this.planetWorld=new PlanetWorld((this.overworld.seed)^0x50ACE);
      this.planetWorld.deltas=new Map(Object.entries(pd).map(([k,v])=>[k,+v]));
    }
    if(save.dimension==='planet') this.travelTo('planet');
  }catch(e){}
};
