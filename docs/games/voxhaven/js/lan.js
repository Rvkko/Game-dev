/* =====================================================================
   lan.js — 2-player co-op over a WebRTC data channel. NO server needed:
   codes are exchanged by hand (text/Discord). Works on LAN or internet.
     Host:  type /host in chat  → code auto-copied → send it to your partner
     Guest: type /join          → paste host code → reply code auto-copied
     Host:  type /accept        → paste the reply → CONNECTED
   Synced: world seed/gen + every block edit (both ways, with meta), player
   position/dimension (you see each other as a second explorer), chat, and
   the host's clock. Host-owned mobs can target either player; container edits,
   door state, remote damage, and guest killing-blow loot are shared too.
   ===================================================================== */
const LAN = {
  pc:null, ch:null, isHost:false, connected:false,
  _applying:false, _avatar:null, _tgt:null, _remotePos:null, _lerpTimer:null, _posTimer:null, _heartbeatTimer:null, _lastSeen:0,
  onInit:null,   // main.js installs this: guest-side "load the host's world"

  _mkPeer(){ this.close(); this.pc=new RTCPeerConnection({ iceServers:[{urls:'stun:stun.l.google.com:19302'}] }); },
  close(){ try{ if(this.ch) this.ch.close(); if(this.pc) this.pc.close(); }catch(e){}
    this.pc=null; this.ch=null; this.connected=false; this._remotePos=null; this._rmAvatar(); this._rmGhosts();
    if(this._posTimer){ clearInterval(this._posTimer); this._posTimer=null; }
    if(this._mobTimer){ clearInterval(this._mobTimer); this._mobTimer=null; }
    if(this._heartbeatTimer){ clearInterval(this._heartbeatTimer); this._heartbeatTimer=null; }
    if(this._lerpTimer){ clearInterval(this._lerpTimer); this._lerpTimer=null; } },

  async host(){
    try{
      this._mkPeer(); this.isHost=true;
      this.ch=this.pc.createDataChannel('vox'); this._wire();
      await this.pc.setLocalDescription(await this.pc.createOffer());
      await this._ice();
      this._give(btoa(JSON.stringify(this.pc.localDescription)),
        'HOST code copied — send it to your partner. When they send a reply code back, type /accept');
    }catch(e){ this._say('co-op host failed: '+e.message); }
  },
  async join(code){
    try{
      if(!code) code=window.prompt('Paste the HOST code:'); if(!code) return;
      this._mkPeer(); this.isHost=false;
      this.pc.ondatachannel=(e)=>{ this.ch=e.channel; this._wire(); };
      await this.pc.setRemoteDescription(JSON.parse(atob(code.trim())));
      await this.pc.setLocalDescription(await this.pc.createAnswer());
      await this._ice();
      this._give(btoa(JSON.stringify(this.pc.localDescription)),
        'REPLY code copied — send it to the host. You connect when they /accept it.');
    }catch(e){ this._say('co-op join failed: '+e.message); }
  },
  async accept(code){
    try{
      if(!this.pc||!this.isHost){ this._say('type /host first'); return; }
      if(!code) code=window.prompt('Paste your partner\'s REPLY code:'); if(!code) return;
      await this.pc.setRemoteDescription(JSON.parse(atob(code.trim())));
    }catch(e){ this._say('accept failed: '+e.message); }
  },

  _ice(){ return new Promise(res=>{ if(this.pc.iceGatheringState==='complete') return res();
    this.pc.addEventListener('icegatheringstatechange',()=>{ if(this.pc.iceGatheringState==='complete') res(); });
    setTimeout(res,3000); }); },
  _give(code,msg){ try{ navigator.clipboard&&navigator.clipboard.writeText(code); }catch(e){}
    try{ window.prompt(msg+'\n(Ctrl+C the code below if it was not auto-copied)', code); }catch(e){}
    this._say(msg); },
  _say(t){ if(window.addChat) addChat('> [co-op] '+t); else console.log('[co-op]',t); },

  _wire(){
    this.ch.onopen=()=>{
      this.connected=true; this._say('CONNECTED');
      this._lastSeen=Date.now();
      const g=window.__voxhavenGame;
      // guest: the HOST owns the wildlife — clear local mobs (keep your tamed mount)
      if(!this.isHost && g) for(let i=g.mobs.length-1;i>=0;i--){ const mb=g.mobs[i]; if(!mb._net && !mb.tamed) g._removeMob(mb); }
      if(this.isHost && g && g.world){
        const W=g.overworld||g.world;   // always sync the OVERWORLD, even if the host is on the planet or in the cockpit
        const deltas={}; for(const [k,v] of W.deltas) deltas[k]=v;
        const meta={},chests={},furnaces={}; for(const [k,v] of W.meta) meta[k]=v;
        for(const [k,v] of W.chests) chests[k]=v; for(const [k,v] of W.furnaces) furnaces[k]=v;
        let planet=null;
        if(g.planetWorld){ const P=g.planetWorld, pd={},pm={},pc={},pf={}; for(const [k,v] of P.deltas) pd[k]=v; for(const [k,v] of P.meta) pm[k]=v; for(const [k,v] of P.chests) pc[k]=v; for(const [k,v] of P.furnaces) pf[k]=v; planet={deltas:pd,meta:pm,chests:pc,furnaces:pf}; }
        this.send({t:'init', seed:W.seed, gen:W.genVer||1, deltas, meta, chests, furnaces, planet, time:g.time, day:g.day});
      }
      this._heartbeatTimer=setInterval(()=>{ if(!this.connected) return; if(Date.now()-this._lastSeen>15000){ this._say('connection timed out'); this.close(); return; } this.send({t:'ping',at:Date.now()}); },5000);
      // stream our position ~10x/s; the host's packets also carry the clock
      this._posTimer=setInterval(()=>{
        const g=window.__voxhavenGame; if(!g||!g.player||!this.connected) return;
        const p={t:'p', x:+g.player.pos.x.toFixed(2), y:+g.player.pos.y.toFixed(2), z:+g.player.pos.z.toFixed(2), yaw:+g.player.yaw.toFixed(2), wet:!!g.player.inWater, dim:g.dimension||'overworld'};
        if(this.isHost){ p.time=g.time; p.day=g.day; }
        this.send(p);
      },100);
      // HOST: broadcast nearby mob state ~2x/s so the guest shares the same wildlife
      if(this.isHost){
        this._mobTimer=setInterval(()=>{
          const g=window.__voxhavenGame; if(!g||!g.player||!this.connected) return;
          const list=[];
          for(const mb of g.mobs){
            if(mb._net) continue;
            const dx=mb.pos.x-g.player.pos.x, dz=mb.pos.z-g.player.pos.z;
            const rx=this._remotePos?mb.pos.x-this._remotePos.x:999, rz=this._remotePos?mb.pos.z-this._remotePos.z:999;
            if(dx*dx+dz*dz>80*80 && rx*rx+rz*rz>80*80) continue;
            mb._netId=mb._netId||(LAN._nid=(LAN._nid||0)+1);
            list.push([mb._netId, mb.kind, +mb.pos.x.toFixed(1), +mb.pos.y.toFixed(1), +mb.pos.z.toFixed(1), +mb.yaw.toFixed(2), Math.round(mb.hp), (mb.state==='idle')?0:1]);
            if(list.length>=24) break;
          }
          this.send({t:'m', dim:g.dimension||'overworld', list});
        },500);
      }
      // smooth the remote avatar + mob ghosts between packets
      this._lerpTimer=setInterval(()=>{
        if(this._avatar&&this._tgt){
          const a=this._avatar.position, t=this._tgt;
          a.x+=(t.x-a.x)*0.35; a.y+=(t.y-a.y)*0.35; a.z+=(t.z-a.z)*0.35;
          this._avatar.rotation.y+=(t.yaw-this._avatar.rotation.y)*0.35;
        }
        if(this._ghosts) for(const [,gh] of this._ghosts){ const t=gh._tgtP; if(!t) continue;
          gh.pos.x+=(t.x-gh.pos.x)*0.3; gh.pos.y+=(t.y-gh.pos.y)*0.3; gh.pos.z+=(t.z-gh.pos.z)*0.3; gh.yaw+=(t.yaw-gh.yaw)*0.3; }
      },33);
    };
    this.ch.onclose=()=>{ this._say('disconnected'); this.close(); };
    this.ch.onmessage=(e)=>{ let m; try{ if(typeof e.data!=='string'||e.data.length>1000000) return; m=JSON.parse(e.data); if(!m||typeof m!=='object'||typeof m.t!=='string') return; this._lastSeen=Date.now(); this._recv(m); }catch(err){ console.warn('[co-op] ignored invalid message',err); } };
  },
  send(o){ if(this.connected&&this.ch&&this.ch.readyState==='open'){ try{ this.ch.send(JSON.stringify(o)); }catch(e){} } },

  syncContainer(g,kind,pos){
    if(!this.connected||!g||!g.world||!pos) return;
    const key=g.world.bkey(pos[0],pos[1],pos[2]);
    const data=kind==='chest'?g.world.chests.get(key):g.world.furnaces.get(key);
    if(data) this.send({t:'s',kind,key,data,dim:g.dimension||'overworld'});
  },

  _recv(m){
    const g=window.__voxhavenGame;
    if(m.t==='ping'){ this.send({t:'pong',at:m.at}); return; }
    if(m.t==='pong') return;
    if(m.t==='init'){ if(this.onInit) this.onInit(m); return; }
    if(!g||!g.world) return;
    if(m.t==='b'){                    // partner placed/broke a block — apply in the RIGHT dimension
      const dim=m.dim||'overworld';
      if(dim==='cockpit'){ /* transient interior — ignore */ }
      else if(dim===(g.dimension||'overworld')){
        this._applying=true; try{ g.setBlock(m.x,m.y,m.z,m.id,m.meta||undefined); }catch(e){} this._applying=false;
      } else {
        // partner edited a dimension we're not in — write straight into that world's data
        let w = dim==='planet' ? g.planetWorld : g.overworld;
        if(dim==='planet' && !w && typeof PlanetWorld!=='undefined'){ w=g.planetWorld=new PlanetWorld((((g.overworld&&g.overworld.seed)||g.world.seed))^0x50ACE); }
        if(w) try{ w.setBlock(m.x,m.y,m.z,m.id,m.meta||undefined); }catch(e){}
      }
    } else if(m.t==='p'){             // partner moved
      this._remotePos={x:m.x,y:m.y,z:m.z,dim:m.dim||'overworld'};
      if(!this.isHost && m.time!=null){ if(Math.abs((g.time||0)-m.time)>0.01) g.time=m.time; if(m.day!=null) g.day=m.day; }
      const sameDim=(m.dim||'overworld')===(g.dimension||'overworld');
      if(!sameDim){ this._tgt=null; if(this._avatar) this._avatar.visible=false; return; }
      if(!this._avatar){ this._avatar=mobModel('player'); ProductionAssets.mount('explorer',this._avatar,{replace:true,scale:0.6}); g.scene.add(this._avatar); this._avatar.position.set(m.x,m.y,m.z); }
      this._avatar.visible=true;
      this._tgt={x:m.x,y:m.y,z:m.z,yaw:m.yaw||0};
    } else if(m.t==='s'){
      const dim=m.dim||'overworld'; const w=dim===(g.dimension||'overworld')?g.world:(dim==='planet'?g.planetWorld:g.overworld);
      if(w&&m.key&&m.data&&(m.kind==='chest'||m.kind==='furnace')){ const map=m.kind==='chest'?w.chests:w.furnaces; if(map){ map.set(m.key,m.data); if(window.__voxhavenRefreshContainer) window.__voxhavenRefreshContainer(m.kind,m.key,dim); } }
    } else if(m.t==='grant'){
      if(this.isHost) return;
      for(const q of (Array.isArray(m.items)?m.items.slice(0,32):[])){ if(!Array.isArray(q)||!ITEMS[q[0]]) continue; const count=Math.max(1,Math.min(999,+q[1]||1)), left=g.giveItem(q[0],count); if(left) g._spawnDrop(q[0],left,g.player.pos.x,g.player.pos.y+0.5,g.player.pos.z); }
      if(g.onToast&&m.items&&m.items.length) g.onToast('Co-op loot collected');
    } else if(m.t==='hurt'){
      if(this.isHost) return;
      g.hurtPlayer(Math.max(1,Math.min(20,+m.dmg||1)),m.src||undefined);
    } else if(m.t==='m'){             // host's mob mirror (guest only)
      if(this.isHost) return;
      if((m.dim||'overworld')!==(g.dimension||'overworld')){ this._rmGhosts(); return; }
      this._ghosts=this._ghosts||new Map();
      const seen=new Set();
      for(const e of (m.list||[])){
        const [id,k,x,y,z,yaw,hp,mov]=e; seen.add(id);
        let gh=this._ghosts.get(id);
        if(!gh){ if(typeof MOB_DEF==='undefined'||!MOB_DEF[k]) continue;
          gh=new Mob(k,x,y,z); gh._net=true; gh._netId=id; gh.persistent=true;
          g.scene.add(gh.group); g.mobs.push(gh); this._ghosts.set(id,gh); }
        gh._tgtP={x,y,z,yaw:yaw||0}; if(hp<gh.hp) gh.hurtT=0.2; gh.hp=hp; gh._netMoving=!!mov;
      }
      for(const [id,gh] of this._ghosts){ if(!seen.has(id)){ g._removeMob(gh); this._ghosts.delete(id); } }
    } else if(m.t==='hit'){           // guest struck one of our mobs — host applies it
      if(!this.isHost) return;
      const mm=g.mobs.find(q=>q._netId===m.id && !q._net);
      if(mm){ mm.hp-=Math.min(mm.hp,20,Math.max(1,+m.dmg||1)); mm.hurtT=0.2; if(mm.def&&mm.def.hostile) g._pushAlarm(mm.pos.x,mm.pos.z); if(mm.hp<=0){ const loot=[]; g._lootSink=(id,n)=>loot.push([id,n]); try{ g._killMob(mm); }finally{ g._lootSink=null; } if(loot.length) this.send({t:'grant',items:loot}); } }
    } else if(m.t==='c'){             // partner chat
      if(window.addChat) addChat('<partner> '+(''+m.text).slice(0,200));
    }
  },
  _rmAvatar(){ const g=window.__voxhavenGame; if(this._avatar&&g&&g.scene) g.scene.remove(this._avatar); this._avatar=null; this._tgt=null; },
  _rmGhosts(){ const g=window.__voxhavenGame; if(this._ghosts&&g){ for(const [,gh] of this._ghosts) g._removeMob(gh); } this._ghosts=null; },
};

