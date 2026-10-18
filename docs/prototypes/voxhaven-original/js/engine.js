/* =====================================================================
   Voxhaven — engine.js
   Rendering, texture atlas, chunk meshing, raycast, input, physics
   helpers, procedural models, audio, and save/load utilities.
   Depends on global THREE. Block/item DATA lives in game.js but is read
   here at call-time (after all scripts have loaded), never at parse-time.
   ===================================================================== */

// ---- world constants (shared globally with game.js / main.js) ----
const CHUNK_X = 16, CHUNK_Z = 16, WORLD_H = 128, SEA_LEVEL = 64;
const TILE = 16, ATLAS_COLS = 16, ATLAS_SIZE = TILE * ATLAS_COLS;

function crispTexture(tex){
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  return tex;
}

// fast index inside a chunk column store
function vIndex(x, y, z){ return (y * CHUNK_Z + z) * CHUNK_X + x; }
// floor-divide that behaves with negatives
function floorDiv(a, b){ return Math.floor(a / b); }
function mod(a, b){ return ((a % b) + b) % b; }
function clamp(v, a, b){ return v < a ? a : v > b ? b : v; }
function lerp(a, b, t){ return a + (b - a) * t; }

/* =====================================================================
   Deterministic seeded noise (value noise + fbm). Pure integer hashing
   so the same seed always reproduces the same world.
   ===================================================================== */
class Noise {
  constructor(seed){ this.seed = seed >>> 0; }
  // proper 32-bit integer finalizer (Math.imul + unsigned shifts) so the
  // output is uniform on [0,1). Signed shifts/float multiply biased it low.
  _h2(x, y){
    let h = Math.imul(x|0,374761393) ^ Math.imul(y|0,668265263) ^ Math.imul(this.seed,982451653);
    h = Math.imul(h ^ (h>>>13), 1274126177);
    h ^= h>>>16;
    return (h>>>0) / 4294967296;
  }
  _h3(x, y, z){
    let h = Math.imul(x|0,374761393) ^ Math.imul(y|0,668265263) ^ Math.imul(z|0,2246822519) ^ Math.imul(this.seed,982451653);
    h = Math.imul(h ^ (h>>>15), 1274126177);
    h ^= h>>>13;
    return (h>>>0) / 4294967296;
  }
  value2(x, y){
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf*xf*(3-2*xf), v = yf*yf*(3-2*yf);
    const a = this._h2(xi, yi),     b = this._h2(xi+1, yi);
    const c = this._h2(xi, yi+1),   d = this._h2(xi+1, yi+1);
    return lerp(lerp(a,b,u), lerp(c,d,u), v);
  }
  value3(x, y, z){
    const xi=Math.floor(x), yi=Math.floor(y), zi=Math.floor(z);
    const xf=x-xi, yf=y-yi, zf=z-zi;
    const u=xf*xf*(3-2*xf), v=yf*yf*(3-2*yf), w=zf*zf*(3-2*zf);
    const c000=this._h3(xi,yi,zi),     c100=this._h3(xi+1,yi,zi);
    const c010=this._h3(xi,yi+1,zi),   c110=this._h3(xi+1,yi+1,zi);
    const c001=this._h3(xi,yi,zi+1),   c101=this._h3(xi+1,yi,zi+1);
    const c011=this._h3(xi,yi+1,zi+1), c111=this._h3(xi+1,yi+1,zi+1);
    return lerp(
      lerp(lerp(c000,c100,u),lerp(c010,c110,u),v),
      lerp(lerp(c001,c101,u),lerp(c011,c111,u),v), w);
  }
  fbm2(x, y, oct=4, lac=2, gain=0.5){
    let amp=1, freq=1, sum=0, norm=0;
    for(let i=0;i<oct;i++){ sum += amp*this.value2(x*freq, y*freq); norm+=amp; amp*=gain; freq*=lac; }
    return sum / norm;
  }
  fbm3(x,y,z,oct=3){
    let amp=1, freq=1, sum=0, norm=0;
    for(let i=0;i<oct;i++){ sum += amp*this.value3(x*freq,y*freq,z*freq); norm+=amp; amp*=0.5; freq*=2; }
    return sum/norm;
  }
}
// small deterministic per-coord PRNG for object placement / textures
function hashRand(x, y, seed){
  let h = Math.imul(x|0,73856093) ^ Math.imul(y|0,19349663) ^ Math.imul(seed|0,83492791);
  h = Math.imul(h ^ (h>>>13), 1274126177);
  h ^= h>>>16;
  return (h>>>0) / 4294967296;
}

/* =====================================================================
   Color helpers + procedural texture painters. Each painter draws one
   16x16 tile. Plant/leaf tiles use transparency. Subtle per-pixel noise
   keeps surfaces from looking flat.
   ===================================================================== */
function shade(hex, amt){
  const n = parseInt(hex.slice(1),16);
  let r=(n>>16)&255, g=(n>>8)&255, b=n&255;
  r=clamp(r+amt,0,255); g=clamp(g+amt,0,255); b=clamp(b+amt,0,255);
  return `rgb(${r},${g},${b})`;
}
function noiseTile(ctx, base, vary, seed){
  for(let y=0;y<TILE;y++) for(let x=0;x<TILE;x++){
    const r = (hashRand(x,y,seed)-0.5)*2*vary;
    ctx.fillStyle = shade(base, r|0);
    ctx.fillRect(x,y,1,1);
  }
}
function speck(ctx, color, count, seed, size=1){
  for(let i=0;i<count;i++){
    const x=(hashRand(i,1,seed)*TILE)|0, y=(hashRand(i,2,seed)*TILE)|0;
    ctx.fillStyle=color; ctx.fillRect(x,y,size,size);
  }
}

