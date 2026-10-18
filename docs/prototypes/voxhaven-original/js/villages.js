/* =====================================================================
   villages.js — Writer D. Overrides World.prototype village stamping to
   be biome-aware and far richer (market, blacksmith, fenced farm plot,
   lamp-lit paths) while preserving every contract Game relies on:
   this.villages dedup, central path cross + well, v.settlers / v.beds
   arrays of [x,y,z], v._done=true. Runs at load; reassigns prototype
   methods so the game.js originals are replaced. Deterministic via
   hashRand. Only existing B.* ids used.
   ===================================================================== */

// pick a build palette from the biome under the village centre
World.prototype._villagePalette=function(v){
  const b=this.biomeAt(v.x,v.z,this.heightAt(v.x,v.z));
  if(b===BIOMES.desert)  return { wall:B.SANDSTONE, wall2:B.SMOOTH_SANDSTONE, roof:B.TERRACOTTA, floor:B.SANDSTONE, accent:B.CHISELED_SANDSTONE };
  if(b===BIOMES.snow)    return { wall:B.PLANKS, wall2:B.STONEBRICK, roof:B.PACKED_ICE, floor:B.PLANKS, accent:B.SNOW };
  return { wall:B.PLANKS, wall2:B.STONEBRICK, roof:B.ROOFTILE, floor:B.PLANKS, accent:B.STONEBRICK };
};

World.prototype._stampVillage=function(v, ox, oz, c){
  const plat=v.plat;
  const stamp=(wx,y,wz,id)=>{ const lx=wx-ox, lz=wz-oz; if(lx<0||lx>=CHUNK_X||lz<0||lz>=CHUNK_Z||y<0||y>=WORLD_H) return; this._set(c,lx,y,lz,id); };
  const ground=(wx,wz,id)=>{ // flatten column to platform, foundation to bedrock
    for(let y=plat+1;y<plat+10;y++) stamp(wx,y,wz,B.AIR);
    stamp(wx,plat,wz,id);
    for(let y=plat-1;y>2;y--) stamp(wx,y,wz,B.DIRT);
  };
  if(this.villages.findIndex(p=>p.x===v.x&&p.z===v.z)<0) this.villages.push({x:v.x,z:v.z});
  const pal=this._villagePalette(v);
  v.settlers=[]; v.beds=[];
  // clear trees & tall foliage inside the village footprint so it's an OPEN CLEARING
  // (paths can never carve a scar through / split a forest — trees beyond the edge stay)
  const getV=(wx,y,wz)=>{ const lx=wx-ox,lz=wz-oz; if(lx<0||lx>=CHUNK_X||lz<0||lz>=CHUNK_Z||y<0||y>=WORLD_H) return -1; return this._get(c,lx,y,lz); };
  for(let dx=-17;dx<=17;dx++)for(let dz=-17;dz<=17;dz++){ if(dx*dx+dz*dz>17*17) continue;
    for(let y=plat+1;y<plat+16;y++){ const b=getV(v.x+dx,y,v.z+dz);
      if(b===B.LOG||b===B.LEAVES||b===B.TALLGRASS||b===B.FLOWER_R||b===B.FLOWER_B||b===B.MUSHROOM||b===B.CACTUS||b===B.SUGARCANE) stamp(v.x+dx,y,v.z+dz,B.AIR); } }
  // small GRAVEL courtyard around a stone well (clean, not a big dirt square)
  for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++){ if(Math.abs(dx)===2&&Math.abs(dz)===2) continue; ground(v.x+dx,v.z+dz,B.GRAVEL); }
  for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++) ground(v.x+dx,v.z+dz, (dx===0&&dz===0)?B.WATER:B.STONEBRICK);
  stamp(v.x,plat+1,v.z,B.WATER);
  // COMPACT cluster: 4-5 buildings on distinct sides (no two on the same side → no overlap,
  // none collide with the south farm). Short paths only.
  const spots=[[-13,-7,0],[13,-7,1],[-13,8,2],[13,8,3],[0,-14,4]];
  const count=4+((hashRand(v.vcx,v.vcz,v.vseed)*2)|0);   // market + blacksmith + 2-3 houses
  // short L-paths from the plaza to each building (stop 2 short of the wall — never overshoot)
  const pathTo=(tx,tz)=>{ let x=v.x, z=v.z;
    const ex=tx-Math.sign(tx-v.x)*2, ez=tz-Math.sign(tz-v.z)*2;
    while(x!==ex){ x+=Math.sign(ex-x); ground(x,z,B.GRAVEL); }
    while(z!==ez){ z+=Math.sign(ez-z); ground(x,z,B.GRAVEL); }
  };
  for(let i=0;i<count && i<spots.length;i++){ pathTo(v.x+spots[i][0], v.z+spots[i][1]); }
  // four grounded lamp posts at the plaza corners (not strung along long paths)
  for(const [lx,lz] of [[3,3],[-3,3],[3,-3],[-3,-3]]) this._lampPost(v.x+lx, v.z+lz, plat, stamp, ground);
  // buildings
  for(let i=0;i<count && i<spots.length;i++){
    const s=spots[i], hx=v.x+s[0], hz=v.z+s[1], hseed=v.vseed+i*17;
    if(i===1)      this._market(hx,hz,plat,hseed,stamp,ground,v,pal);
    else if(i===2) this._blacksmith(hx,hz,plat,hseed,stamp,ground,v,pal);
    else           this._house(hx,hz,plat,hseed,stamp,ground,v,pal);
  }
  // dedicated fenced farm plot just south of the plaza (inside the cleared area)
  this._farmPlot(v.x-3, v.z+9, plat, v.vseed+501, stamp, ground);
  v._done=true;
};