// broadcast every world edit (both directions); remote applies with _applying set
(function(){
  if(typeof Game==='undefined') return;
  const orig=Game.prototype.setBlock;
  Game.prototype.setBlock=function(x,y,z,id,meta){
    const r=orig.call(this,x,y,z,id,meta);
    if(LAN.connected && !LAN._applying && this===window.__voxhavenGame && this.dimension!=='cockpit') LAN.send({t:'b',x,y,z,id,meta:meta||null,dim:this.dimension||'overworld'});
    return r;
  };
  const origUse=Game.prototype.interact;
  Game.prototype.interact=function(){
    const h=this.selBlock, id=h&&this.world.getBlock(h.x,h.y,h.z);
    const r=origUse.call(this);
    if(r&&h&&(id===B.DOOR||id===B.METAL_DOOR)&&LAN.connected&&!LAN._applying&&this===window.__voxhavenGame){
      LAN.send({t:'b',x:h.x,y:h.y,z:h.z,id,meta:this.world.getMeta(h.x,h.y,h.z)||null,dim:this.dimension||'overworld'});
    }
    return r;
  };
  // guest melee on a mob ghost relays the damage to the host (host is authoritative)
  const origAtk=Game.prototype.attack;
  Game.prototype.attack=function(){
    if(!(LAN.connected&&!LAN.isHost)) return origAtk.call(this);
    const pre=new Map(); for(const mb of this.mobs) if(mb._net) pre.set(mb,mb.hp);
    const r=origAtk.call(this);
    for(const [mb,hp0] of pre){ if(this.mobs.indexOf(mb)>=0 ? mb.hp<hp0 : true){ const d=this.mobs.indexOf(mb)>=0 ? (hp0-mb.hp) : hp0; if(d>0) LAN.send({t:'hit', id:mb._netId, dmg:d}); } }
    return r;
  };
})();