// registry of tile painters: name -> fn(ctx)
const TILES = {
  grass_top:  c=>{ noiseTile(c,'#5f9e44',16,11); speck(c,shade('#6fb050',20),26,12); speck(c,shade('#4e8a38',-12),20,13); },
  grass_side: c=>{ noiseTile(c,'#7a5836',14,21); for(let x=0;x<TILE;x++){const h=3+((hashRand(x,0,22)*3)|0); c.fillStyle='#5f9e44'; c.fillRect(x,0,1,h); c.fillStyle=shade('#6fb050',10); if(hashRand(x,5,23)>0.6)c.fillRect(x,h-1,1,1);} },
  dirt:       c=>{ noiseTile(c,'#7a5836',16,31); speck(c,'#6a4a2c',22,32); speck(c,'#8a6a44',16,33); },
  stone:      c=>{ noiseTile(c,'#8a8d92',12,41); speck(c,'#6f7277',18,42); speck(c,'#a0a3a8',14,43); },
  cobble:     c=>{ noiseTile(c,'#80838a',16,601); speck(c,'#5a5d62',26,602,2); speck(c,'#9da0a6',18,603); c.strokeStyle='#54575c'; c.lineWidth=1; for(let i=0;i<6;i++){ const px=(hashRand(i,0,604)*TILE)|0, py=(hashRand(i,1,604)*TILE)|0, r=2+((hashRand(i,2,604)*2)|0); c.beginPath(); c.arc(px,py,r,0,7); c.stroke(); } },
  sand:       c=>{ noiseTile(c,'#dcc48c',10,51); speck(c,'#c9b074',16,52); },
  gravel:     c=>{ noiseTile(c,'#8c8780',16,61); speck(c,'#6b665f',24,62,2); speck(c,'#a8a39a',18,63); },
  clay:       c=>{ noiseTile(c,'#9aa0a8',10,71); speck(c,'#868d96',14,72); },
  snow:       c=>{ noiseTile(c,'#eef3f7',7,81); speck(c,'#dde6ee',14,82); },
  ice:        c=>{ noiseTile(c,'#a9d2e6',9,91); speck(c,'#c6e6f2',12,92); c.strokeStyle='rgba(255,255,255,.25)'; c.beginPath();c.moveTo(2,3);c.lineTo(9,11);c.stroke(); },
  log_side:   c=>{ noiseTile(c,'#6b4a2a',8,101); for(let x=2;x<TILE;x+=4){c.fillStyle='#553a20';c.fillRect(x,0,1,TILE);} speck(c,'#7d5a34',16,102); },
  log_top:    c=>{ noiseTile(c,'#9a774c',8,111); for(let r=6;r>0;r-=2){c.strokeStyle=shade('#7d5a34',-10);c.beginPath();c.arc(8,8,r,0,7);c.stroke();} c.fillStyle='#5a3f24';c.fillRect(7,7,2,2); },
  planks:     c=>{ noiseTile(c,'#b58a52',9,121); for(let y=0;y<TILE;y+=4){c.fillStyle='#8a6638';c.fillRect(0,y,TILE,1);} for(let i=0;i<4;i++){c.fillStyle='#8a6638';c.fillRect((hashRand(i,0,122)*TILE)|0,(i*4),1,4);} },
  leaves:     c=>{ c.clearRect(0,0,TILE,TILE); for(let y=0;y<TILE;y++)for(let x=0;x<TILE;x++){ if(hashRand(x,y,131)>0.18){ const r=(hashRand(x,y,132)-0.5)*30; c.fillStyle=shade('#3f8a3a',r|0); c.fillRect(x,y,1,1);} } },
  cactus:     c=>{ noiseTile(c,'#4f7a3a',10,141); for(let y=1;y<TILE;y+=3){c.fillStyle='#3d6030';c.fillRect(1,y,1,1);c.fillRect(14,y,1,1);} c.fillStyle='#2f4d26';c.fillRect(0,0,1,TILE);c.fillRect(15,0,1,TILE); },
  coal:       c=>{ TILES.stone(c); speck(c,'#1c1c1f',16,151,2); speck(c,'#2c2c30',12,152); },
  copper:     c=>{ TILES.stone(c); speck(c,'#c87f4a',14,161,2); speck(c,'#e0a06a',10,162); },
  iron:       c=>{ TILES.stone(c); speck(c,'#d9b48a',14,171,2); speck(c,'#b89060',10,172); },
  gold:       c=>{ TILES.stone(c); speck(c,'#f4d35e',14,181,2); speck(c,'#d9b441',10,182); },
  crystal:    c=>{ TILES.stone(c); speck(c,'#7ad6e6',12,191,2); speck(c,'#b8f0fa',10,192,2); },
  deepstone:  c=>{ noiseTile(c,'#4a4d54',12,201); speck(c,'#36383e',18,202); },
  darkstone:  c=>{ noiseTile(c,'#26242e',10,211); speck(c,'#3a3648',12,212); speck(c,'#151320',10,213); },
  glass:      c=>{ c.clearRect(0,0,TILE,TILE); c.strokeStyle='rgba(200,230,240,.85)';c.strokeRect(0.5,0.5,15,15); c.fillStyle='rgba(200,230,240,.12)';c.fillRect(1,1,14,14); c.strokeStyle='rgba(255,255,255,.4)';c.beginPath();c.moveTo(3,12);c.lineTo(11,4);c.stroke(); },
  water:      c=>{ for(let y=0;y<TILE;y++)for(let x=0;x<TILE;x++){const r=(hashRand(x,y,221)-0.5)*16;c.fillStyle=shade('#2f6fd6',r|0);c.fillRect(x,y,1,1);} c.fillStyle='rgba(255,255,255,.10)';c.fillRect(0,3,TILE,1);c.fillRect(0,9,TILE,1); },
  brick:      c=>{ noiseTile(c,'#a44a3a',7,231); c.fillStyle='#c9bba0'; for(let y=0;y<TILE;y+=4)c.fillRect(0,y,TILE,1); for(let y=0;y<TILE;y+=4){const off=(y/4)%2?4:0; for(let x=off;x<TILE;x+=8)c.fillRect(x,y,1,4);} },
  stonebrick: c=>{ noiseTile(c,'#7d8086',9,241); c.fillStyle='#5b5e64'; for(let y=0;y<TILE;y+=8)c.fillRect(0,y,TILE,1); for(let y=0;y<TILE;y+=8){const off=(y/8)%2?8:0; for(let x=off;x<TILE;x+=16)c.fillRect(x,y,1,8);} c.strokeRect(0.5,0.5,15,15); },
  rooftile:   c=>{ noiseTile(c,'#8a3a2c',8,251); c.fillStyle='#6a2a20'; for(let y=0;y<TILE;y+=5)c.fillRect(0,y,TILE,1); for(let y=0;y<TILE;y+=5)for(let x=2;x<TILE;x+=6){c.fillStyle='#a44a3a';c.fillRect(x,y+1,3,3);} },
  bookshelf:  c=>{ TILES.planks(c); c.fillStyle='#3a2a18';c.fillRect(0,1,TILE,6);c.fillRect(0,9,TILE,6); const cols=['#9e3b3b','#3b6e9e','#3b9e5a','#9e8a3b','#7a3b9e']; for(let i=0;i<6;i++){c.fillStyle=cols[(hashRand(i,1,261)*5)|0];c.fillRect(1+i*2,2,1,4);c.fillStyle=cols[(hashRand(i,2,261)*5)|0];c.fillRect(1+i*2,10,1,4);} },
  hay:        c=>{ noiseTile(c,'#cBA64a',8,271); for(let y=0;y<TILE;y+=2){c.fillStyle='#a9882f';c.fillRect(0,y,TILE,1);} c.fillStyle='#8a6a20';c.fillRect(0,0,1,TILE);c.fillRect(15,0,1,TILE); },
  path:       c=>{ noiseTile(c,'#7c6a4e',10,281); speck(c,'#6a5840',18,282); speck(c,'#8c7a5c',12,283); },
  carpet:     c=>{ noiseTile(c,'#9e3b5a',8,291); c.strokeStyle='#c25a78';c.strokeRect(1.5,1.5,13,13); },
  bench_top:  c=>{ TILES.planks(c); c.fillStyle='#5a3f24';c.strokeStyle='#5a3f24';c.strokeRect(1.5,1.5,13,13); c.fillRect(7,1,1,14);c.fillRect(1,7,14,1); c.fillStyle='#caa45a';c.fillRect(3,3,3,3);c.fillStyle='#888';c.fillRect(10,10,3,1); },
  bench_side: c=>{ TILES.planks(c); c.fillStyle='#5a3f24';c.fillRect(2,2,5,1);c.fillRect(9,5,5,1);c.fillRect(4,9,7,1); },
  furnace_f:  c=>{ TILES.stonebrick(c); c.fillStyle='#1a1a1d';c.fillRect(4,7,8,7); c.fillStyle='#e07a2a';c.fillRect(5,11,6,3); c.fillStyle='#f4d35e';c.fillRect(6,12,4,2); c.fillStyle='#5b5e64';c.fillRect(4,5,8,1); },
  cloth_red:  c=>{ noiseTile(c,'#c2473f',7,301); },
  cloth_white:c=>{ noiseTile(c,'#e8e2d4',5,311); },
  tallgrass:  c=>{ c.clearRect(0,0,TILE,TILE); for(let x=2;x<TILE;x+=2){const h=6+((hashRand(x,0,321)*7)|0); for(let y=0;y<h;y++){c.fillStyle=shade('#5aa048',((hashRand(x,y,322)-0.5)*24)|0);c.fillRect(x+((y>h-3)?(hashRand(x,y,323)>0.5?1:-1):0),TILE-1-y,1,1);} } },
  flower_red: c=>{ c.clearRect(0,0,TILE,TILE); c.fillStyle='#3d7a32';c.fillRect(7,8,1,7); c.fillStyle='#2f6028';c.fillRect(5,11,2,1);c.fillRect(9,9,2,1); c.fillStyle='#d94b4b';c.fillRect(6,3,4,4);c.fillRect(5,4,1,2);c.fillRect(10,4,1,2); c.fillStyle='#f4d35e';c.fillRect(7,4,2,2); },
  flower_blue:c=>{ c.clearRect(0,0,TILE,TILE); c.fillStyle='#3d7a32';c.fillRect(7,8,1,7); c.fillStyle='#4b78d9';c.fillRect(6,3,4,4);c.fillRect(5,4,1,2);c.fillRect(10,4,1,2); c.fillStyle='#cfe0ff';c.fillRect(7,4,2,2); },
  mushroom:   c=>{ c.clearRect(0,0,TILE,TILE); c.fillStyle='#e8e2d4';c.fillRect(7,8,2,6); c.fillStyle='#b23b2e';c.fillRect(4,4,8,4);c.fillRect(5,3,6,1); c.fillStyle='#e8d8c8';c.fillRect(6,5,1,1);c.fillRect(9,6,1,1); },
  potato0: c=>{ c.clearRect(0,0,TILE,TILE); c.fillStyle='#3a6a2a';c.fillRect(7,11,2,5); c.fillStyle='#c88a3a';c.fillRect(5,14,6,2); },
  potato1: c=>{ c.clearRect(0,0,TILE,TILE); c.fillStyle='#3a6a2a';c.fillRect(7,9,2,7); c.fillStyle='#c88a3a';c.fillRect(4,13,2,2);c.fillRect(10,13,2,2);c.fillRect(5,15,6,2); },
  potato2: c=>{ c.clearRect(0,0,TILE,TILE); c.fillStyle='#3a6a2a';c.fillRect(6,7,4,9); c.fillStyle='#c88a3a';c.fillRect(3,12,3,3);c.fillRect(10,12,3,3);c.fillRect(5,15,6,2); },
  potato3: c=>{ c.clearRect(0,0,TILE,TILE); c.fillStyle='#3a6a2a';c.fillRect(5,5,6,11); c.fillStyle='#c88a3a';c.fillRect(2,11,4,4);c.fillRect(10,11,4,4);c.fillRect(5,15,6,2);c.fillStyle='#4a8a3a';c.fillRect(4,6,2,3);c.fillRect(10,6,2,3); },
  carrot0: c=>{ c.clearRect(0,0,TILE,TILE); c.fillStyle='#3a6a2a';c.fillRect(7,11,2,5); c.fillStyle='#e07030';c.fillRect(5,14,6,2); },
  carrot1: c=>{ c.clearRect(0,0,TILE,TILE); c.fillStyle='#3a6a2a';c.fillRect(7,9,2,7); c.fillStyle='#e07030';c.fillRect(4,13,2,2);c.fillRect(10,13,2,2);c.fillRect(5,15,6,2); },
  carrot2: c=>{ c.clearRect(0,0,TILE,TILE); c.fillStyle='#3a6a2a';c.fillRect(6,7,4,9); c.fillStyle='#e07030';c.fillRect(3,12,3,3);c.fillRect(10,12,3,3);c.fillRect(5,15,6,2); },
  carrot3: c=>{ c.clearRect(0,0,TILE,TILE); c.fillStyle='#3a6a2a';c.fillRect(5,5,6,11); c.fillStyle='#e07030';c.fillRect(2,11,4,4);c.fillRect(10,11,4,4);c.fillRect(5,15,6,2);c.fillStyle='#4a8a3a';c.fillRect(4,6,2,3);c.fillRect(10,6,2,3); },
  wheat0: c=>{ c.clearRect(0,0,TILE,TILE); c.fillStyle='#3a6a2a';c.fillRect(7,11,2,5); c.fillStyle='#d9b84a';c.fillRect(5,14,6,2); },
  wheat1: c=>{ c.clearRect(0,0,TILE,TILE); c.fillStyle='#3a6a2a';c.fillRect(7,9,2,7); c.fillStyle='#d9b84a';c.fillRect(4,13,2,2);c.fillRect(10,13,2,2);c.fillRect(5,15,6,2); },
  wheat2: c=>{ c.clearRect(0,0,TILE,TILE); c.fillStyle='#3a6a2a';c.fillRect(6,7,4,9); c.fillStyle='#d9b84a';c.fillRect(3,12,3,3);c.fillRect(10,12,3,3);c.fillRect(5,15,6,2); },
  wheat3: c=>{ c.clearRect(0,0,TILE,TILE); c.fillStyle='#3a6a2a';c.fillRect(5,5,6,11); c.fillStyle='#d9b84a';c.fillRect(2,11,4,4);c.fillRect(10,11,4,4);c.fillRect(5,15,6,2);c.fillStyle='#4a8a3a';c.fillRect(4,6,2,3);c.fillRect(10,6,2,3); },
  tomato0: c=>{ c.clearRect(0,0,TILE,TILE); c.fillStyle='#3a6a2a';c.fillRect(7,11,2,5); c.fillStyle='#c03030';c.fillRect(5,14,6,2); },
  tomato1: c=>{ c.clearRect(0,0,TILE,TILE); c.fillStyle='#3a6a2a';c.fillRect(7,9,2,7); c.fillStyle='#c03030';c.fillRect(4,13,2,2);c.fillRect(10,13,2,2);c.fillRect(5,15,6,2); },
  tomato2: c=>{ c.clearRect(0,0,TILE,TILE); c.fillStyle='#3a6a2a';c.fillRect(6,7,4,9); c.fillStyle='#c03030';c.fillRect(3,12,3,3);c.fillRect(10,12,3,3);c.fillRect(5,15,6,2); },
  tomato3: c=>{ c.clearRect(0,0,TILE,TILE); c.fillStyle='#3a6a2a';c.fillRect(5,5,6,11); c.fillStyle='#c03030';c.fillRect(2,11,4,4);c.fillRect(10,11,4,4);c.fillRect(5,15,6,2);c.fillStyle='#4a8a3a';c.fillRect(4,6,2,3);c.fillRect(10,6,2,3); },
  pumpkin:  c=>{ noiseTile(c,'#e07030',10,381); c.fillStyle='#3a6a2a';c.fillRect(1,6,14,4); c.fillRect(6,1,4,14); },
  melon:    c=>{ noiseTile(c,'#5a8a3a',8,391); c.fillStyle='#c9b04a';c.fillRect(3,3,10,10); for(let i=0;i<4;i++)c.fillRect(4+(i%2)*4,4+((i/2)|0)*4,2,2); },
  netherrack: c=>{ noiseTile(c,'#5a2a2a',12,401); speck(c,'#3a1a1a',20,402); speck(c,'#8a4a3a',10,403); },
  glowstone: c=>{ noiseTile(c,'#f4d35e',8,411); speck(c,'#fff',30,412,2); },
  mycelium: c=>{ noiseTile(c,'#5a4a3a',10,421); c.fillStyle='#3a8a3a'; for(let i=0;i<20;i++){const x=(hashRand(i,0,422)*TILE)|0,y=(hashRand(i,1,422)*5)|0; c.fillRect(x,y,1,1);} },
  soulsand: c=>{ noiseTile(c,'#4a3a2a',8,431); c.fillStyle='#2a1a1a';c.fillRect(0,7,TILE,1);c.fillRect(0,11,TILE,1); },
  sugarcane: c=>{ c.clearRect(0,0,TILE,TILE); c.fillStyle='#5a8a3a';c.fillRect(7,2,2,14); c.fillStyle='#f4d35e'; for(let i=0;i<4;i++) c.fillRect(6,4+i*3,4,1); },
  quartz:    c=>{ noiseTile(c,'#e8e8e0',5,441); c.strokeStyle='#d0d0c8';c.strokeRect(0.5,0.5,15,15); },
  netherbrick: c=>{ noiseTile(c,'#3a2a2a',8,451); c.fillStyle='#2a1a1a'; for(let y=0;y<TILE;y+=4) c.fillRect(0,y,TILE,1); },
  cake:      c=>{ const c2 = c; c2.fillStyle='#e8c8a0'; c2.fillRect(2,4,12,10); c2.fillStyle='#f4d35e'; c2.fillRect(4,2,8,2); c2.fillStyle='#c88a5a'; c2.fillRect(5,6,2,2); c2.fillRect(9,6,2,2); },
  beetroot:  c=>{ c.clearRect(0,0,TILE,TILE); c.fillStyle='#3a6a2a';c.fillRect(7,8,2,8); c.fillStyle='#8a2a2a';c.fillRect(5,4,6,4); c.fillRect(6,3,4,1); },
  wool:       c=>{ noiseTile(c,'#e8e2d4',6,331); speck(c,'#d6cfbe',20,332); },
  copper_block: c=>{ noiseTile(c,'#c87f4a',9,341); c.strokeStyle='#a8643a'; c.strokeRect(0.5,0.5,15,15); c.fillRect(4,4,8,8); },
  iron_block:   c=>{ noiseTile(c,'#d9d9dc',8,351); c.strokeStyle='#a8a8ac'; c.strokeRect(0.5,0.5,15,15); c.fillRect(4,4,8,8); },
  gold_block:   c=>{ noiseTile(c,'#f4d35e',8,361); c.strokeStyle='#caa53a'; c.strokeRect(0.5,0.5,15,15); c.fillRect(4,4,8,8); },
  crystal_block:c=>{ noiseTile(c,'#7ad6e6',8,371); c.strokeStyle='#4fa8b8'; c.strokeRect(0.5,0.5,15,15); c.fillRect(4,4,8,8); },
  mossstone:  c=>{ TILES.stone(c); speck(c,'#4f8a3a',24,381,1); speck(c,'#3f7a2e',16,382,2); },
  basalt:     c=>{ noiseTile(c,'#3a3c40',10,391); speck(c,'#26282b',18,392); for(let x=0;x<TILE;x+=4){c.fillStyle='#2a2c2f';c.fillRect(x,0,1,TILE);} },
  obsidian:   c=>{ noiseTile(c,'#1a1430',8,401); speck(c,'#3a2e5a',14,402); speck(c,'#0d0a18',16,403); },
  smoothstone:c=>{ noiseTile(c,'#9a9da2',6,411); c.strokeStyle='#86888d'; c.strokeRect(0.5,0.5,15,15); },
  cloth_blue: c=>{ noiseTile(c,'#3a5fa0',7,421); },
  granite:    c=>{ noiseTile(c,'#9a6e6a',13,431); speck(c,'#6e4a44',16,432); speck(c,'#c08a82',12,433); },
  andesite:   c=>{ noiseTile(c,'#82858a',11,441); speck(c,'#666a70',16,442); },
  diorite:    c=>{ noiseTile(c,'#cfd0d4',9,451); speck(c,'#3a3c40',14,452); },
  polished_granite:  c=>{ TILES.granite(c); c.strokeStyle='rgba(0,0,0,.3)';c.strokeRect(0.5,0.5,15,15); c.fillStyle='rgba(255,255,255,.08)';c.fillRect(7,1,1,14);c.fillRect(1,7,14,1); },
  polished_andesite: c=>{ TILES.andesite(c); c.strokeStyle='rgba(0,0,0,.3)';c.strokeRect(0.5,0.5,15,15); c.fillStyle='rgba(255,255,255,.08)';c.fillRect(7,1,1,14);c.fillRect(1,7,14,1); },
  polished_diorite:  c=>{ TILES.diorite(c); c.strokeStyle='rgba(0,0,0,.3)';c.strokeRect(0.5,0.5,15,15); c.fillStyle='rgba(255,255,255,.08)';c.fillRect(7,1,1,14);c.fillRect(1,7,14,1); },
  sandstone:  c=>{ noiseTile(c,'#dcc98c',8,461); for(let y=0;y<TILE;y+=4){c.fillStyle='#c9b074';c.fillRect(0,y,TILE,1);} },
  smooth_sandstone: c=>{ noiseTile(c,'#e0cf9a',5,471); c.strokeStyle='#c9b074'; c.strokeRect(0.5,0.5,15,15); },
  chiseled_sandstone: c=>{ TILES.sandstone(c); c.strokeStyle='#a8905a'; c.strokeRect(3.5,3.5,8,8); c.beginPath();c.moveTo(3.5,8);c.lineTo(11.5,8);c.stroke(); },
  cut_copper: c=>{ TILES.copper_block(c); c.strokeStyle='rgba(0,0,0,.3)'; for(let i=0;i<=TILE;i+=8){c.beginPath();c.moveTo(i,0);c.lineTo(i,TILE);c.stroke();c.beginPath();c.moveTo(0,i);c.lineTo(TILE,i);c.stroke();} },
  cut_iron:   c=>{ TILES.iron_block(c); c.strokeStyle='rgba(0,0,0,.25)'; for(let i=0;i<=TILE;i+=8){c.beginPath();c.moveTo(i,0);c.lineTo(i,TILE);c.stroke();c.beginPath();c.moveTo(0,i);c.lineTo(TILE,i);c.stroke();} },
  cut_gold:   c=>{ TILES.gold_block(c); c.strokeStyle='rgba(0,0,0,.25)'; for(let i=0;i<=TILE;i+=8){c.beginPath();c.moveTo(i,0);c.lineTo(i,TILE);c.stroke();c.beginPath();c.moveTo(0,i);c.lineTo(TILE,i);c.stroke();} },
  coal_block: c=>{ noiseTile(c,'#1c1c1f',8,481); speck(c,'#0a0a0c',20,482,2); },
  terracotta: c=>{ noiseTile(c,'#9a5a3c',9,491); for(let y=0;y<TILE;y+=5){c.fillStyle='#7d442c';c.fillRect(0,y,TILE,1);} },
  packed_ice: c=>{ noiseTile(c,'#bcdcec',6,501); speck(c,'#d8edf6',12,502); c.strokeStyle='rgba(255,255,255,.3)';c.strokeRect(0.5,0.5,15,15); },
  frosted_glass: c=>{ c.clearRect(0,0,TILE,TILE); c.fillStyle='rgba(220,238,245,.55)';c.fillRect(0,0,TILE,TILE); c.strokeStyle='rgba(255,255,255,.5)';c.strokeRect(0.5,0.5,15,15); },
  polished_basalt: c=>{ TILES.basalt(c); c.strokeStyle='rgba(255,255,255,.08)'; for(let x=2;x<TILE;x+=4){c.beginPath();c.moveTo(x,0);c.lineTo(x,TILE);c.stroke();} },
  dark_planks: c=>{ noiseTile(c,'#5a4226',9,511); for(let y=0;y<TILE;y+=4){c.fillStyle='#3a2a16';c.fillRect(0,y,TILE,1);} },
  chiseled_stonebrick: c=>{ TILES.stonebrick(c); c.strokeStyle='#3f4146'; c.strokeRect(3.5,3.5,8,8); c.beginPath();c.moveTo(7.5,3.5);c.lineTo(7.5,11.5);c.stroke(); },
  mossy_stonebrick: c=>{ TILES.stonebrick(c); speck(c,'#4f8a3a',18,521,1); speck(c,'#3f7a2e',12,522,2); },
  cracked_stonebrick: c=>{ TILES.stonebrick(c); c.strokeStyle='#2a2c30'; c.beginPath();c.moveTo(2,2);c.lineTo(7,9);c.lineTo(5,14);c.stroke(); },
  polished_deepstone: c=>{ TILES.deepstone(c); c.strokeStyle='rgba(0,0,0,.3)';c.strokeRect(0.5,0.5,15,15); c.fillStyle='rgba(255,255,255,.06)';c.fillRect(7,1,1,14); },
  polished_darkstone: c=>{ TILES.darkstone(c); c.strokeStyle='rgba(0,0,0,.4)';c.strokeRect(0.5,0.5,15,15); c.fillStyle='rgba(120,100,180,.12)';c.fillRect(7,1,1,14); },
  mars_soil:    c=>{ noiseTile(c,'#b36a40',16,601); speck(c,'#8a5230',12,602); speck(c,'#c98a60',10,603); },
  regolith:     c=>{ noiseTile(c,'#8a7a6a',12,611); speck(c,'#6a5a4a',18,612); speck(c,'#a08a70',8,613); },
  permafrost:   c=>{ noiseTile(c,'#c8d4e0',8,621); speck(c,'#a0b0c0',14,622); speck(c,'#e8f0f8',6,623); },
  launchpad:    c=>{ noiseTile(c,'#55555a',6,631); c.fillStyle='#f4d860';c.fillRect(2,2,12,3);c.fillRect(2,11,12,3); c.fillStyle='#333';c.fillRect(5,5,6,6); },
  starship:     c=>{ noiseTile(c,'#a8aab5',4,641); c.fillStyle='#555';c.fillRect(4,2,8,12); c.fillStyle='#ddd';c.fillRect(5,3,2,2);c.fillRect(9,3,2,2);c.fillRect(5,11,6,2); },
  solar_panel:  c=>{ noiseTile(c,'#1e2a38',3,651); c.strokeStyle='#4fd';c.lineWidth=1; c.beginPath(); for(let i=3;i<13;i+=3){c.moveTo(2,i);c.lineTo(14,i);} c.stroke(); c.strokeStyle='#fff8';c.strokeRect(1,1,14,14); },
  battery:      c=>{ noiseTile(c,'#25252a',4,661); c.fillStyle='#3a3';c.fillRect(3,2,10,4);c.fillRect(3,10,10,4); c.fillStyle='#9e9';c.fillRect(5,6,6,4); },
  alien_grass_top:  c=>{ noiseTile(c,'#2f8f86',14,701); speck(c,'#46b3a4',24,702); speck(c,'#1f6a64',18,703); speck(c,'#9a6ad6',6,704); },
  alien_grass_side: c=>{ noiseTile(c,'#8a4a36',14,711); for(let x=0;x<TILE;x++){const h=3+((hashRand(x,0,712)*3)|0); c.fillStyle='#2f8f86'; c.fillRect(x,0,1,h); if(hashRand(x,5,713)>0.7){c.fillStyle='#46b3a4';c.fillRect(x,h-1,1,1);}} },
  alien_rock:   c=>{ noiseTile(c,'#7a4434',14,721); speck(c,'#5a3024',20,722,2); speck(c,'#9a5a44',14,723); speck(c,'#3a8f86',5,724); },
  alien_crystal:c=>{ noiseTile(c,'#6a4030',12,731); speck(c,'#4a2a1e',16,732,2); for(let i=0;i<5;i++){const px=(hashRand(i,0,733)*12)|0,py=(hashRand(i,1,733)*12)|0; c.fillStyle='#9a5ee6';c.fillRect(px+1,py+1,3,4); c.fillStyle='#d8aaff';c.fillRect(px+2,py+2,1,2);} },
  rocket_hull:  c=>{ noiseTile(c,'#b8bcc4',5,741); for(let y=0;y<TILE;y+=4){c.fillStyle='#9a9ea6';c.fillRect(0,y,TILE,1);} for(const px of [2,13]) for(let py=2;py<TILE;py+=4){c.fillStyle='#70747c';c.fillRect(px,py,1,1); c.fillStyle='#dfe2e8';c.fillRect(px,py-1,1,1);} },
  rocket_hull_top: c=>{ noiseTile(c,'#c4c8d0',4,751); c.strokeStyle='#888c94';c.beginPath();c.arc(8,8,5,0,7);c.arc(8,8,2,0,7);c.stroke(); speck(c,'#dfe2e8',10,752); },
  rocket_nose:  c=>{ noiseTile(c,'#c8ccd4',4,761); for(let y=0;y<TILE;y++){const w=(y/TILE*7)|0; c.fillStyle='#9a9ea6';c.fillRect(w,y,1,1);c.fillRect(15-w,y,1,1);} c.fillStyle='#c8503a';c.fillRect(6,1,4,3); },
  rocket_fin:   c=>{ noiseTile(c,'#9a9ea6',5,771); c.fillStyle='#c8503a';c.beginPath();c.moveTo(0,0);c.lineTo(15,15);c.lineTo(0,15);c.closePath();c.fill(); c.fillStyle='#dfe2e8';c.fillRect(1,12,3,3); },
  science_top:  c=>{ noiseTile(c,'#d8dce2',4,781); c.strokeStyle='#9aa0a8';c.strokeRect(1.5,1.5,13,13); c.fillStyle='#1e3a44';c.fillRect(3,3,10,7); c.fillStyle='#4fe0ff';c.fillRect(4,4,8,2); c.fillStyle='#9a7ad6';c.fillRect(10,11,3,3); },
  science_side: c=>{ noiseTile(c,'#c4c8d0',4,791); c.fillStyle='#9aa0a8';c.fillRect(0,11,TILE,1); c.fillStyle='#1e3a44';c.fillRect(2,2,12,7); c.fillStyle='#4fe0ff';c.fillRect(3,3,10,2); for(const x of [3,7,11]){c.fillStyle='#5a7a6a';c.fillRect(x,12,2,2);} },
  fuel_tank:    c=>{ noiseTile(c,'#9aa0a8',5,801); c.fillStyle='#70747c';c.fillRect(0,0,1,TILE);c.fillRect(15,0,1,TILE); c.fillStyle='#1e3a44';c.fillRect(4,3,8,10); c.fillStyle='#2fd6c8';c.fillRect(5,4,6,8); c.fillStyle='#7af0e6';c.fillRect(5,5,6,2); },
  hab_panel:    c=>{ noiseTile(c,'#dfe3e8',4,811); c.strokeStyle='#b4bac2';c.lineWidth=1; c.strokeRect(0.5,0.5,15,15); c.fillStyle='#c4cad2';c.fillRect(0,7,TILE,1);c.fillRect(7,0,1,TILE); speck(c,'#f0f3f6',8,812); },
  hab_floor:    c=>{ noiseTile(c,'#c8ccd2',5,821); c.fillStyle='#a4aab2'; for(let y=0;y<TILE;y+=8)c.fillRect(0,y,TILE,1); for(let x=0;x<TILE;x+=8)c.fillRect(x,0,1,TILE); c.fillStyle='#dfe3e8';c.fillRect(1,1,6,6);c.fillRect(9,9,6,6); },
  glass_dome:   c=>{ c.fillStyle='rgba(150,210,230,0.22)';c.fillRect(0,0,TILE,TILE); c.strokeStyle='rgba(220,245,255,0.5)';c.strokeRect(0.5,0.5,15,15); c.strokeStyle='rgba(255,255,255,.3)';c.beginPath();c.moveTo(2,3);c.lineTo(8,9);c.stroke(); },
  alien_plant:  c=>{ c.clearRect(0,0,TILE,TILE); c.strokeStyle='#9a5ee6';c.lineWidth=2; for(let i=0;i<3;i++){const bx=4+i*4; c.beginPath();c.moveTo(bx,15);c.lineTo(bx-1,5+i);c.stroke();} c.fillStyle='#2fd6c8'; for(const p of [[3,4],[7,3],[11,5]]) c.fillRect(p[0],p[1],3,3); c.fillStyle='#d8aaff';c.fillRect(7,2,2,2); },
  star_beacon:  c=>{ noiseTile(c,'#1a1c24',6,831); speck(c,'#2a2e3a',12,832); c.fillStyle='#0e6a8a';c.fillRect(5,5,6,6); c.fillStyle='#4fe0ff';c.fillRect(6,6,4,4); c.fillStyle='#d8fbff';c.fillRect(7,7,2,2); },
  alien_log_top:c=>{ noiseTile(c,'#7a5a6a',8,841); for(let r=6;r>0;r-=2){c.strokeStyle='#5a3a4a';c.beginPath();c.arc(8,8,r,0,7);c.stroke();} c.fillStyle='#9a5ee6';c.fillRect(7,7,2,2); },
  alien_log_side: c=>{ noiseTile(c,'#5a3a4a',8,851); for(let x=2;x<TILE;x+=4){c.fillStyle='#42283a';c.fillRect(x,0,1,TILE);} speck(c,'#7a5a6a',14,852); speck(c,'#9a5ee6',4,853); },
  alien_leaves: c=>{ c.clearRect(0,0,TILE,TILE); noiseTile(c,'#2f8f86',14,861); for(let i=0;i<30;i++){const px=(hashRand(i,0,862)*TILE)|0,py=(hashRand(i,1,862)*TILE)|0; if(hashRand(i,2,862)>0.3){c.fillStyle=hashRand(i,3,862)>0.85?'#9a5ee6':'#46b3a4';c.fillRect(px,py,1,1);}else c.clearRect(px,py,1,1);} },
};

