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
  if(b===BIOMES.desert)  return { style:'fort',wall:B.SANDSTONE,wall2:B.SMOOTH_SANDSTONE,roof:B.TERRACOTTA,floor:B.SANDSTONE,accent:B.CHISELED_SANDSTONE,beam:B.SMOOTH_SANDSTONE,canopy:B.WOOL_RED };
  if(b===BIOMES.snow||b===BIOMES.mountain) return { style:'keep',wall:B.DARK_PLANKS,wall2:B.STONEBRICK,roof:B.PACKED_ICE,floor:B.PLANKS,accent:B.SNOW,beam:B.LOG,canopy:B.WOOL_BLUE };
  if(b===BIOMES.savanna) return { style:'trade',wall:B.TERRACOTTA,wall2:B.STONEBRICK,roof:B.ROOFTILE,floor:B.PLANKS,accent:B.CHISELED_STONEBRICK,beam:B.LOG,canopy:B.WOOL_RED };
  return { style:'cottage',wall:B.PLANKS,wall2:B.STONEBRICK,roof:B.ROOFTILE,floor:B.PLANKS,accent:B.MOSSY_STONEBRICK,beam:B.LOG,canopy:B.WOOL_BLUE };
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
  // short L-paths from the plaza to each building's DOOR (buildings stamp after
  // paths, so any carve through a footprint is re-floored by the building)
  const doorSpot=(i)=>{ const s=spots[i], hx=v.x+s[0], hz=v.z+s[1], hseed=v.vseed+i*17;
    if(i===1) return [hx+2, hz+2];                                   // open-air market: any side works
    if(i===2) return [hx+3, hz+6];                                   // blacksmith: open +z front (w=6,d=5)
    const w=5+((hashRand(hx,hz,hseed)*2)|0), d=5+((hashRand(hx,hz,hseed+1)*2)|0);
    return [hx+((w/2)|0), hz+d+1];                                   // house door centred on the +z wall
  };
  const pathTo=(tx,tz)=>{ let x=v.x, z=v.z;
    while(x!==tx){ x+=Math.sign(tx-x); ground(x,z,B.GRAVEL); }
    while(z!==tz){ z+=Math.sign(tz-z); ground(x,z,B.GRAVEL); }
  };
  for(let i=0;i<count && i<spots.length;i++){ const t=doorSpot(i); pathTo(t[0],t[1]); }
  // four grounded lamp posts at the plaza corners (not strung along long paths)
  for(const [lx,lz] of [[3,3],[-3,3],[3,-3],[-3,-3]]) this._lampPost(v.x+lx, v.z+lz, plat, stamp, ground);
  this._villageArch(v.x,v.z-6,plat,stamp,ground,pal);
  this._villageClutter(v.x,v.z,plat,v.vseed,stamp,ground,pal);
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

World.prototype._villageArch=function(wx,wz,plat,stamp,ground,pal){
  for(let x=-2;x<=2;x++) ground(wx+x,wz,B.GRAVEL);
  for(const x of [-2,2]) for(let y=1;y<=4;y++) stamp(wx+x,plat+y,wz,pal.accent);
  for(let x=-2;x<=2;x++) stamp(wx+x,plat+4,wz,pal.beam);
  stamp(wx,plat+5,wz,pal.style==='keep'?B.SNOW:pal.accent);
  if(pal.style==='fort'){ stamp(wx-1,plat+3,wz,B.LANTERN); stamp(wx+1,plat+3,wz,B.LANTERN); this.lights.add(this.bkey(wx-1,plat+3,wz)); this.lights.add(this.bkey(wx+1,plat+3,wz)); }
};

World.prototype._villageClutter=function(wx,wz,plat,seed,stamp,ground,pal){
  const spots=[[-5,-4,B.BARREL],[5,4,B.BARREL],[-5,4,B.RUBBLE],[5,-4,B.RUBBLE],[-4,0,B.POTTED],[4,0,B.HAY]];
  for(let i=0;i<spots.length;i++){ const s=spots[i]; if(hashRand(wx+s[0],wz+s[1],seed+i)>0.82) continue; ground(wx+s[0],wz+s[1],i<2?B.PLANKS:B.GRASS); stamp(wx+s[0],plat+1,wz+s[1],s[2]); }
};

World.prototype._villageChimney=function(wx,wz,plat,height,stamp,pal){
  const mat=pal.style==='fort'?B.CHISELED_SANDSTONE:B.BRICK;
  for(let y=1;y<=height;y++) stamp(wx,plat+y,wz,mat);
  stamp(wx,plat+height+1,wz,B.CAMPFIRE); this.lights.add(this.bkey(wx,plat+height+1,wz));
};