// proper street lamp: grounded base + vertical post + a horizontal arm with the
// lantern HANGING beneath it (so it visibly hangs from a real support, no float)
World.prototype._lampPost=function(wx,wz,plat,stamp,ground){
  if(ground) ground(wx,wz,B.STONEBRICK);                          // foundation so the post never floats
  for(let y=1;y<=3;y++) stamp(wx,plat+y,wz,B.FENCE);              // vertical post
  stamp(wx+1,plat+3,wz,B.FENCE);                                  // horizontal support arm
  stamp(wx+1,plat+2,wz,B.LANTERN);                                // lantern hangs UNDER the arm (bracket up to the fence above)
  this.lights.add(this.bkey(wx+1,plat+2,wz));
};

World.prototype._house=function(hx,hz,plat,seed, stamp, ground, v, pal){
  pal=pal||this._villagePalette(v||{x:hx,z:hz});
  const w=5+((hashRand(hx,hz,seed)*2)|0), d=5+((hashRand(hx,hz,seed+1)*2)|0), wall=3;
  const wallMat = hashRand(hx,hz,seed+2)<0.5?pal.wall:pal.wall2;
  // foundation / floor
  for(let x=-1;x<=w;x++)for(let z=-1;z<=d;z++) ground(hx+x,hz+z, x<0||z<0||x>w||z>d?B.GRASS:pal.floor);
  // walls + windows
  for(let y=1;y<=wall;y++) for(let x=0;x<=w;x++) for(let z=0;z<=d;z++){
    const edge = (x===0||x===w||z===0||z===d);
    if(!edge){ stamp(hx+x,plat+y,hz+z,B.AIR); continue; }
    let id=wallMat;
    if(y===2 && ((x===((w/2)|0)&&(z===0||z===d)) || (z===((d/2)|0)&&(x===0||x===w)))){
      id=B.WINDOW;
      this.meta.set(this.bkey(hx+x,plat+y,hz+z), { rot: (x===0||x===w)?Math.PI/2:0 });
    }
    stamp(hx+x,plat+y,hz+z,id);
  }
  // door on +z wall middle
  const dxm=(w/2)|0;
  stamp(hx+dxm,plat+1,hz+d,B.AIR); stamp(hx+dxm,plat+2,hz+d,B.AIR);
  this.meta.set(this.bkey(hx+dxm,plat+1,hz+d),{rot:0});
  stamp(hx+dxm,plat+1,hz+d,B.DOOR);
  // grounded stairs + a 2-tile clear gravel walkway in front of the door so the
  // raised entrance is always reachable on foot and nothing blocks the doorway
  if(ground){ ground(hx+dxm,hz+d+1,B.GRASS); ground(hx+dxm,hz+d+2,B.GRAVEL); }  // landing + walkway (ground() also AIRs the column above → clear approach)
  stamp(hx+dxm,plat,hz+d+1,B.STAIRS); this.meta.set(this.bkey(hx+dxm,plat,hz+d+1),{rot:0});
  // pitched roof
  let inset=0;
  for(let y=0;y<=Math.max(w,d)/2;y++){ inset=y;
    for(let x=-1;x<=w+1;x++) for(let z=-1;z<=d+1;z++){
      if(x>=-1+inset && x<=w+1-inset && z>=-1+inset && z<=d+1-inset && (x===-1+inset||x===w+1-inset||z===-1+inset||z===d+1-inset))
        stamp(hx+x,plat+wall+y,hz+z,pal.roof);
    }
  }
  // interior furniture (linked bed halves like player-placed)
  stamp(hx+1,plat+1,hz+1,B.BED); this.meta.set(this.bkey(hx+1,plat+1,hz+1),{rot:0, foot:[hx+1,plat+1,hz+2]});
  stamp(hx+1,plat+1,hz+2,B.BED_FOOT); this.meta.set(this.bkey(hx+1,plat+1,hz+2),{rot:0, head:[hx+1,plat+1,hz+1]});
  if(v) v.beds.push([hx+1,plat+1,hz+1]);
  stamp(hx+w-1,plat+1,hz+1,B.CHEST);
  this._fillVillageChest(hx+w-1,plat+1,hz+1,seed);
  stamp(hx+w-1,plat+1,hz+d-1,B.BENCH);
  if(hashRand(hx,hz,seed+5)<0.5) stamp(hx+1,plat+1,hz+d-1,B.FURNACE);
  // interior light: a ceiling beam with the lantern hanging beneath it (no floating indoor lantern)
  stamp(hx+dxm,plat+wall,hz+1,B.LOG);                                          // beam against the roofline
  stamp(hx+dxm,plat+wall-1,hz+1,B.LANTERN); this.lights.add(this.bkey(hx+dxm,plat+wall-1,hz+1));
  if(v) v.settlers.push([hx+dxm,plat+1,hz+1]);
};