let TILE_UV = {};   // tileName -> {u0,v0,u1,v1}
let ATLAS_TEX = null;

// Build the texture atlas once. Returns the THREE texture.
function buildAtlas(){
  const cvs = document.createElement('canvas');
  cvs.width = cvs.height = ATLAS_SIZE;
  const ctx = cvs.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const names = Object.keys(TILES);
  const inset = 0.5 / ATLAS_SIZE; // anti-bleed
  names.forEach((name, i) => {
    const col = i % ATLAS_COLS, row = (i / ATLAS_COLS) | 0;
    const tcv = document.createElement('canvas'); tcv.width=tcv.height=TILE;
    const tctx = tcv.getContext('2d'); tctx.imageSmoothingEnabled=false;
    TILES[name](tctx);
    ctx.drawImage(tcv, col*TILE, row*TILE);
    const u0 = (col*TILE)/ATLAS_SIZE, v0 = (row*TILE)/ATLAS_SIZE;
    TILE_UV[name] = { u0:u0+inset, v0:v0+inset, u1:u0+TILE/ATLAS_SIZE-inset, v1:v0+TILE/ATLAS_SIZE-inset };
  });
  const tex = crispTexture(new THREE.CanvasTexture(cvs));
  tex.flipY = false;   // TILE_UV rects are computed top-down (canvas space)
  ATLAS_TEX = tex;
  return tex;
}

/* =====================================================================
   Cube face geometry tables. Order: +x,-x,+y,-y,+z,-z. Each face = 4
   corner offsets (CCW) and a normal. UV corners map to the tile rect.
   ===================================================================== */
const FACES = [
  { dir:[ 1,0,0], n:[1,0,0],  corners:[[1,0,1],[1,0,0],[1,1,0],[1,1,1]] }, // +x
  { dir:[-1,0,0], n:[-1,0,0], corners:[[0,0,0],[0,0,1],[0,1,1],[0,1,0]] }, // -x
  { dir:[0, 1,0], n:[0,1,0],  corners:[[0,1,1],[1,1,1],[1,1,0],[0,1,0]] }, // +y (top)
  { dir:[0,-1,0], n:[0,-1,0], corners:[[0,0,0],[1,0,0],[1,0,1],[0,0,1]] }, // -y
  { dir:[0,0, 1], n:[0,0,1],  corners:[[0,0,1],[1,0,1],[1,1,1],[0,1,1]] }, // +z
  { dir:[0,0,-1], n:[0,0,-1], corners:[[1,0,0],[0,0,0],[0,1,0],[1,1,0]] }, // -z
];
const FACE_TILE = ['side','side','top','bottom','side','side']; // which tile per face index
const FACE_SHADE = [0.78, 0.78, 1.0, 0.52, 0.66, 0.66];          // baked directional tint

// pick the tile name for a block's face index
function blockTile(b, faceIdx){
  const t = b.tiles;
  if (typeof t === 'string') return t;
  const key = FACE_TILE[faceIdx];
  return t[key] || t.side || t.all || t.top;
}

/* =====================================================================
   Chunk meshing. Produces three geometries: opaque cubes, cutout (leaves
   + cross plants), and blend (water/glass/ice). Only faces touching a
   non-opaque neighbour are emitted. getBlock(wx,wy,wz) reads across
   chunk borders. 'model' blocks are skipped (spawned as objects).
   ===================================================================== */
function isOpaqueCube(id){ const b=BLOCKS[id]; return b && b.render==='cube' && !b.transparent; }
const AO_SHADE=[0.45,0.62,0.80,1.0];
function vertexAO(f, corner, x,y,z, getBlock){
  const n=FACES[f].n; let s1x=0,s1y=0,s1z=0,s2x=0,s2y=0,s2z=0;
  if(n[0]){ s1y=corner[1]?1:-1; s2z=corner[2]?1:-1; }
  else if(n[1]){ s1x=corner[0]?1:-1; s2z=corner[2]?1:-1; }
  else { s1x=corner[0]?1:-1; s2y=corner[1]?1:-1; }
  const ox=x+n[0], oy=y+n[1], oz=z+n[2];
  const side1=isOpaqueCube(getBlock(ox+s1x,oy+s1y,oz+s1z))?1:0;
  const side2=isOpaqueCube(getBlock(ox+s2x,oy+s2y,oz+s2z))?1:0;
  const cornerSolid=isOpaqueCube(getBlock(ox+s1x+s2x,oy+s1y+s2y,oz+s1z+s2z))?1:0;
  return AO_SHADE[(side1&&side2)?0:3-side1-side2-cornerSolid];
}

function meshChunk(cx, cz, getBlock, getHeight, worldRef){
  _scratchSlot=0;
  const buckets = { opaque:newBuf(), cutout:newBuf(), blend:newBuf() };
  const ox = cx*CHUNK_X, oz = cz*CHUNK_Z;

  // Fast block lookup: pre-cache 5 chunk Uint8Arrays to avoid Map.get + Math.floor
  // per block in the hot loop (~5× faster than calling getBlock each time).
  let fastGet=getBlock;
  if(worldRef){
    const c =worldRef.getChunk(cx,  cz  );
    const cE=worldRef.getChunk(cx+1,cz  );
    const cW=worldRef.getChunk(cx-1,cz  );
    const cN=worldRef.getChunk(cx,  cz-1);
    const cS=worldRef.getChunk(cx,  cz+1);
    fastGet=(wx,wy,wz)=>{
      if(wy<0) return B.STONE; if(wy>=WORLD_H) return B.AIR;
      const lx=wx-ox, lz=wz-oz;
      if(lx>=0&&lx<CHUNK_X&&lz>=0&&lz<CHUNK_Z) return c[(wy*CHUNK_Z+lz)*CHUNK_X+lx];
      // AO corner samples can cross two chunk axes at once; use the full
      // lookup only for those rare diagonal-border reads.
      if(lx<0){ if(lz<0||lz>=CHUNK_Z) return getBlock(wx,wy,wz); return cW[(wy*CHUNK_Z+lz)*CHUNK_X+(CHUNK_X+lx)]; }
      if(lx>=CHUNK_X){ if(lz<0||lz>=CHUNK_Z) return getBlock(wx,wy,wz); return cE[(wy*CHUNK_Z+lz)*CHUNK_X+(lx-CHUNK_X)]; }
      if(lz<0)        return cN[(wy*CHUNK_Z+(CHUNK_Z+lz))*CHUNK_X+lx];
      return                  cS[(wy*CHUNK_Z+(lz-CHUNK_Z))*CHUNK_X+lx];
    };
  }

  const top = new Int16Array(CHUNK_X*CHUNK_Z);
  for(let z=0;z<CHUNK_Z;z++) for(let x=0;x<CHUNK_X;x++){ top[x*CHUNK_Z+z]=getHeight(ox+x,oz+z); }
  for(let y=0;y<WORLD_H;y++) for(let z=0;z<CHUNK_Z;z++) for(let x=0;x<CHUNK_X;x++){
    const wx=ox+x, wz=oz+z;
    const id = fastGet(wx,y,wz);
    if(!id) continue;
    const b = BLOCKS[id];
    if(b.render==='model') continue;            // special object, not meshed
    const sky = (y >= top[x*CHUNK_Z+z]) ? 1.0 : 0.52;   // exposed vs underground
    if(b.render==='cross'){ addCross(buckets.cutout, wx,y,wz, blockTile(b,0), sky); continue; }
    const bucket = b.transparent ? (b.cutout ? buckets.cutout : buckets.blend) : buckets.opaque;
    for(let f=0;f<6;f++){
      const d=FACES[f].dir, nId=fastGet(wx+d[0],y+d[1],wz+d[2]);
      // cull rule: hide face if neighbour opaque, or same transparent block touching
      if(isOpaqueCube(nId)) continue;
      if(b.transparent && nId===id) continue;
      addFace(bucket, f, wx,y,wz, TILE_UV[blockTile(b,f)], FACE_SHADE[f]*sky, b.sway||0, b.transparent?null:fastGet, id===B.WATER?1:0);
    }
  }
  return {
    opaque: finishBuf(buckets.opaque),
    cutout: finishBuf(buckets.cutout),
    blend:  finishBuf(buckets.blend,true),
  };
}
// Shared typed-array scratch buffers for chunk meshing.
// meshChunk always creates exactly 3 buckets synchronously — 3 slots suffice.
const _BUF_CAP = 40000; // max verts per bucket (generous headroom)
const _scratch = [0,1,2].map(()=>({
  pos:  new Float32Array(_BUF_CAP*3),
  norm: new Float32Array(_BUF_CAP*3),
  uv:   new Float32Array(_BUF_CAP*2),
  col:  new Float32Array(_BUF_CAP*3),
  sway: new Float32Array(_BUF_CAP),
  water:new Float32Array(_BUF_CAP),
  idx:  new Uint32Array(_BUF_CAP*3>>1), // N verts = N/4 quads = N*6/4 = N*1.5 indices
  v:0, ni:0
}));
let _scratchSlot=0;