World.prototype._house=function(hx,hz,plat,seed, stamp, ground, v, pal){
  pal=pal||this._villagePalette(v||{x:hx,z:hz});
  const w=5+((hashRand(hx,hz,seed)*2)|0), d=5+((hashRand(hx,hz,seed+1)*2)|0), wall=3, dxm=(w/2)|0;
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
  for(const [cx,cz] of [[0,0],[w,0],[0,d],[w,d]]) for(let y=1;y<=wall+1;y++) stamp(hx+cx,plat+y,hz+cz,pal.beam);
  for(const sx of [dxm-1,dxm+1]){ if(sx>0&&sx<w){ stamp(hx+sx,plat+2,hz,B.DARK_PLANKS); stamp(hx+sx,plat+2,hz+d,B.DARK_PLANKS); } }
  // door on +z wall middle
  stamp(hx+dxm,plat+1,hz+d,B.AIR); stamp(hx+dxm,plat+2,hz+d,B.AIR);
  this.meta.set(this.bkey(hx+dxm,plat+1,hz+d),{rot:0});
  stamp(hx+dxm,plat+1,hz+d,B.DOOR);
  // staircase down to NATURAL terrain (not just 1 block) — plat can sit several
  // blocks above the ground out past the footprint, and a single stair only
  // bridges 1, leaving the player stuck on a cliff at "the last step"
  const natH=this.heightAt(hx+dxm,hz+d+4);
  const drop=Math.max(0, Math.min(6, plat-natH));
  for(let i=0;i<=drop;i++){
    const sy=plat-i, sz=hz+d+1+i;
    for(let y=sy+1;y<sy+8;y++) stamp(hx+dxm,y,sz,B.AIR);                 // headroom
    stamp(hx+dxm,sy,sz, i<drop?B.STAIRS:B.GRAVEL);                       // tread (last = flat landing on the ground)
    if(i<drop) this.meta.set(this.bkey(hx+dxm,sy,sz),{rot:0});
    for(let y=sy-1;y>2;y--) stamp(hx+dxm,y,sz,B.DIRT);                   // solid foundation — never floating
  }
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
  this._villageChimney(hx+w-1,hz,plat,wall+3,stamp,pal);
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
  for(let x=0;x<=w;x++)for(let z=0;z<=d;z++) stamp(hx+x,plat+4,hz+z,(x+z)%2?pal.roof:pal.canopy);
  // counter of slabs along the front
  for(let x=1;x<w;x++) stamp(hx+x,plat+1,hz+d-1,B.SLAB);
  // stock: hay bale + a wares chest behind the counter
  stamp(hx+1,plat+1,hz+1,B.HAY);
  stamp(hx,plat+1,hz+d-1,B.BARREL);
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
  this._villageChimney(hx, hz, plat, wall+3, stamp, pal);
  // anvil stand-in + work bench
  stamp(hx+w-1,plat+1,hz+1,B.STONEBRICK);
  stamp(hx+w-2,plat+1,hz+1,B.BENCH);
  // tool chest
  stamp(hx+w-1,plat+1,hz+d-1,B.CHEST); this._fillVillageChest(hx+w-1,plat+1,hz+d-1,seed+7);
  stamp(hx+w,plat+1,hz+d,B.RUBBLE);
  // forge light — hangs directly under the flat roof so it visibly attaches
  stamp(hx+1,plat+wall,hz+2,B.LANTERN); this.lights.add(this.bkey(hx+1,plat+wall,hz+2));
  // stair run from the open +z front down to natural terrain (mirrors _house)
  const bxm=(w/2)|0, natH=this.heightAt(hx+bxm,hz+d+4);
  const drop=Math.max(0, Math.min(6, plat-natH));
  for(let i=0;i<=drop;i++){
    const sy=plat-i, sz=hz+d+1+i;
    for(let y=sy+1;y<sy+8;y++) stamp(hx+bxm,y,sz,B.AIR);
    stamp(hx+bxm,sy,sz, i<drop?B.STAIRS:B.GRAVEL);
    if(i<drop) this.meta.set(this.bkey(hx+bxm,sy,sz),{rot:0});
    for(let y=sy-1;y>2;y--) stamp(hx+bxm,y,sz,B.DIRT);
  }
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
  // fence perimeter — ground each ring cell first so fences never float or bury
  for(let x=-1;x<=w;x++){ ground(hx+x,hz-1,B.GRASS); stamp(hx+x,plat+1,hz-1,B.FENCE); ground(hx+x,hz+d,B.GRASS); stamp(hx+x,plat+1,hz+d,B.FENCE); }
  for(let z=-1;z<=d;z++){ ground(hx-1,hz+z,B.GRASS); stamp(hx-1,plat+1,hz+z,B.FENCE); ground(hx+w,hz+z,B.GRASS); stamp(hx+w,plat+1,hz+z,B.FENCE); }
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