// open-air market stall: 4 fence-corner posts, a slab/plank counter, hay
// stock, a lit lantern roof, a chest of wares, and a trader settler
World.prototype._market=function(hx,hz,plat,seed, stamp, ground, v, pal){
  const w=4,d=4;
  for(let x=-1;x<=w;x++)for(let z=-1;z<=d;z++) ground(hx+x,hz+z, x<0||z<0||x>w||z>d?B.GRASS:pal.floor);
  // corner posts
  const corners=[[0,0],[w,0],[0,d],[w,d]];
  for(const cc of corners) for(let y=1;y<=3;y++) stamp(hx+cc[0],plat+y,hz+cc[1],B.FENCE);
  // canopy roof
  for(let x=0;x<=w;x++)for(let z=0;z<=d;z++) stamp(hx+x,plat+4,hz+z,pal.roof);
  // counter of slabs along the front
  for(let x=1;x<w;x++) stamp(hx+x,plat+1,hz+d-1,B.SLAB);
  // stock: hay bale + a wares chest behind the counter
  stamp(hx+1,plat+1,hz+1,B.HAY);
  stamp(hx+w-1,plat+1,hz+1,B.CHEST); this._fillVillageChest(hx+w-1,plat+1,hz+1,seed+3);
  // hanging lantern
  stamp(hx+((w/2)|0),plat+3,hz+((d/2)|0),B.LANTERN); this.lights.add(this.bkey(hx+((w/2)|0),plat+3,hz+((d/2)|0)));
  if(v){ v.settlers.push([hx+((w/2)|0),plat+1,hz+d-1]); }
};