function newBuf(){ const s=_scratch[_scratchSlot++]; s.v=0; s.ni=0; return s; }
function addFace(B, f, x,y,z, uv, sh, sway=0, aoGet=null, water=0){
  const F=FACES[f], co=F.corners, n=F.n;
  const vb=B.v, p=B.pos, nm=B.norm, uva=B.uv, cl=B.col, sw=B.sway, wt=B.water;
  const u0=uv.u0, u1=uv.u1, v0=uv.v0, v1=uv.v1, nx=n[0], ny=n[1], nz=n[2];
  for(let i=0;i<4;i++){
    const o=(vb+i)*3, uo=(vb+i)*2;
    p[o]=x+co[i][0]; p[o+1]=y+co[i][1]; p[o+2]=z+co[i][2];
    nm[o]=nx; nm[o+1]=ny; nm[o+2]=nz;
    uva[uo]=(i===0||i===3)?u0:u1; uva[uo+1]=i<2?v1:v0;
    const vsh=aoGet?sh*vertexAO(f,co[i],x,y,z,aoGet):sh;
    cl[o]=vsh; cl[o+1]=vsh; cl[o+2]=vsh;
    sw[vb+i]=sway;
    wt[vb+i]=water;
  }
  const qi=B.ni;
  B.idx[qi]=vb; B.idx[qi+1]=vb+1; B.idx[qi+2]=vb+2; B.idx[qi+3]=vb; B.idx[qi+4]=vb+2; B.idx[qi+5]=vb+3;
  B.v+=4; B.ni+=6;
}
// cross-quad corner offsets (static to avoid per-call allocation)
const _CX_A=[0.15,0.85], _CZ_A=[0.15,0.15], _CX_B=[0.85,0.15], _CZ_B=[0.85,0.85];
function addCross(B, x,y,z, tileName, sky=1){
  const uv=TILE_UV[tileName], sh=0.95*sky;
  const u0=uv.u0, u1=uv.u1, v0=uv.v0, v1=uv.v1;
  const p=B.pos, nm=B.norm, uva=B.uv, cl=B.col, sw=B.sway;
  for(let q=0;q<2;q++){
    const ax=_CX_A[q], az=_CZ_A[q], bx=_CX_B[q], bz=_CZ_B[q];
    const vb=B.v, qi=B.ni;
    let o, uo;
    o=vb*3; uo=vb*2; p[o]=x+ax; p[o+1]=y; p[o+2]=z+az; nm[o]=0;nm[o+1]=1;nm[o+2]=0; uva[uo]=u0;uva[uo+1]=v1; cl[o]=sh;cl[o+1]=sh;cl[o+2]=sh; sw[vb]=0;
    o+=3; uo+=2; p[o]=x+bx; p[o+1]=y; p[o+2]=z+bz; nm[o]=0;nm[o+1]=1;nm[o+2]=0; uva[uo]=u1;uva[uo+1]=v1; cl[o]=sh;cl[o+1]=sh;cl[o+2]=sh; sw[vb+1]=0;
    o+=3; uo+=2; p[o]=x+bx; p[o+1]=y+1;p[o+2]=z+bz; nm[o]=0;nm[o+1]=1;nm[o+2]=0; uva[uo]=u1;uva[uo+1]=v0; cl[o]=sh;cl[o+1]=sh;cl[o+2]=sh; sw[vb+2]=1;
    o+=3; uo+=2; p[o]=x+ax; p[o+1]=y+1;p[o+2]=z+az; nm[o]=0;nm[o+1]=1;nm[o+2]=0; uva[uo]=u0;uva[uo+1]=v0; cl[o]=sh;cl[o+1]=sh;cl[o+2]=sh; sw[vb+3]=1;
    B.idx[qi]=vb;B.idx[qi+1]=vb+1;B.idx[qi+2]=vb+2;B.idx[qi+3]=vb;B.idx[qi+4]=vb+2;B.idx[qi+5]=vb+3;
    B.v+=4; B.ni+=6;
  }
}
function finishBuf(B, includeWater=false){
  if(B.v===0) return null;
  const g=new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(B.pos.slice(0,B.v*3),3));
  g.setAttribute('normal',   new THREE.Float32BufferAttribute(B.norm.slice(0,B.v*3),3));
  g.setAttribute('uv',       new THREE.Float32BufferAttribute(B.uv.slice(0,B.v*2),2));
  g.setAttribute('color',    new THREE.Float32BufferAttribute(B.col.slice(0,B.v*3),3));
  g.setAttribute('sway',     new THREE.Float32BufferAttribute(B.sway.slice(0,B.v),1));
  if(includeWater) g.setAttribute('water', new THREE.Float32BufferAttribute(B.water.slice(0,B.v),1));
  g.setIndex(new THREE.BufferAttribute(B.idx.slice(0,B.ni),1));
  return g;
}

/* =====================================================================
   Voxel raycast (Amanatides–Woo DDA). Returns the first selectable block
   plus the face normal so the caller can place against it.
   ===================================================================== */
function raycastVoxel(origin, dir, maxDist, isSel){
  let x=Math.floor(origin.x), y=Math.floor(origin.y), z=Math.floor(origin.z);
  const sx=Math.sign(dir.x), sy=Math.sign(dir.y), sz=Math.sign(dir.z);
  const tDX = sx!==0 ? Math.abs(1/dir.x):Infinity;
  const tDY = sy!==0 ? Math.abs(1/dir.y):Infinity;
  const tDZ = sz!==0 ? Math.abs(1/dir.z):Infinity;
  let tMaxX = sx>0 ? (x+1-origin.x)/dir.x : sx<0 ? (origin.x-x)/-dir.x : Infinity;
  let tMaxY = sy>0 ? (y+1-origin.y)/dir.y : sy<0 ? (origin.y-y)/-dir.y : Infinity;
  let tMaxZ = sz>0 ? (z+1-origin.z)/dir.z : sz<0 ? (origin.z-z)/-dir.z : Infinity;
  let nx=0,ny=0,nz=0, t=0;
  for(let i=0;i<256;i++){
    if(isSel(x,y,z)) return { hit:true, x,y,z, nx,ny,nz };
    if(tMaxX<tMaxY && tMaxX<tMaxZ){ x+=sx; t=tMaxX; tMaxX+=tDX; nx=-sx;ny=0;nz=0; }
    else if(tMaxY<tMaxZ){ y+=sy; t=tMaxY; tMaxY+=tDY; nx=0;ny=-sy;nz=0; }
    else { z+=sz; t=tMaxZ; tMaxZ+=tDZ; nx=0;ny=0;nz=-sz; }
    if(t>maxDist) break;
  }
  return { hit:false };
}

/* =====================================================================
   Input manager — key states + accumulated mouse delta + wheel.
   Pointer-lock wiring lives in main.js; this just records.
   ===================================================================== */
class Input {
  constructor(){
    this.keys = {}; this.mdx=0; this.mdy=0; this.wheel=0;
    this.mouseDown=[false,false,false]; this.enabled=false;
    addEventListener('keydown', e=>{ this.keys[e.code]=true; });
    addEventListener('keyup',   e=>{ this.keys[e.code]=false; });
    addEventListener('mousemove', e=>{ if(this.enabled){ this.mdx+=e.movementX; this.mdy+=e.movementY; } });
    addEventListener('mousedown', e=>{ if(this.enabled) this.mouseDown[e.button]=true; });
    addEventListener('mouseup',   e=>{ this.mouseDown[e.button]=false; });
    addEventListener('wheel', e=>{ if(this.enabled){ this.wheel+=Math.sign(e.deltaY); e.preventDefault(); } }, {passive:false});
    addEventListener('blur', ()=>{ this.keys={}; this.mouseDown=[false,false,false]; });
  }
  consumeMouse(){ const d={x:this.mdx,y:this.mdy}; this.mdx=0; this.mdy=0; return d; }
  consumeWheel(){ const w=this.wheel; this.wheel=0; return w; }
  down(code){ return !!this.keys[code]; }
}

/* =====================================================================
   Procedural geometry for special blocks. Each returns a THREE.Object3D
   centred on the block cell (anchored so y=0 is the cell's bottom).
   Materials are plain Lambert colours so they react to scene lighting.
   ===================================================================== */
const M = (hex)=> new THREE.MeshLambertMaterial({ color:hex });
const ME = (hex,emi,ei)=> new THREE.MeshLambertMaterial({ color:hex, emissive:emi, emissiveIntensity:ei });
function box(w,h,d, mat, x,y,z){ const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d), mat); m.position.set(x,y,z); m.castShadow=false; return m; }
function post(g,x,z,h=0.9,mat=M('#6b4a2a')){ g.add(box(0.12,h,0.12,mat,x,h/2,z)); }
function strap(g,w,h,d,x,y,z){ g.add(box(w,h,d,M('#2d3338'),x,y,z)); }

const SpecialModels = {
  chest(meta){
    const g=new THREE.Group(); const wood=M('#7b5228'), dark=M('#3d2413'), trim=M('#2d3338'), metal=M('#caa45a');
    const open=!!(meta&&meta.open);
    g.add(box(0.9,0.5,0.82, wood, 0,0.25,0));
    for(const x of [-0.43,0.43]) g.add(box(0.05,0.52,0.86, dark, x,0.26,0));
    for(const z of [-0.4,0.4]) g.add(box(0.9,0.08,0.06, trim, 0,0.5,z));
    g.add(box(0.16,0.18,0.05, metal, 0,0.42,0.435));
    const lid=new THREE.Group();
    lid.add(box(0.92,0.22,0.86, dark, 0,0,0));
    lid.add(box(0.96,0.05,0.9, trim, 0,0.1,0));
    lid.add(box(0.7,0.04,0.04, metal, 0,0.12,0.42));
    lid.position.set(0,0.58,-0.41);
    lid.rotation.x=open?-Math.PI*0.55:0;
    lid.children.forEach(c=>c.position.z+=0.41);
    g.add(lid);
    return g;
  },
  bench(){
    const g=new THREE.Group(); const top=M('#b98143'), edge=M('#5a331b'), leg=M('#6b3f20'), metal=M('#87919a');
    g.add(box(0.96,0.16,0.96, top, 0,0.86,0));
    g.add(box(1.02,0.08,1.02, edge, 0,0.76,0));
    for(const x of [-0.38,0.38]) for(const z of [-0.38,0.38]) post(g,x,z,0.76,leg);
    g.add(box(0.74,0.04,0.06, edge, 0,0.96,-0.18));
    g.add(box(0.06,0.04,0.74, edge, -0.18,0.97,0));
    g.add(box(0.2,0.05,0.2, M('#d1ad66'), 0.22,0.99,0.2));
    g.add(box(0.28,0.05,0.07, metal, -0.22,1.0,0.22));
    g.add(box(0.08,0.05,0.28, metal, -0.32,1.0,0.12));
    g.add(box(0.72,0.12,0.06, edge, 0,0.48,0.43));
    g.add(box(0.72,0.12,0.06, edge, 0,0.48,-0.43));
    return g;
  },
  furnace(){
    const g=new THREE.Group(); const stone=M('#767a80'), dark=M('#303238'), iron=M('#a9adb3'), ember=ME('#e07a2a','#ff7a22',1.2);
    g.add(box(0.96,0.96,0.96, stone, 0,0.48,0));
    for(const x of [-0.34,0,0.34]) g.add(box(0.03,0.98,0.98,dark,x,0.49,0));
    for(const y of [0.22,0.55,0.86]) g.add(box(0.98,0.03,0.98,dark,0,y,0));
    g.add(box(0.54,0.42,0.07, M('#17191c'), 0,0.4,0.49));
    g.add(box(0.42,0.2,0.08, ember, 0,0.31,0.52));
    g.add(box(0.62,0.08,0.08, iron, 0,0.68,0.52));
    g.add(box(0.14,0.14,0.08, iron, 0.36,0.5,0.52));
    return g;
  },
  bed(meta){
    const g=new THREE.Group();
    const blanket=M('#c2473f'), pillow=M('#e8e2d4'), frame=M('#6b4a2a'), strapM=M('#8d2b2b');
    // bed lies along +z spanning two cells; head at this cell
    g.add(box(0.9,0.16,1.86, frame, 0,0.12,0.5));
    g.add(box(0.82,0.1,1.45, M('#d69b5a'), 0,0.24,0.65));
    g.add(box(0.84,0.14,1.0, blanket, 0,0.33,0.8));
    g.add(box(0.74,0.16,0.42, pillow, 0,0.36,-0.08));
    for(const dz of [0.35,0.9]) g.add(box(0.9,0.08,0.08, strapM, 0,0.43,dz));
    for(const dz of [-0.35,1.35]) for(const dx of [0.38,-0.38]) g.add(box(0.1,0.24,0.1, frame, dx,0.12,dz));
    g.rotation.y = (meta&&meta.rot)||0;
    return g;
  },
  torch(){
    const g=new THREE.Group();
    g.add(box(0.1,0.55,0.1, M('#6b4a2a'), 0,0.28,0));
    g.add(box(0.16,0.05,0.16, M('#2d3338'), 0,0.55,0));
    g.add(box(0.2,0.18,0.2, ME('#f6b73c','#ff9e2c',1.6), 0,0.66,0));
    g.add(box(0.1,0.08,0.1, ME('#fff1a8','#ffcf52',1.9), 0,0.76,0));
    g.userData.light = { color:0xffb24d, intensity:1.1, dist:9, y:0.6 };
    return g;
  },
  campfire(){
    const g=new THREE.Group();
    const log=M('#6b4a2a'), ash=M('#2a2522'), flame=ME('#ff8a2a','#ff7a22',1.7), flameC=ME('#ffd24a','#ffd24a',1.5);
    g.add(box(0.5,0.05,0.5, ash, 0,0.025,0));
    g.add(box(0.86,0.16,0.18, log, 0,0.1,-0.27));            // crossed logs
    g.add(box(0.86,0.16,0.18, log, 0,0.1,0.27));
    g.add(box(0.18,0.16,0.86, log, -0.27,0.22,0));
    g.add(box(0.18,0.16,0.86, log, 0.27,0.22,0));
    g.add(box(0.22,0.42,0.22, flame, 0,0.42,0));             // flame
    g.add(box(0.12,0.3,0.12, flameC, 0,0.58,0));
    g.userData.light = { color:0xffa040, intensity:1.4, dist:12, y:0.4 };
    return g;
  },
  searock(){
    // a small cluster of low seabed stones — a PROP, never a full cube, so it
    // doesn't read as a chunky block patch from above the water
    const g=new THREE.Group();
    const a=M('#6f7378'), b=M('#565b60'), c=M('#7e8186');
    g.add(box(0.5,0.3,0.46, a, 0,0.15,0));
    g.add(box(0.34,0.24,0.3, b, 0.22,0.12,0.16));
    g.add(box(0.3,0.2,0.34, c, -0.2,0.1,-0.12));
    g.add(box(0.22,0.16,0.2, b, 0.05,0.32,-0.04));
    return g;
  },
  lantern(meta){
    const g=new THREE.Group();
    // meta.flip = post-mounted: the brass bracket points DOWN onto the post so it
    // reads as supported, not floating (inner group is flipped; g stays at the
    // block origin so _refreshObject can position it)
    const flip=!!(meta&&meta.flip), inner = flip ? new THREE.Group() : g;
    const iron=M('#2f353b'), brass=M('#9d7a35'), glass=ME('#ffd76a','#ffcf52',1.4);
    inner.add(box(0.36,0.06,0.36, iron, 0,0.74,0));
    for(const dx of [0.15,-0.15]) for(const dz of [0.15,-0.15]) inner.add(box(0.05,0.5,0.05, iron, dx,0.5,dz));
    inner.add(box(0.24,0.4,0.24, glass, 0,0.5,0));
    inner.add(box(0.36,0.06,0.36, iron, 0,0.26,0));
    inner.add(box(0.2,0.05,0.2, brass, 0,0.82,0));     // cap plate
    inner.add(box(0.08,0.18,0.08, iron, 0,0.95,0));    // thick chain link
    inner.add(box(0.14,0.07,0.14, iron, 0,1.06,0));    // mount knob — reaches the block above so it visibly attaches
    if(flip){ inner.rotation.z=Math.PI; inner.position.y=1.29; g.add(inner); }
    g.userData.light = { color:0xffd47a, intensity:1.3, dist:11, y:0.5 };
    return g;
  },
  door(meta){
    // the leaf must be offset AWAY from its own group origin so that origin
    // is the hinge edge — rotating a group rotates about its own origin, so
    // geometry centered there (the old bug) just spins in place instead of
    // swinging into the room. Tall enough to fill the full 2-block frame.
    const g=new THREE.Group();
    const open=meta&&meta.open, baseRot=(meta&&meta.rot)||0;
    const hinge=(meta&&meta.hinge)||1;   // 1 or -1 — which jamb it's hinged on, so it swings away from a solid neighbor instead of always the same way
    const leaf=new THREE.Group();
    // panel offsets flip sign with hinge so the leaf is flush against
    // whichever jamb it's hinged on, not floating mid-air at the original
    // single fixed offset (was also the source of the "floating off the
    // block" bug — these Y values sit flush on the block's own floor, 0..1.9)
    leaf.add(box(0.9,1.9,0.1, M('#8a6638'), -0.45*hinge,0.95,0));
    leaf.add(box(0.78,0.08,0.13, M('#4a3018'), -0.45*hinge,1.8,0));
    leaf.add(box(0.78,0.08,0.13, M('#4a3018'), -0.45*hinge,0.1,0));
    leaf.add(box(0.08,1.75,0.13, M('#4a3018'), -0.78*hinge,0.95,0));
    leaf.add(box(0.08,1.75,0.13, M('#4a3018'), -0.12*hinge,0.95,0));
    leaf.add(box(0.58,0.58,0.14, M('#6b4a2a'), -0.45*hinge,1.35,0));   // upper panel
    leaf.add(box(0.58,0.58,0.14, M('#6b4a2a'), -0.45*hinge,0.55,0));   // lower panel
    leaf.add(box(0.07,0.07,0.15, M('#caa45a'), -0.84*hinge,0.95,0));  // handle
    leaf.add(box(0.04,0.18,0.16, M('#2f353b'), -0.06*hinge,1.55,0));  // hinge bands
    leaf.add(box(0.04,0.18,0.16, M('#2f353b'), -0.06*hinge,0.35,0));
    // the hinge pivot has to rotate WITH the door, or at 90°/270° the fixed
    // +X offset points along a totally different axis than the (also
    // rotated) panel geometry, shoving the whole door toward one corner and
    // overhanging into the next cell instead of staying flush in its own
    leaf.position.copy(new THREE.Vector3(0.46*hinge,0,0).applyAxisAngle(new THREE.Vector3(0,1,0), baseRot));
    leaf.rotation.y = baseRot + (open?-hinge*Math.PI/2:0);
    g.add(leaf);
    return g;
  },
  metaldoor(meta){
    // a real sliding/swinging METAL hatch — same hinge geometry as the wooden
    // door (so collision/placement logic is shared) but gray plating, bolts,
    // a porthole window and a red accent stripe to match the rocket.
    const g=new THREE.Group();
    const open=meta&&meta.open, baseRot=(meta&&meta.rot)||0;
    const hinge=(meta&&meta.hinge)||1;
    const steel=M('#aeb4bc'), dark=M('#3a3f47'), bolt=M('#6d7178'), warn=M('#c64a2a');
    const glass=new THREE.MeshLambertMaterial({color:0x1a3450, emissive:0x0a1a2a, transparent:true, opacity:0.85});
    const leaf=new THREE.Group();
    leaf.add(box(0.92,1.92,0.12, steel, -0.45*hinge,0.96,0));         // metal slab
    leaf.add(box(0.8,0.1,0.14, dark, -0.45*hinge,1.78,0));            // top rail
    leaf.add(box(0.8,0.1,0.14, dark, -0.45*hinge,0.14,0));            // bottom rail
    leaf.add(box(0.1,1.7,0.14, dark, -0.81*hinge,0.96,0));            // hinge-side jamb
    leaf.add(box(0.1,1.7,0.14, dark, -0.09*hinge,0.96,0));            // latch-side jamb
    leaf.add(box(0.9,0.14,0.15, warn, -0.45*hinge,0.42,0));           // red warning stripe
    leaf.add(box(0.34,0.34,0.16, dark, -0.45*hinge,1.24,0));          // porthole frame
    leaf.add(box(0.24,0.24,0.18, glass, -0.45*hinge,1.24,0));         // porthole window
    for(const by of [1.66,0.26]) for(const bx of [-0.16,0.16]) leaf.add(box(0.07,0.07,0.15, bolt, -0.45*hinge+bx,by,0)); // corner bolts
    leaf.add(box(0.12,0.08,0.16, bolt, -0.12*hinge,0.96,0));          // handle
    leaf.position.copy(new THREE.Vector3(0.46*hinge,0,0).applyAxisAngle(new THREE.Vector3(0,1,0), baseRot));
    leaf.rotation.y = baseRot + (open?-hinge*Math.PI/2:0);
    g.add(leaf);
    return g;
  },
  ladder(meta){
    const g=new THREE.Group();
    for(const dx of [0.32,-0.32]) g.add(box(0.07,1.0,0.06, M('#6b4a2a'), dx,0.5,0.44));
    for(let y=0.15;y<1;y+=0.22) g.add(box(0.64,0.055,0.06, M('#b98245'), 0,y,0.44));
    g.add(box(0.7,0.03,0.04, M('#3d2413'), 0,0.98,0.45));
    g.rotation.y=(meta&&meta.rot)||0;
    return g;
  },
  fence(){
    const g=new THREE.Group(); const w=M('#8a6638'), dark=M('#4a3018');
    g.add(box(0.2,0.9,0.2, w, 0,0.45,0));
    g.add(box(0.28,0.12,0.28, dark, 0,0.94,0));
    for(const y of [0.38,0.68]){
      g.add(box(1.0,0.12,0.1, w, 0,y,0));
      g.add(box(0.1,0.12,1.0, w, 0,y,0));
    }
    return g;
  },
  stairs(meta){
    const g=new THREE.Group(); const m=M(meta&&meta.color||'#9a9da2'), edge=M('#6d7075');
    g.add(box(1,0.34,1, m, 0,0.17,0));
    g.add(box(1,0.33,0.66, m, 0,0.505,-0.17));
    g.add(box(1,0.33,0.33, m, 0,0.835,-0.335));
    for(const y of [0.34,0.67,1.0]) g.add(box(1.02,0.025,0.04, edge, 0,y,-0.49+y*0.33));
    g.rotation.y=(meta&&meta.rot)||0;
    return g;
  },
  slab(meta){ const g=new THREE.Group(); const m=M(meta&&meta.color||'#9a9da2'); g.add(box(1,0.46,1, m, 0,0.23,0)); g.add(box(0.92,0.035,0.92,M('#6d7075'),0,0.48,0)); return g; },
  carpet(meta){ const g=new THREE.Group(); g.add(box(0.96,0.035,0.96, M('#9e3b5a'), 0,0.017,0)); for(const z of [-0.4,0.4]) g.add(box(0.82,0.025,0.04,M('#c06a86'),0,0.05,z)); return g; },
  bookshelf(){
    const g=new THREE.Group(); const wood=M('#6b4a2a'), dark=M('#3d2413');
    g.add(box(0.96,0.96,0.92, wood,0,0.48,0));
    g.add(box(0.84,0.78,0.08, dark,0,0.5,0.47));
    for(const y of [0.28,0.54,0.8]) g.add(box(0.86,0.06,0.12, wood,0,y,0.5));
    const cols=['#c2473f','#3c6fa3','#caa45a','#5f9f62','#7b4f9d','#d8d2bd'];
    for(let row=0;row<3;row++) for(let i=0;i<7;i++){
      const h=0.16+((i+row)%3)*0.03, w=0.08;
      g.add(box(w,h,0.1,M(cols[(i+row)%cols.length]), -0.32+i*0.105,0.18+row*0.26+h/2,0.53));
    }
    return g;
  },
  hay(){
    const g=new THREE.Group(); const straw=M('#caa45a'), edge=M('#8a6638'), band=M('#7a4d25');
    g.add(box(0.92,0.92,0.92, straw,0,0.46,0));
    for(const y of [0.24,0.68]) g.add(box(0.98,0.08,0.98, band,0,y,0));
    for(const x of [-0.28,0,0.28]) g.add(box(0.035,0.94,0.94, edge,x,0.47,0));
    for(const z of [-0.28,0.28]) g.add(box(0.94,0.035,0.035, edge,0,0.93,z));
    return g;
  },
  pumpkin(){
    const g=new THREE.Group(); const orange=M('#c66b24'), dark=M('#8a3f18'), stem=M('#3c6b2c');
    g.add(box(0.88,0.72,0.88, orange,0,0.36,0));
    for(const x of [-0.28,0,0.28]) g.add(box(0.04,0.74,0.9,dark,x,0.37,0));
    g.add(box(0.16,0.18,0.16,stem,0,0.82,0));
    g.add(box(0.08,0.06,0.08,M('#2d2418'),-0.18,0.42,0.45));
    g.add(box(0.08,0.06,0.08,M('#2d2418'),0.18,0.42,0.45));
    return g;
  },
  melon(){
    const g=new THREE.Group(); const green=M('#4e9a3f'), dark=M('#2f6d32');
    g.add(box(0.88,0.72,0.88, green,0,0.36,0));
    for(const x of [-0.32,-0.12,0.12,0.32]) g.add(box(0.055,0.74,0.9,dark,x,0.37,0));
    return g;
  },
  cake(){
    const g=new THREE.Group();
    g.add(box(0.86,0.32,0.86,M('#f0d6b5'),0,0.16,0));
    g.add(box(0.88,0.12,0.88,M('#f4f0e8'),0,0.38,0));
    for(const x of [-0.26,0,0.26]) g.add(box(0.09,0.08,0.09,M('#c2473f'),x,0.48,-0.18));
    g.add(box(0.74,0.04,0.74,M('#7b4a2a'),0,0.06,0));
    return g;
  },
  window(meta){ const g=new THREE.Group(); const glass=new THREE.MeshLambertMaterial({color:0xbfe3f0,transparent:true,opacity:0.42}); g.add(box(0.9,0.86,0.08, glass,0,0.52,0)); g.add(box(1,0.12,0.14,M('#5a3f24'),0,0.92,0)); g.add(box(1,0.12,0.14,M('#5a3f24'),0,0.08,0)); g.add(box(0.12,1,0.14,M('#5a3f24'),-0.44,0.5,0)); g.add(box(0.12,1,0.14,M('#5a3f24'),0.44,0.5,0)); g.add(box(0.08,0.88,0.15,M('#8a6638'),0,0.5,0)); g.add(box(0.88,0.08,0.15,M('#8a6638'),0,0.5,0)); g.rotation.y=(meta&&meta.rot)||0; return g; },
  potted(){
    const g=new THREE.Group(); const pot=M('#8a6640'), rim=M('#6b4a2a'), soil=M('#3a2a18'), leaf=M('#2d6a2d'), fl=M('#c2473f');
    g.add(box(0.38,0.32,0.38,pot,0,0.16,0));
    g.add(box(0.44,0.06,0.44,rim,0,0.32,0));
    g.add(box(0.28,0.1,0.28,soil,0,0.38,0));
    g.add(box(0.05,0.42,0.05,leaf,0,0.6,0));
    g.add(box(0.22,0.06,0.22,leaf,0,0.82,0));
    g.add(box(0.08,0.08,0.08,fl,0,0.9,0));
    return g;
  },
  banner(meta){
    const g=new THREE.Group(); const pole=M('#5a3f1f'), cloth=M('#3a6f9a');
    g.add(box(0.07,0.82,0.07,pole,0,0.41,0));
    g.add(box(0.05,0.5,0.48,cloth,0.2,0.55,0));
    g.add(box(0.03,0.03,0.03,M('#2a2a2a'),0,0.88,0));
    g.rotation.y=(meta&&meta.rot)||0;
    return g;
  },
  plamp(){
    const g=new THREE.Group(); const f=M('#4a3a2a'), p=ME('#f8e8c0','#ffe8a0',0.7);
    g.add(box(0.18,0.18,0.18,p,0,0.52,0));
    g.add(box(0.22,0.03,0.22,f,0,0.41,0));
    g.add(box(0.22,0.03,0.22,f,0,0.62,0));
    g.add(box(0.04,0.22,0.04,f,0,0.78,0));
    g.userData.light={color:0xfff0b0,intensity:0.8,dist:7,y:0.52};
    return g;
  },
  science(meta){
    const g=new THREE.Group(); const body=M('#bfc4cc'), dark=M('#3a4048'), trim=M('#8a9098'), screen=ME('#1e3a44','#4fe0ff',1.4), key=M('#5a6068');
    g.add(box(0.96,0.5,0.7, body, 0,0.25,0));
    g.add(box(1.0,0.06,0.74, trim, 0,0.5,0));
    for(const x of [-0.42,0.42]) g.add(box(0.06,0.5,0.7, dark, x,0.25,0));
    const scr=new THREE.Group();
    scr.add(box(0.84,0.5,0.06, dark, 0,0,0));
    scr.add(box(0.74,0.4,0.04, screen, 0,0,0.04));
    scr.position.set(0,0.74,-0.16); scr.rotation.x=-0.5;
    g.add(scr);
    g.add(box(0.7,0.04,0.24, key, 0,0.52,0.2));
    for(let i=0;i<3;i++) g.add(box(0.08,0.05,0.08, ME('#4fe0ff','#4fe0ff',1.2), -0.22+i*0.22,0.53,0.28));
    g.userData.light={color:0x4fe0ff,intensity:0.7,dist:6,y:0.7};
    g.rotation.y=(meta&&meta.rot)||0;   // face the room when placed with a rot (default 0 = unchanged)
    return g;
  },
  fueltank(meta){
    const g=new THREE.Group(); const steel=M('#9aa0a8'), dark=M('#5a6068'), cap=M('#70747c'), fluid=ME('#2fd6c8','#2fd6c8',1.3), valve=M('#c8503a');
    for(let i=0;i<8;i++){ const a=i/8*Math.PI*2; g.add(box(0.18,0.86,0.18, steel, Math.cos(a)*0.3,0.5,Math.sin(a)*0.3)); }
    g.add(box(0.62,0.82,0.62, steel, 0,0.5,0));
    g.add(box(0.7,0.1,0.7, cap, 0,0.06,0));
    g.add(box(0.7,0.1,0.7, cap, 0,0.94,0));
    for(const z of [0.31,-0.31]) g.add(box(0.34,0.5,0.04, fluid, 0,0.5,z));
    for(const x of [0.31,-0.31]) g.add(box(0.04,0.5,0.34, fluid, x,0.5,0));
    g.add(box(0.12,0.16,0.12, valve, 0,1.04,0));
    g.add(box(0.26,0.05,0.26, dark, 0,1.0,0));
    g.userData.light={color:0x2fd6c8,intensity:0.5,dist:5,y:0.5};
    return g;
  },
};

/* =====================================================================
   Mob models — simple multi-box voxel critters with named parts so the
   AI can animate legs/head.
   ===================================================================== */