// blacksmith: stonebrick shed with a double furnace forge, anvil-stand-in
// stonebrick block, a tool chest, and a smith settler (NO anvil block —
// it doesn't exist, so a raised stonebrick serves as the work surface)
World.prototype._blacksmith=function(hx,hz,plat,seed, stamp, ground, v, pal){
  const w=6,d=5,wall=3;
  for(let x=-1;x<=w;x++)for(let z=-1;z<=d;z++) ground(hx+x,hz+z, x<0||z<0||x>w||z>d?B.GRASS:pal.floor);
  for(let y=1;y<=wall;y++) for(let x=0;x<=w;x++) for(let z=0;z<=d;z++){
    const edge=(x===0||x===w||z===0||z===d);
    // leave the whole +z front open as the forge mouth (smithies are airy)
    if(!edge || (z===d && x>0 && x<w)){ stamp(hx+x,plat+y,hz+z,B.AIR); continue; }
    let id=B.STONEBRICK;
    if(y===2 && z===0 && x===((w/2)|0)){ id=B.WINDOW; this.meta.set(this.bkey(hx+x,plat+y,hz+z),{rot:0}); }
    stamp(hx+x,plat+y,hz+z,id);
  }
  // flat stonebrick roof
  for(let x=-1;x<=w;x++)for(let z=-1;z<=d;z++) stamp(hx+x,plat+wall+1,hz+z,pal.accent);
  // forge: two furnaces side by side
  stamp(hx+1,plat+1,hz+1,B.FURNACE);
  stamp(hx+2,plat+1,hz+1,B.FURNACE);
  // anvil stand-in + work bench
  stamp(hx+w-1,plat+1,hz+1,B.STONEBRICK);
  stamp(hx+w-2,plat+1,hz+1,B.BENCH);
  // tool chest
  stamp(hx+w-1,plat+1,hz+d-1,B.CHEST); this._fillVillageChest(hx+w-1,plat+1,hz+d-1,seed+7);
  // forge light
  stamp(hx+1,plat+wall-1,hz+2,B.LANTERN); this.lights.add(this.bkey(hx+1,plat+wall-1,hz+2));
  if(v){ v.settlers.push([hx+((w/2)|0),plat+1,hz+d-1]); }
};

// fenced farm plot: 7x7 of tilled dirt rows growing real crops, a water
// channel down the centre, fence perimeter with a gate gap + lit corners
World.prototype._farmPlot=function(hx,hz,plat,seed, stamp, ground){
  const w=7,d=7;
  for(let x=0;x<w;x++)for(let z=0;z<d;z++){
    const cx=(x===((w/2)|0)); // centre column = irrigation channel
    ground(hx+x,hz+z, cx?B.WATER:B.DIRT);
    if(cx) continue;
    // crop pick & growth stage are deterministic per-tile
    const r=hashRand(hx+x,hz+z,seed);
    let crop;
    if(r<0.5){ const st=(hashRand(hx+x,hz+z,seed+1)*4)|0; crop=[B.WHEAT0,B.WHEAT1,B.WHEAT2,B.WHEAT3][st]; }
    else if(r<0.78) crop=B.CARROT0;
    else if(r<0.95) crop=B.POTATO0;
    else crop=B.AIR;
    if(crop!==B.AIR) stamp(hx+x,plat+1,hz+z,crop);
  }
  // fence perimeter
  for(let x=-1;x<=w;x++){ stamp(hx+x,plat+1,hz-1,B.FENCE); stamp(hx+x,plat+1,hz+d,B.FENCE); }
  for(let z=-1;z<=d;z++){ stamp(hx-1,plat+1,hz+z,B.FENCE); stamp(hx+w,plat+1,hz+z,B.FENCE); }
  // gate gap on the north edge
  stamp(hx+((w/2)|0),plat+1,hz-1,B.AIR);
  // lit corner posts
  const cs=[[-1,-1],[w,-1],[-1,d],[w,d]];
  // grounded street-lamps at the corners (base + post + arm + hanging lantern) — no more floating fence-top lanterns
  for(const cc of cs) this._lampPost(hx+cc[0],hz+cc[1],plat,stamp,ground);
};

World.prototype._fillVillageChest=function(x,y,z,seed){
  const k=this.bkey(x,y,z); if(this.chests.has(k)) return;
  const slots=new Array(27).fill(null);
  const loot=[['iron_ingot',2],['bread',3],['lantern',2],['arrow',8],['copper_ingot',2],
              ['iron_pickaxe',1],['apple',3],['coal',4],['planks',6],['wheat',5],['carrot',4]];
  let n=2+((hashRand(x,z,seed)*4)|0);
  for(let i=0;i<n;i++){ const l=loot[(hashRand(x+i,z,seed+i)*loot.length)|0]; if(l&&ITEMS[l[0]]) slots[i]={item:l[0],count:l[1]||1}; }
  this.chests.set(k,slots);
};