function mobModel(kind){
  const g=new THREE.Group(); g.userData.parts={};
  const add=(w,h,d,col,x,y,z,name)=>{ const m=box(w,h,d,M(col),x,y,z); if(name)g.userData.parts[name]=m; g.add(m); return m; };
  switch(kind){
    case 'grazer': // woolly grazer
      add(0.9,0.6,1.3,'#e6ddcf',0,0.7,0,'body');
      add(0.5,0.5,0.5,'#d8cdb8',0,0.95,0.8,'head');
      add(0.1,0.5,0.1,'#5a4a3a',0.3,0.25,0.45,'legFL');
      add(0.1,0.5,0.1,'#5a4a3a',-0.3,0.25,0.45,'legFR');
      add(0.1,0.5,0.1,'#5a4a3a',0.3,0.25,-0.45,'legBL');
      add(0.1,0.5,0.1,'#5a4a3a',-0.3,0.25,-0.45,'legBR');
      g.userData.h=1.3; break;
    case 'clucker': {
      add(0.45,0.45,0.55,'#f2f2ec',0,0.5,0,'body');
      const ch=add(0.3,0.3,0.3,'#f2f2ec',0,0.78,0.32,'head');
      add(0.1,0.18,0.1,'#e0a93b',0,0.84,0.5);
      add(0.08,0.3,0.08,'#e0a93b',0.12,0.18,0,'legFL');
      add(0.08,0.3,0.08,'#e0a93b',-0.12,0.18,0,'legFR');
      // birds have eyes on the SIDES of the head, not the front
      ch.add(box(0.03,0.07,0.07, M('#1a1a1a'),  0.155,0.05,0.05));
      ch.add(box(0.03,0.07,0.07, M('#1a1a1a'), -0.155,0.05,0.05));
      g.userData._faced=true;
      g.userData.h=0.85; break;
    }
    case 'snuffler':
      add(0.8,0.55,1.0,'#d98a8a',0,0.55,0,'body');
      add(0.45,0.45,0.45,'#d98a8a',0,0.6,0.65,'head');
      add(0.12,0.16,0.06,'#b86a6a',0,0.6,0.88);
      for(const[dx,dz,n] of [[0.25,0.35,'legFL'],[-0.25,0.35,'legFR'],[0.25,-0.35,'legBL'],[-0.25,-0.35,'legBR']]) add(0.12,0.35,0.12,'#7a4a4a',dx,0.18,dz,n);
      g.userData.h=1.0; break;
    case 'hopper': {  // small passive rabbit-like critter
      add(0.5,0.4,0.7,'#b8a48a',0,0.35,0,'body');
      const hh=add(0.34,0.34,0.34,'#c8b49a',0,0.55,0.42,'head');
      add(0.09,0.34,0.06,'#c8b49a',0.11,0.85,0.4);   // ears
      add(0.09,0.34,0.06,'#c8b49a',-0.11,0.85,0.4);
      add(0.13,0.2,0.12,'#9a8468',0.16,0.12,0.22,'legFL');
      add(0.13,0.2,0.12,'#9a8468',-0.16,0.12,0.22,'legFR');
      add(0.14,0.22,0.2,'#9a8468',0.16,0.12,-0.26,'legBL');
      add(0.14,0.22,0.2,'#9a8468',-0.16,0.12,-0.26,'legBR');
      add(0.18,0.18,0.16,'#efe7d8',0,0.42,-0.44);    // fluffy tail
      hh.add(box(0.05,0.06,0.04, M('#1a1a1a'), 0.1,0.03,0.17));   // eyes (front, _faced)
      hh.add(box(0.05,0.06,0.04, M('#1a1a1a'), -0.1,0.03,0.17));
      g.userData._faced=true; g.userData.h=0.7; break;
    }
    case 'crawler': {  // low nocturnal hostile (6-legged skitter)
      add(0.75,0.34,0.95,'#2a2438',0,0.34,0,'body');
      const hd=add(0.42,0.3,0.42,'#1c1828',0,0.4,0.52,'head');
      for(const[dx,dz,n] of [[0.42,0.32,'legFL'],[-0.42,0.32,'legFR'],[0.45,0,null],[-0.45,0,null],[0.42,-0.32,'legBL'],[-0.42,-0.32,'legBR']]) add(0.1,0.3,0.1,'#15121f',dx,0.15,dz,n);
      const em=ME('#c83cff','#c83cff',2.4);
      hd.add(box(0.09,0.06,0.03, em, 0.11,0.02,0.21)); hd.add(box(0.09,0.06,0.03, em, -0.11,0.02,0.21));   // glowing eyes
      g.userData.eyes=true; g.userData._faced=true; g.userData.h=0.7; break;
    }
    case 'shade': {
      add(0.7,1.1,0.5,'#241f33',0,0.95,0,'body');
      const head=add(0.5,0.5,0.5,'#1a1626',0,1.7,0,'head');
      add(0.18,0.5,0.18,'#241f33',0.18,0.25,0,'legFL');
      add(0.18,0.5,0.18,'#241f33',-0.18,0.25,0,'legFR');
      add(0.16,0.7,0.16,'#241f33',0.45,1.0,0,'armL');
      add(0.16,0.7,0.16,'#241f33',-0.45,1.0,0,'armR');
      // angry red glowing eyes slanted inward (furrowed brow) + a wide black maw
      // full of jagged interlocking fangs of uneven length — a snarl, not a smile
      const em=ME('#ff2a14','#ff2a14',2.8);
      const eL=new THREE.Mesh(new THREE.BoxGeometry(0.15,0.06,0.03), em); eL.position.set(-0.12,0.08,0.255); eL.rotation.z=-0.55; head.add(eL);
      const eR=new THREE.Mesh(new THREE.BoxGeometry(0.15,0.06,0.03), em); eR.position.set(0.12,0.08,0.255); eR.rotation.z=0.55; head.add(eR);
      head.add(box(0.52,0.2,0.02, M('#060406'), 0,-0.11,0.248));   // black maw
      for(let i=0;i<8;i++){
        const tx=(i-3.5)*0.06;
        const top=0.05+(i%2?0.07:0.0);            // upper fangs hang down, alternating long
        head.add(box(0.035,top,0.02, M('#f2f2e8'), tx, -0.03-top/2, 0.256));
        const bot=0.04+(i%2?0.0:0.06);            // lower fangs rise up between them
        head.add(box(0.03,bot,0.02, M('#d8d8cc'), tx+0.03, -0.19+bot/2, 0.256));
      }
      g.userData.eyes=true; g.userData._faced=true; g.userData.h=1.9; break;
    }
    case 'spitter':
      add(0.8,0.7,0.8,'#5a7d4a',0,0.55,0,'body');
      add(0.5,0.4,0.5,'#6e9159',0,1.0,0.2,'head');
      add(0.2,0.4,0.2,'#4a6a3a',0.25,0.2,0,'legFL');
      add(0.2,0.4,0.2,'#4a6a3a',-0.25,0.2,0,'legFR');
      g.userData.h=1.2; break;
    case 'burrower':
      add(0.6,0.45,0.9,'#7a5a3a',0,0.4,0,'body');
      add(0.4,0.4,0.4,'#6a4a2a',0,0.42,0.55,'head');
      add(0.12,0.25,0.12,'#5a3a1a',0.2,0.12,0.3,'legFL');
      add(0.12,0.25,0.12,'#5a3a1a',-0.2,0.12,0.3,'legFR');
      g.userData.h=0.85; break;
    case 'brute':
      add(1.3,1.4,1.0,'#3a2f4a',0,1.1,0,'body');
      add(0.7,0.7,0.7,'#2a2238',0,2.05,0,'head');
      add(0.35,0.9,0.35,'#3a2f4a',0.75,1.05,0,'armL');
      add(0.35,0.9,0.35,'#3a2f4a',-0.75,1.05,0,'armR');
      add(0.35,0.7,0.35,'#3a2f4a',0.35,0.35,0,'legFL');
      add(0.35,0.7,0.35,'#3a2f4a',-0.35,0.35,0,'legFR');
      g.userData.h=2.4; break;
    case 'player': {
      // classic blocky humanoid (Minecraft-Steve proportions), arms hanging
      // straight down flush at the sides — a clean base for custom textures.
      add(0.5,0.62,0.26,'#1ec7c0',0,0.85,0,'body');                 // teal shirt torso
      const head=add(0.46,0.46,0.46,'#d8b48a',0,1.38,0,'head');     // head
      // hair + face parented to the head so they track head rotation
      head.add(box(0.48,0.1,0.48, M('#5a3a22'), 0,0.22,0));         // hair top
      head.add(box(0.48,0.34,0.08, M('#5a3a22'), 0,0.05,-0.2));     // hair back
      head.add(box(0.1,0.09,0.02, M('#ffffff'), -0.1,0.05,0.235));  // eye white L
      head.add(box(0.1,0.09,0.02, M('#ffffff'),  0.1,0.05,0.235));  // eye white R
      head.add(box(0.05,0.09,0.03, M('#3a2a6a'), -0.12,0.05,0.245));// pupil L
      head.add(box(0.05,0.09,0.03, M('#3a2a6a'),  0.12,0.05,0.245));// pupil R
      head.add(box(0.14,0.04,0.03, M('#7a4a36'), 0,-0.1,0.235));    // mouth
      add(0.15,0.62,0.15,'#d8b48a',0.325,0.85,0,'armL');            // arms hang at sides
      add(0.15,0.62,0.15,'#d8b48a',-0.325,0.85,0,'armR');
      add(0.18,0.45,0.18,'#3a3fb0',0.12,0.33,0,'legFL');            // blue pants
      add(0.18,0.45,0.18,'#3a3fb0',-0.12,0.33,0,'legFR');
      add(0.16,0.1,0.24,'#8a8a92',0.12,0.06,0.02,'footL');          // grey shoes (narrow so the two split apart)
      add(0.16,0.1,0.24,'#8a8a92',-0.12,0.06,0.02,'footR');
      g.userData.h=1.7; break;
    }
    case 'settler': {
      // same blocky humanoid build as the player, robed colours + a big nose
      add(0.5,0.62,0.26,'#6b5a8a',0,0.85,0,'body');                 // robe torso
      const head=add(0.46,0.46,0.46,'#c7a079',0,1.38,0,'head');     // head
      head.add(box(0.48,0.1,0.48, M('#3a2a1a'), 0,0.22,0));         // hair/cap top
      head.add(box(0.48,0.34,0.08, M('#3a2a1a'), 0,0.05,-0.2));     // hair back
      head.add(box(0.09,0.08,0.02, M('#ffffff'), -0.12,0.06,0.235));// eye white L
      head.add(box(0.09,0.08,0.02, M('#ffffff'),  0.12,0.06,0.235));// eye white R
      head.add(box(0.04,0.08,0.03, M('#241a14'), -0.12,0.06,0.245));// pupil L
      head.add(box(0.04,0.08,0.03, M('#241a14'),  0.12,0.06,0.245));// pupil R
      head.add(box(0.16,0.2,0.22, M('#b07d5a'), 0,-0.04,0.26));     // HUGE nose, juts out
      head.add(box(0.14,0.04,0.03, M('#7a4a36'), 0,-0.2,0.235));    // mouth
      add(0.15,0.62,0.15,'#c7a079',0.325,0.85,0,'armL');            // arms at sides
      add(0.15,0.62,0.15,'#c7a079',-0.325,0.85,0,'armR');
      add(0.18,0.45,0.18,'#4a3f5e',0.12,0.33,0,'legFL');            // robe legs
      add(0.18,0.45,0.18,'#4a3f5e',-0.12,0.33,0,'legFR');
      add(0.2,0.1,0.24,'#5a4a3a',0.12,0.06,0.02,'footL');           // shoes
      add(0.2,0.1,0.24,'#5a4a3a',-0.12,0.06,0.02,'footR');
      g.userData.h=1.7; break;
    }
    case 'guard':
      add(0.62,0.85,0.4,'#5a5a62',0,0.88,0,'body');
      add(0.45,0.45,0.45,'#c9a878',0,1.5,0,'head');
      add(0.5,0.18,0.5,'#3a3a42',0,1.72,0); // helmet brim
      add(0.18,0.72,0.18,'#5a5a62',0.3,0.72,0,'armL');
      add(0.2,0.75,0.2,'#5a5a62',-0.3,0.72,0.05,'armR');
      add(0.06,0.5,0.06,'#8a6638',-0.3,1.05,0.25); // spear haft on the weapon arm
      add(0.18,0.5,0.18,'#3a3a42',0.14,0.25,0,'legFL');
      add(0.18,0.5,0.18,'#3a3a42',-0.14,0.25,0,'legFR');
      g.userData.h=1.95; break;
    case 'fish':
      add(0.22,0.18,0.45,'#5a8fc2',0,0,0.06,'body');
      add(0.18,0.16,0.18,'#3a6a96',0,0,-0.32,'tail');
      add(0.1,0.05,0.12,'#3a6a96',0,0.12,0.18);
      g.userData.h=0.3; break;
    case 'gelcube': {
      const gmat=new THREE.MeshLambertMaterial({color:'#6fd6c4', transparent:true, opacity:0.65});
      const body=new THREE.Mesh(new THREE.BoxGeometry(0.8,0.8,0.8), gmat); body.position.set(0,0.42,0);
      g.userData.parts.body=body; g.add(body);
      g.userData.h=0.85; break;
    }
    case 'frostling':
      add(0.6,0.45,0.8,'#eef3f5',0,0.4,0,'body');
      add(0.35,0.35,0.35,'#eef3f5',0,0.55,0.5,'head');
      add(0.08,0.3,0.08,'#cfd9dc',0.2,0.18,0.3,'legFL');
      add(0.08,0.3,0.08,'#cfd9dc',-0.2,0.18,0.3,'legFR');
      add(0.08,0.3,0.08,'#cfd9dc',0.2,0.18,-0.3,'legBL');
      add(0.08,0.3,0.08,'#cfd9dc',-0.2,0.18,-0.3,'legBR');
      g.userData.h=0.75; break;
    case 'sandskink':
      add(0.35,0.25,0.9,'#d4b56a',0,0.18,0,'body');
      add(0.22,0.2,0.25,'#c2a155',0,0.2,0.55,'head');
      add(0.06,0.18,0.06,'#b3914a',0.13,0.1,0.2,'legFL');
      add(0.06,0.18,0.06,'#b3914a',-0.13,0.1,0.2,'legFR');
      add(0.06,0.18,0.06,'#b3914a',0.13,0.1,-0.2,'legBL');
      add(0.06,0.18,0.06,'#b3914a',-0.13,0.1,-0.2,'legBR');
      add(0.12,0.12,0.5,'#c2a155',0,0.18,-0.65,'tail');
      g.userData.h=0.45; break;
    case 'dog':
      add(0.45,0.4,0.75,'#8a6a48',0,0.4,0,'body');
      add(0.3,0.3,0.3,'#8a6a48',0,0.5,0.45,'head');
      add(0.1,0.15,0.1,'#6e5236',0.12,0.62,0.5);
      add(0.1,0.15,0.1,'#6e5236',-0.12,0.62,0.5);
      add(0.09,0.3,0.09,'#6e5236',0.16,0.2,0.28,'legFL');
      add(0.09,0.3,0.09,'#6e5236',-0.16,0.2,0.28,'legFR');
      add(0.09,0.3,0.09,'#6e5236',0.16,0.2,-0.28,'legBL');
      add(0.09,0.3,0.09,'#6e5236',-0.16,0.2,-0.28,'legBR');
      add(0.08,0.08,0.3,'#8a6a48',0,0.5,-0.45,'tail');
      g.userData.h=0.7; break;
    case 'cat':
      add(0.32,0.3,0.55,'#444',0,0.3,0,'body');
      add(0.22,0.22,0.22,'#444',0,0.4,0.32,'head');
      add(0.07,0.1,0.04,'#333',0.08,0.5,0.36);
      add(0.07,0.1,0.04,'#333',-0.08,0.5,0.36);
      add(0.06,0.22,0.06,'#333',0.1,0.12,0.18,'legFL');
      add(0.06,0.22,0.06,'#333',-0.1,0.12,0.18,'legFR');
      add(0.06,0.22,0.06,'#333',0.1,0.12,-0.18,'legBL');
      add(0.06,0.22,0.06,'#333',-0.1,0.12,-0.18,'legBR');
      add(0.06,0.06,0.35,'#444',0,0.4,-0.35,'tail');
      g.userData.h=0.5; break;
    case 'wisp': {
      // darker, sinister body with a hooded head, angry glowing eyes, a jagged
      // tooth grin and long clawed arms — built as a custom scary face
      const wmat=new THREE.MeshLambertMaterial({color:'#1c0e30', transparent:true, opacity:0.88, emissive:0x33105a, emissiveIntensity:0.45});
      const body=add(0.42,1.25,0.42,'#1c0e30',0,0.9,0,'body'); body.material=wmat;
      const head=add(0.42,0.42,0.42,'#120820',0,1.6,0,'head');
      add(0.47,0.16,0.47,'#0a0414',0,1.85,0);                 // hood peak over the head
      add(0.47,0.42,0.1,'#0a0414',0,1.6,-0.2);                // hood back
      const em=ME('#ff2a14','#ff2a14',2.6);
      const eL=new THREE.Mesh(new THREE.BoxGeometry(0.13,0.06,0.03), em); eL.position.set(-0.1,0.05,0.215); eL.rotation.z=0.55; head.add(eL);
      const eR=new THREE.Mesh(new THREE.BoxGeometry(0.13,0.06,0.03), em); eR.position.set(0.1,0.05,0.215); eR.rotation.z=-0.55; head.add(eR);
      for(let i=0;i<5;i++){ head.add(box(0.035,0.07,0.02, M('#e6e6e6'), -0.11+i*0.055,-0.13,0.215)); } // jagged teeth
      add(0.1,0.72,0.1,'#120820',0.29,0.92,0,'armL');         // long thin arms
      add(0.1,0.72,0.1,'#120820',-0.29,0.92,0,'armR');
      for(const sx of [0.29,-0.29]){ for(let c=0;c<3;c++) add(0.03,0.12,0.03,'#0a0414',sx-0.04+c*0.04,0.5,0.04); } // claws
      g.userData.eyes=true; g.userData._faced=true; g.userData.h=2.0; break;
    }
    case 'bomber':
      add(0.75,0.75,0.75,'#5a7a3a',0,0.5,0,'body');
      add(0.4,0.4,0.4,'#6a8a4a',0,0.95,0.18,'head');
      add(0.18,0.4,0.18,'#4a6a2a',0.22,0.2,0,'legFL');
      add(0.18,0.4,0.18,'#4a6a2a',-0.22,0.2,0,'legFR');
      g.userData.h=1.0; break;
  }
  // unified face: give EVERY creature the same two-eye look as the player. Use
  // the head if it has one, else the body (gelcube/fish). Glowing-eye mobs keep
  // their menace via emissive red pupils instead of dark ones. Eyes are parented
  // to the face part so they track head/body movement.
  const _face = g.userData.parts && (g.userData.parts.head || g.userData.parts.body);
  if(_face && !g.userData._faced && kind!=='player' && kind!=='settler' && _face.geometry && _face.geometry.parameters){
    const p=_face.geometry.parameters;
    const ez=p.depth/2+0.01, ex=p.width*0.22, ey=p.height*0.12;
    const ew=Math.max(0.05,p.width*0.18), eh=Math.max(0.05,Math.min(p.height*0.2,p.width*0.2));
    const glow=!!g.userData.eyes;
    _face.add(box(ew,eh,0.02, M('#ffffff'), -ex,ey,ez));
    _face.add(box(ew,eh,0.02, M('#ffffff'),  ex,ey,ez));
    const pmat=()=> glow ? ME('#ff5a3c','#ff5a3c',2) : M('#1a1a1a');
    _face.add(box(ew*0.55,eh*0.9,0.03, pmat(), -ex,ey,ez+0.01));
    _face.add(box(ew*0.55,eh*0.9,0.03, pmat(),  ex,ey,ez+0.01));
    g.userData._faced=true;
  }
  // fallback red glow bar only for glow mobs that somehow got no face part
  if(g.userData.eyes && !g.userData._faced){ const e=new THREE.Mesh(new THREE.BoxGeometry(0.5,0.12,0.05), ME('#ff5a3c','#ff5a3c',2)); e.position.set(0,1.72,0.26); g.add(e); }
  return g;
}

/* =====================================================================
   Item / block icon rendering -> data URLs for HUD slots. Block icons
   are drawn as a pseudo-3D cube from the atlas tiles; tools/items get
   bespoke silhouettes so they never look like generic squares.
   ===================================================================== */
function tileCanvas(name){
  const c=document.createElement('canvas'); c.width=c.height=TILE;
  const x=c.getContext('2d'); x.imageSmoothingEnabled=false; TILES[name](x); return c;
}

/* =====================================================================
   Block-break crack overlay — 8 progressively-cracked CanvasTextures
   (deterministic per stage, generated once and cached) replacing a flat
   darkening box with an actual fracture pattern radiating from the center.
   ===================================================================== */
let _crackTexCache=null;
function crackTexture(stage){
  if(!_crackTexCache) _crackTexCache=[];
  if(_crackTexCache[stage]) return _crackTexCache[stage];
  const S=64, c=document.createElement('canvas'); c.width=c.height=S;
  const x=c.getContext('2d'); x.imageSmoothingEnabled=false;
  // simple seeded RNG so each stage is stable across re-renders
  let seed=stage*97+13; const rnd=()=>{ seed=(seed*1103515245+12345)&0x7fffffff; return (seed%1000)/1000; };
  const cracks=2+stage; // more fracture lines as the block nears breaking
  x.strokeStyle='rgba(10,10,10,0.85)';
  for(let i=0;i<cracks;i++){
    let px=S/2+(rnd()-0.5)*10, py=S/2+(rnd()-0.5)*10;
    x.lineWidth=1+rnd()*1.5; x.beginPath(); x.moveTo(px,py);
    const segs=3+Math.floor(rnd()*3);
    for(let s=0;s<segs;s++){ px+=(rnd()-0.5)*22; py+=(rnd()-0.5)*22; x.lineTo(px,py); }
    x.stroke();
  }
  const tex=crispTexture(new THREE.CanvasTexture(c)); tex.needsUpdate=true;
  _crackTexCache[stage]=tex; return tex;
}
function blockIcon(b){
  const S=48, c=document.createElement('canvas'); c.width=c.height=S;
  const ctx=c.getContext('2d'); ctx.imageSmoothingEnabled=false;
  // plants / cross blocks: draw the tile flat & centred
  if(b.render==='cross'){ const img=tileCanvas(blockTile(b,0)); ctx.drawImage(img,3,3,42,42); return c; }
  const top=tileCanvas(blockTile(b,2)), side=tileCanvas(blockTile(b,0)), side2=tileCanvas(blockTile(b,4));
  // simple isometric-ish faces
  function face(img, pts, dark){
    ctx.save();
    // affine map of the tile image onto a parallelogram (approx via 2 triangles is overkill; use transform)
    ctx.beginPath();ctx.moveTo(pts[0][0],pts[0][1]);ctx.lineTo(pts[1][0],pts[1][1]);ctx.lineTo(pts[2][0],pts[2][1]);ctx.lineTo(pts[3][0],pts[3][1]);ctx.closePath();ctx.clip();
    const minx=Math.min(...pts.map(p=>p[0])),miny=Math.min(...pts.map(p=>p[1]));
    const w=Math.max(...pts.map(p=>p[0]))-minx, h=Math.max(...pts.map(p=>p[1]))-miny;
    ctx.drawImage(img,minx,miny,w,h);
    if(dark){ctx.fillStyle=`rgba(0,0,0,${dark})`;ctx.fillRect(minx,miny,w,h);}
    ctx.restore();
  }
  const cx=24;
  face(top,  [[cx,4],[44,15],[cx,26],[4,15]], 0);
  face(side2,[[4,15],[cx,26],[cx,46],[4,36]], 0.28);
  face(side, [[cx,26],[44,15],[44,36],[cx,46]], 0.15);
  return c;
}
function itemIcon(item){
  // tools/weapons/foods get drawn shapes; blocks delegate to blockIcon
  const S=48,c=document.createElement('canvas');c.width=c.height=S;const x=c.getContext('2d');x.imageSmoothingEnabled=false;
  const handle='#8a6638';
  function stick(){ x.strokeStyle=handle;x.lineWidth=4;x.beginPath();x.moveTo(12,40);x.lineTo(30,18);x.stroke(); }
  // head color keyed off the tool's material (id is `<material>_<icon>`) — a
  // tier index can't tell stone from copper (both tier 2) and was off-by-one,
  // making iron look gold and gold look like crystal.
  const headByMat={wood:'#9a6b3a',stone:'#9a9da2',copper:'#c87f4a',iron:'#cfd2d6',gold:'#f4d35e',crystal:'#9ce6ef',wool:'#e8e2d4'};
  const head = item.tier ? (headByMat[(item.id||'').split('_')[0]] || '#cfd2d6') : '#cfd2d6';
  const R=(x0,y0,w,h,col)=>{ x.fillStyle=col; x.fillRect(x0|0,y0|0,w|0,h|0); };
  const P=(pts,col)=>{ x.fillStyle=col; x.beginPath(); x.moveTo(pts[0][0],pts[0][1]); for(let i=1;i<pts.length;i++) x.lineTo(pts[i][0],pts[i][1]); x.closePath(); x.fill(); };
  const itemShadow=()=>{ R(12,39,24,3,'rgba(0,0,0,.28)'); R(17,42,14,2,'rgba(0,0,0,.18)'); };
  function voxelBox(cx,cy,w,h,d,top,left,right){
    P([[cx,cy-d],[cx+w/2,cy],[cx,cy+d],[cx-w/2,cy]],top);
    P([[cx-w/2,cy],[cx,cy+d],[cx,cy+d+h],[cx-w/2,cy+h]],left);
    P([[cx+w/2,cy],[cx,cy+d],[cx,cy+d+h],[cx+w/2,cy+h]],right);
  }
  function blockFruit(base,dark,hi,leaf='#3d7a32'){
    itemShadow(); R(16,18,17,19,dark); R(13,22,23,13,base); R(18,15,12,24,base); R(19,18,5,5,hi);
    R(23,10,4,7,'#5a3f24'); R(27,11,8,4,leaf); R(34,14,4,3,'#2f6d32');
  }
  function drumstick(base,dark,bone){
    itemShadow(); R(16,19,17,17,dark); R(13,22,22,13,base); R(20,16,12,20,base); R(30,31,11,5,bone); R(36,28,5,10,bone); R(18,20,5,4,'rgba(255,255,255,.25)');
  }
  function fishIcon(body,fin){
    itemShadow(); P([[9,26],[19,17],[34,19],[41,26],[34,33],[19,35]],body); P([[34,26],[45,16],[44,36]],fin);
    R(16,20,8,3,'rgba(255,255,255,.25)'); R(35,25,3,3,'#1b2630');
  }
  function bladeEdge(poly, dark, light){ P(poly,dark); const inset=poly.map(([px,py])=>[px+1,py+1]); P(inset,light); }
  function toolHandle(){ P([[13,39],[17,43],[34,24],[30,20]],'#4a3018'); P([[16,38],[18,40],[34,23],[32,21]],'#9a6b3a'); }
  function headHi(col){ return item.id&&item.id.startsWith('crystal')?'#d8fbff':item.id&&item.id.startsWith('gold')?'#fff2a8':item.id&&item.id.startsWith('iron')?'#ffffff':col; }
  function armorPlate(x0,y0,w,h,col){
    R(x0+2,y0+3,w,h,'rgba(0,0,0,.28)'); R(x0,y0,w,h,col); R(x0+2,y0+2,w-4,3,'rgba(255,255,255,.35)'); R(x0+w-4,y0+4,3,h-6,'rgba(0,0,0,.2)');
  }
  switch(item.icon){
    case 'pickaxe': itemShadow(); toolHandle(); bladeEdge([[11,18],[21,11],[39,10],[43,14],[29,18],[18,23]],'#303238',head); R(25,16,5,6,headHi(head)); break;
    case 'axe': itemShadow(); toolHandle(); bladeEdge([[27,10],[43,14],[42,25],[32,29],[26,22]],'#303238',head); R(31,14,8,4,headHi(head)); R(28,25,5,5,'#4a3018'); break;
    case 'shovel': itemShadow(); toolHandle(); bladeEdge([[27,8],[38,10],[37,20],[32,27],[27,20]],'#303238',head); R(30,11,5,5,headHi(head)); break;
    case 'sword': itemShadow(); P([[12,42],[17,45],[40,17],[37,13]],'#303238'); P([[17,38],[21,42],[41,15],[38,12]],head); P([[26,30],[33,20],[37,16],[30,29]],headHi(head)); R(14,35,14,5,'#caa45a'); R(11,39,8,5,'#6b4a2a'); break;
    case 'stick': itemShadow(); P([[15,41],[19,43],[36,15],[32,13]],'#4a3018'); P([[18,40],[20,41],[35,15],[33,14]],'#b98245'); R(25,25,4,4,'#6b4a2a'); break;
    case 'shears': itemShadow(); bladeEdge([[12,37],[17,40],[35,16],[31,14]],'#303238','#cfd2d6'); bladeEdge([[34,38],[38,35],[18,14],[15,18]],'#303238','#cfd2d6'); R(22,26,5,5,'#6a6d72'); x.strokeStyle='#9d7a35';x.lineWidth=3;x.beginPath();x.arc(14,40,5,0,7);x.arc(37,40,5,0,7);x.stroke(); break;
    case 'meat_raw': drumstick('#c2655e','#7c3334','#e8e2d4'); break;
    case 'meat_cooked': drumstick('#8a4f33','#4f2a1d','#caa45a'); R(21,25,12,3,'#c07a3d'); break;
    case 'fish_raw': fishIcon('#7fa6c9','#517fa2'); break;
    case 'fish_cooked': fishIcon('#c98a55','#8f5a35'); R(18,27,13,3,'#e0b36a'); break;
    case 'gel': x.fillStyle='rgba(111,214,196,0.75)';x.beginPath();x.roundRect?x.roundRect(12,14,24,24,6):x.fillRect(12,14,24,24);x.fill(); x.strokeStyle='#3a8a7a';x.lineWidth=2;x.strokeRect(12,14,24,24); break;
    case 'armor_head': itemShadow(); P([[14,20],[19,12],[29,12],[35,20],[33,33],[15,33]],'#303238'); P([[16,20],[20,14],[28,14],[32,20],[31,31],[17,31]],head); R(18,24,12,4,'#111827'); R(20,16,8,3,headHi(head)); break;
    case 'armor_chest': itemShadow(); armorPlate(15,14,18,24,head); armorPlate(8,17,8,14,head); armorPlate(32,17,8,14,head); R(18,14,12,5,headHi(head)); R(21,25,6,10,'rgba(0,0,0,.18)'); break;
    case 'armor_legs': itemShadow(); armorPlate(15,10,8,29,head); armorPlate(25,10,8,29,head); R(15,10,18,5,headHi(head)); R(22,15,4,24,'#1f293740'); break;
    case 'armor_boots': itemShadow(); armorPlate(14,17,9,18,head); armorPlate(25,17,9,18,head); R(12,31,13,7,'#303238'); R(24,31,13,7,'#303238'); R(16,19,5,3,headHi(head)); R(27,19,5,3,headHi(head)); break;
    case 'bow': itemShadow(); P([[16,10],[22,13],[26,24],[22,36],[16,39],[20,25]],'#4a3018'); P([[18,12],[21,14],[24,24],[21,34],[18,36],[21,25]],'#b98245'); x.strokeStyle='#d8d2bd';x.lineWidth=2;x.beginPath();x.moveTo(18,12);x.lineTo(18,36);x.stroke(); R(29,22,8,3,'#c2473f'); break;
    case 'arrow': itemShadow(); P([[10,38],[13,41],[36,18],[33,15]],'#8a6638'); P([[35,10],[43,15],[35,20]],head); R(14,35,5,3,'#c2473f'); R(11,39,5,3,'#d8d2bd'); break;
    case 'rod': itemShadow(); P([[13,41],[17,43],[36,13],[32,11]],'#4a3018'); P([[16,40],[18,41],[34,14],[32,13]],'#b98245'); x.strokeStyle='#d8d2bd';x.lineWidth=1.5;x.beginPath();x.moveTo(33,14);x.quadraticCurveTo(43,16,40,31);x.stroke(); R(36,31,5,5,'#6a6d72'); R(39,36,3,4,'#9d7a35'); break;
    case 'potion': itemShadow(); R(20,8,8,8,'#6b4a2a'); R(18,15,12,4,'#dfe6f0'); R(15,20,18,17,item.potColor||'#5ec46a'); R(18,18,12,22,'rgba(223,230,240,.38)'); R(18,23,5,4,'rgba(255,255,255,.45)'); R(15,37,18,3,'#303238'); break;
    case 'apple': blockFruit('#cf3b3b','#8e2525','#f06b58'); break;
    case 'carrot': itemShadow(); P([[14,17],[35,21],[22,42]],'#a54817'); P([[16,17],[34,20],[23,38]],'#e87822'); R(20,9,5,10,'#4f9a3a'); R(27,10,5,9,'#3f7a32'); R(20,23,8,3,'#f6a044'); break;
    case 'golden_carrot': itemShadow(); P([[14,17],[35,21],[22,42]],'#9a6b18'); P([[16,17],[34,20],[23,38]],'#f4d35e'); R(20,9,5,10,'#4f9a3a'); R(27,10,5,9,'#3f7a32'); R(20,23,8,3,'#fff2a8'); break;
    case 'cooked_carrot': itemShadow(); P([[14,17],[35,21],[22,42]],'#813515'); P([[17,18],[33,21],[23,37]],'#c85818'); R(21,10,10,7,'#3f7a32'); R(20,25,10,3,'#e07030'); break;
    case 'potato': itemShadow(); R(15,18,20,18,'#7a4e2a'); R(18,15,16,24,'#b98045'); R(20,20,3,3,'#6b4a2a'); R(29,31,3,3,'#6b4a2a'); R(19,17,6,4,'#d0a067'); break;
    case 'baked_potato': itemShadow(); R(15,18,20,18,'#56331d'); R(18,15,16,24,'#7d4c2a'); R(18,24,14,7,'#e8d2a2'); R(21,26,8,3,'#f5dfb2'); break;
    case 'tomato': blockFruit('#d63a32','#8d211d','#f07165','#3d8a32'); R(17,17,15,4,'#2f6d32'); break;
    case 'cooked_tomato': blockFruit('#a92822','#641815','#f0b070','#355f2d'); R(18,28,14,4,'#d86a4c'); break;
    case 'beetroot': blockFruit('#8f2552','#551733','#d15b87','#4f9a3a'); R(18,10,4,10,'#4f9a3a'); R(27,9,5,12,'#3f7a32'); break;
    case 'cooked_beetroot': blockFruit('#632044','#351127','#d78a9c','#3f6f32'); R(19,28,11,4,'#a94f72'); break;
    case 'wheat': itemShadow(); for(let i=0;i<5;i++){ R(15+i*4,22,3,18,'#8a6638'); R(12+i*5,14+(i%2)*3,6,9,'#caa45a'); R(15+i*4,12+(i%2)*3,5,7,'#d6b65f'); } break;
    case 'bread': itemShadow(); voxelBox(24,19,28,13,7,'#e0b36a','#8a552c','#b98245'); R(14,24,5,3,'#f0c982'); R(23,21,5,3,'#f0c982'); R(32,24,4,3,'#f0c982'); break;
    case 'cookie': itemShadow(); voxelBox(24,17,27,10,9,'#b98245','#6b4a2a','#9a6b3a'); for(const p of [[17,21],[25,18],[31,27],[22,30]]) R(p[0],p[1],3,3,'#3d2413'); break;
    case 'pie': itemShadow(); voxelBox(24,18,30,12,8,'#d39a4a','#7b4a2a','#b98245'); R(25,21,9,6,'#c2473f'); R(16,25,6,3,'#f0c982'); break;
    case 'melon_slice': itemShadow(); P([[10,33],[24,12],[39,33],[34,38],[14,38]],'#2f6d32'); P([[15,32],[24,17],[34,32],[31,35],[17,35]],'#e45c5c'); R(22,27,2,3,'#222'); R(28,30,2,3,'#222'); break;
    case 'cake': itemShadow(); voxelBox(24,17,30,14,8,'#f0e6cf','#9a6b3a','#d2a05a'); R(13,19,22,5,'#efe7d2'); R(17,18,4,4,'#c2473f'); R(28,19,4,4,'#c2473f'); R(19,28,19,4,'#7b4a2a'); break;
    case 'sugar': itemShadow(); R(14,22,22,14,'#dfe6f0'); R(17,17,16,24,'#ffffff'); R(20,20,5,5,'#eef5ff'); R(28,29,4,4,'#cfd8e3'); break;
    case 'paper': itemShadow(); P([[13,13],[33,9],[38,35],[18,39]],'#c4a978'); P([[15,14],[32,11],[36,33],[19,37]],'#efe7d2'); R(20,20,11,2,'#9d8b6e'); R(21,25,10,2,'#9d8b6e'); R(21,30,7,2,'#9d8b6e'); break;
    case 'book': itemShadow(); P([[12,13],[27,17],[37,12],[37,35],[27,41],[12,36]],'#4a2a1a'); P([[14,15],[26,18],[26,39],[14,34]],'#7b2d2d'); P([[28,18],[35,15],[35,33],[28,38]],'#efe7d2'); R(17,20,7,2,'#caa45a'); R(17,25,6,2,'#caa45a'); break;
    case 'leather': itemShadow(); P([[13,18],[21,12],[28,16],[36,13],[39,24],[33,34],[24,32],[16,37],[10,28]],'#4a2a1a'); P([[15,20],[22,15],[29,18],[34,16],[36,24],[31,31],[23,29],[17,34],[13,28]],'#8a552c'); R(20,20,5,4,'#b98245'); break;
    case 'sugarcane': itemShadow(); for(let i=0;i<3;i++){ R(16+i*7,11+i*2,5,28,'#2f6d32'); R(17+i*7,12+i*2,3,7,'#78b75c'); R(16+i*7,25+i*2,5,2,'#1f4f24'); } break;
    case 'bowl': itemShadow(); P([[13,25],[35,25],[31,38],[17,38]],'#4a2a1a'); P([[15,23],[33,23],[36,27],[12,27]],'#b98245'); R(18,27,12,5,'#6b4a2a'); break;
    case 'stew': itemShadow(); P([[12,24],[36,24],[32,38],[16,38]],'#4a2a1a'); P([[14,22],[34,22],[37,27],[11,27]],'#b98245'); R(16,24,16,6,item.stewColor||'#8a552c'); R(21,25,4,3,'rgba(255,255,255,.25)'); break;
    case 'egg': x.fillStyle='#efe7d2';x.beginPath();x.ellipse(24,26,11,14,0,0,7);x.fill(); break;
    case 'fiber': x.strokeStyle='#a9b06a';x.lineWidth=2;for(let i=0;i<5;i++){x.beginPath();x.moveTo(14+i*4,40);x.lineTo(18+i*4,12);x.stroke();} break;
    case 'wool': x.fillStyle='#e8e2d4';x.beginPath();x.arc(20,26,9,0,7);x.arc(30,24,9,0,7);x.arc(26,32,8,0,7);x.fill(); break;
    case 'coal': x.fillStyle='#222';x.beginPath();x.arc(24,26,12,0,7);x.fill(); x.fillStyle='#3a3a3a';x.fillRect(18,20,4,4); break;
    case 'ingot': x.fillStyle=item.col||'#cfd2d6';x.beginPath();x.moveTo(12,30);x.lineTo(36,30);x.lineTo(40,40);x.lineTo(8,40);x.closePath();x.fill(); x.fillStyle='rgba(255,255,255,.3)';x.fillRect(14,31,20,2); break;
    case 'crystal': x.fillStyle='#9ce6ef';x.beginPath();x.moveTo(24,8);x.lineTo(38,26);x.lineTo(24,44);x.lineTo(10,26);x.closePath();x.fill(); x.fillStyle='rgba(255,255,255,.4)';x.beginPath();x.moveTo(24,8);x.lineTo(24,44);x.lineTo(18,26);x.closePath();x.fill(); break;
    case 'seeds': x.fillStyle='#caa45a';for(let i=0;i<6;i++){x.beginPath();x.ellipse(14+(i%3)*9,20+((i/3)|0)*10,3,4,0,0,7);x.fill();} break;
    case 'flint': itemShadow(); P([[14,18],[27,11],[38,22],[31,36],[17,34],[10,26]],'#1f2933'); P([[17,19],[27,13],[34,22],[29,32],[18,31],[13,26]],'#59616c'); R(23,17,7,3,'#8c949e'); break;
    case 'string': itemShadow(); x.strokeStyle='#d8d2bd';x.lineWidth=2;for(let i=0;i<3;i++){x.beginPath();x.moveTo(13,19+i*6);x.bezierCurveTo(22,10+i*6,31,32-i*4,39,20+i*5);x.stroke();} break;
    case 'flint_steel': itemShadow(); P([[12,36],[30,14],[35,17],[19,39]],'#303238'); P([[25,13],[40,19],[36,27],[27,24]],'#cfd2d6'); R(29,16,6,3,'#ffffff'); P([[34,31],[39,24],[42,34]],'#e87822'); R(36,30,4,7,'#f4d35e'); break;
    case 'rover': itemShadow(); R(10,25,29,11,'#303238'); R(14,20,18,7,'#6a6d72'); R(35,27,5,6,'#303238'); R(14,32,6,6,'#111827'); R(31,32,6,6,'#111827'); R(17,22,8,3,'#9ce6ef'); R(27,25,5,3,'#cfd2d6'); break;
    case 'neuralink': itemShadow(); voxelBox(24,18,24,10,7,'#dfe6f0','#6a6d72','#9ce6ef'); R(20,16,3,3,'#5ec4e8'); R(25,17,3,3,'#7ad65a'); R(30,19,3,3,'#c8503a'); x.strokeStyle='#9ce6ef';x.lineWidth=2;x.beginPath();x.moveTo(14,30);x.quadraticCurveTo(24,40,35,31);x.stroke(); break;
    case 'shard': itemShadow(); P([[24,8],[38,26],[24,44],[10,26]],'#b07ad6'); P([[24,8],[24,44],[18,26]],'rgba(255,255,255,.4)'); P([[24,8],[38,26],[30,26]],'#8a52c0'); break;
    case 'circuit': itemShadow(); R(13,15,22,20,'#1f5a2a'); R(15,17,18,16,'#2f7a3a'); x.strokeStyle='#f4d35e';x.lineWidth=1.5;x.beginPath();x.moveTo(16,21);x.lineTo(26,21);x.lineTo(26,29);x.lineTo(32,29);x.moveTo(19,33);x.lineTo(19,24);x.stroke(); R(22,22,5,5,'#303238'); R(29,18,3,3,'#caa45a'); R(17,28,3,3,'#caa45a'); break;
    case 'fuel': itemShadow(); R(15,16,18,22,'#c8503a'); R(15,16,18,22,'#c8503a'); R(17,18,14,18,'#e0683a'); R(18,10,12,6,'#9a3a28'); R(20,7,8,4,'#70747c'); R(19,22,10,4,'#f0c040'); R(24,30,2,6,'#9a3a28'); R(18,19,3,12,'rgba(255,255,255,.22)'); break;
    case 'oxygen': itemShadow(); x.fillStyle='#dfe6f0';x.beginPath();x.roundRect?x.roundRect(17,12,14,26,6):x.fillRect(17,12,14,26);x.fill(); R(19,16,10,18,'#9ce6ef'); R(20,17,4,16,'rgba(255,255,255,.4)'); R(20,8,8,5,'#70747c'); R(22,5,4,4,'#4fe0ff'); R(18,33,12,3,'#9aa0a8'); break;
    default: x.fillStyle='#aab';x.fillRect(12,12,24,24);
  }
  return c;
}

/* Render a special-block model to a small canvas for inventory icons.
   Uses a tiny offscreen WebGL renderer so chests/torches/beds/etc. show
   their real 3D shape instead of a generic square. Cached per model. */
let _iconR=null,_iconS=null,_iconC=null;
function modelIcon(modelName){
  if(modelIcon.cache[modelName]) return modelIcon.cache[modelName];
  if(!_iconR){
    _iconR=new THREE.WebGLRenderer({alpha:true,antialias:true}); _iconR.setSize(64,64); _iconR.setClearColor(0x000000,0);
    _iconS=new THREE.Scene();
    const dl=new THREE.DirectionalLight(0xffffff,1.1); dl.position.set(3,5,4); _iconS.add(dl);
    _iconS.add(new THREE.AmbientLight(0xffffff,0.7));
    _iconC=new THREE.PerspectiveCamera(34,1,0.1,50); _iconC.position.set(1.7,1.5,1.9); _iconC.lookAt(0,0.1,0);
  }
  while(_iconS.children.length>2) _iconS.remove(_iconS.children[2]);
  const obj=SpecialModels[modelName]({});
  const holder=new THREE.Group(); holder.add(obj); obj.position.y=-0.5; _iconS.add(holder);
  _iconR.render(_iconS,_iconC);
  const out=document.createElement('canvas'); out.width=out.height=48;
  out.getContext('2d').drawImage(_iconR.domElement,0,0,48,48);
  modelIcon.cache[modelName]=out; return out;
}
modelIcon.cache={};

/* =====================================================================
   Audio — tiny Web Audio synth. All sounds generated, no files.
   ===================================================================== */
const Audio = {
  ctx:null, vol:0.6,
  init(){ if(!this.ctx){ try{ this.ctx=new (window.AudioContext||window.webkitAudioContext)(); }catch(e){} } },
  blip(freq, dur, type='square', v=0.3){
    if(!this.ctx||this.vol<=0) return;
    const t=this.ctx.currentTime, o=this.ctx.createOscillator(), g=this.ctx.createGain();
    o.type=type; o.frequency.setValueAtTime(freq,t);
    g.gain.setValueAtTime(v*this.vol,t); g.gain.exponentialRampToValueAtTime(0.001,t+dur);
    o.connect(g).connect(this.ctx.destination); o.start(t); o.stop(t+dur);
  },
  noise(dur, v=0.3, hp=400){
    if(!this.ctx||this.vol<=0) return;
    const n=Math.floor(this.ctx.sampleRate*dur), buf=this.ctx.createBuffer(1,n,this.ctx.sampleRate), d=buf.getChannelData(0);
    for(let i=0;i<n;i++) d[i]=(Math.random()*2-1)*(1-i/n);
    const s=this.ctx.createBufferSource(); s.buffer=buf;
    const f=this.ctx.createBiquadFilter(); f.type='highpass'; f.frequency.value=hp;
    const g=this.ctx.createGain(); g.gain.value=v*this.vol;
    s.connect(f).connect(g).connect(this.ctx.destination); s.start();
  },
  play(name){
    switch(name){
      case 'break': this.noise(0.18,0.35,300); break;
      case 'place': this.blip(220,0.08,'square',0.25); break;
      case 'step':  this.noise(0.05,0.12,500); break;
      case 'jump':  this.blip(330,0.09,'sine',0.2); break;
      case 'hit':   this.blip(160,0.08,'sawtooth',0.3); break;
      case 'hurt':  this.blip(120,0.18,'sawtooth',0.35); break;
      case 'mobhurt': this.blip(200,0.12,'square',0.25); break;
      case 'pickup': this.blip(660,0.06,'sine',0.2); setTimeout(()=>this.blip(880,0.06,'sine',0.18),50); break;
      case 'craft': this.blip(440,0.06,'triangle',0.2); setTimeout(()=>this.blip(660,0.08,'triangle',0.2),60); break;
      case 'click': this.blip(520,0.04,'square',0.15); break;
      case 'eat':   this.noise(0.08,0.2,200); break;
      case 'door':  this.blip(180,0.12,'square',0.2); break;
      case 'chest': this.blip(150,0.10,'sine',0.18); setTimeout(()=>this.blip(210,0.08,'sine',0.14),70); break;
      case 'furnace': this.noise(0.5,0.10,180); break;
      case 'splash': this.noise(0.22,0.22,250); break;
    }
  }
  ,
  // soft sustained pad tone (used by the day/night ambience)
  pad(freq,dur,v){ if(!this.ctx||this.vol<=0) return;
    const t=this.ctx.currentTime, o=this.ctx.createOscillator(), g=this.ctx.createGain();
    o.type='sine'; o.frequency.value=freq;
    g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(v*this.vol,t+0.8); g.gain.linearRampToValueAtTime(0,t+dur);
    o.connect(g).connect(this.ctx.destination); o.start(t); o.stop(t+dur+0.1);
  },
  // gentle ambient drone — a quiet pad every ~8-17s, warmer/lower at night, brighter by day
  ambientTick(dt, night){ if(!this.ctx||this.vol<=0) return;
    this._amT=(this._amT||0)-dt; if(this._amT>0) return;
    this._amT=8+Math.random()*9;
    const base = night>0.5 ? 104+Math.random()*28 : 188+Math.random()*44;
    this.pad(base,2.6,0.05); this.pad(base*1.5,2.2,0.032);
  },
  // short bird/insect chirp (sharp attack, quick decay)
  chirp(freq,dur,type,v){ if(!this.ctx||this.vol<=0) return;
    const t=this.ctx.currentTime, o=this.ctx.createOscillator(), g=this.ctx.createGain();
    o.type=type||'sine'; o.frequency.setValueAtTime(freq,t);
    g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(v*this.vol,t+0.01); g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
    o.connect(g).connect(this.ctx.destination); o.start(t); o.stop(t+dur+0.02);
  },
  // occasional wildlife: day birdsong, night crickets + the odd owl hoot
  wildlifeTick(dt, night){ if(!this.ctx||this.vol<=0) return;
    this._wlT=(this._wlT==null?2+Math.random()*4:this._wlT-dt); if(this._wlT>0) return;
    if(night>0.5){ this._wlT=1.5+Math.random()*3;
      for(let i=0;i<3;i++) setTimeout(()=>this.chirp(2300+Math.random()*350,0.04,'triangle',0.045), i*120);   // crickets
      if(Math.random()<0.18){ const f=300; setTimeout(()=>this.chirp(f,0.25,'sine',0.06),0); setTimeout(()=>this.chirp(f*0.85,0.3,'sine',0.06),300); }   // owl hoot
    } else { this._wlT=2.5+Math.random()*5;
      const base=1600+Math.random()*900, n=2+((Math.random()*3)|0);                                          // birdsong trill
      for(let i=0;i<n;i++) setTimeout(()=>this.chirp(base+i*220+Math.random()*120,0.06,'sine',0.06), i*90);
    }
  }
};

/* =====================================================================
   Storage helpers — LocalStorage with graceful failure.
   ===================================================================== */
// Per-world save slots — each world gets its own key so starting a new game
// (or hitting autosave while playing it) can never clobber a previous one.
// ACTIVE_KEY just remembers which world key "Continue" should resume.
const Storage = {
  ACTIVE_KEY:'voxhaven_active_world',
  REGISTRY_KEY:'voxhaven_worlds',
  newWorldKey(seed){ return 'voxhaven_save_'+(seed>>>0)+'_'+(Date.now()%1e7)+'_'+((Math.random()*1e4)|0); },
  setActive(key){ try{ localStorage.setItem(this.ACTIVE_KEY,key); }catch(e){} },
  activeKey(){ try{ return localStorage.getItem(this.ACTIVE_KEY); }catch(e){ return null; } },
  save(key, obj){ try{
    const json=JSON.stringify(obj); const k=key||this.activeKey(); if(!k) return false;
    // atomic + crash-safe: stage to .tmp, read-back verify, promote to the real key, and keep the
    // previous good save as .bak (best-effort — skipped if it would exceed the storage quota) so a
    // crash mid-write or a quota error can never leave the world unrecoverable.
    localStorage.setItem(k+'.tmp', json);
    JSON.parse(localStorage.getItem(k+'.tmp'));
    const prev=localStorage.getItem(k);
    if(prev){ try{ localStorage.setItem(k+'.bak', prev); }catch(_){} }
    localStorage.setItem(k, json);
    localStorage.removeItem(k+'.tmp');
    return true;
  }catch(e){ console.warn('save failed',e); return false; } },
  load(key){ try{
    const k=key||this.activeKey(); if(!k) return null;
    const s=localStorage.getItem(k);
    if(s){ try{ return JSON.parse(s); }catch(e){ /* real key corrupt — fall back to the backup */ } }
    const b=localStorage.getItem(k+'.bak');
    return b?JSON.parse(b):null;
  }catch(e){ return null; } },
  has(){ try{ const k=this.activeKey(); return !!k && !!localStorage.getItem(k); }catch(e){ return false; } },
  clear(){ try{ const k=this.activeKey(); if(k){ localStorage.removeItem(k); localStorage.removeItem(k+'.tmp'); localStorage.removeItem(k+'.bak'); } }catch(e){} },

  // ---------- world registry (for the world-select screen) ----------
  // a small metadata index separate from the actual save blobs, so the menu
  // can list/sort/delete worlds without loading every save into memory
  listWorlds(){ try{ const s=localStorage.getItem(this.REGISTRY_KEY); return s?JSON.parse(s):[]; }catch(e){ return []; } },
  _writeRegistry(list){ try{ localStorage.setItem(this.REGISTRY_KEY, JSON.stringify(list)); }catch(e){} },
  registerWorld(meta){ const list=this.listWorlds(); list.unshift(meta); this._writeRegistry(list); },
  touchWorld(key, patch){ const list=this.listWorlds(); const e=list.find(w=>w.key===key); if(!e) return; Object.assign(e,patch);
    list.sort((a,b)=>(b.lastPlayed||0)-(a.lastPlayed||0)); this._writeRegistry(list); },
  deleteWorld(key){ const list=this.listWorlds().filter(w=>w.key!==key); this._writeRegistry(list);
    try{ localStorage.removeItem(key); }catch(e){}
    if(this.activeKey()===key) try{ localStorage.removeItem(this.ACTIVE_KEY); }catch(e){}
  }
};
