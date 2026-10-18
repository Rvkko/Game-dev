/* ============================================================================
 * Civilization God Simulator — TRUE 3D renderer (Three.js + cannon-es).
 * Low-poly heightmap world, orbit/RTS god-cam, procedural building & agent
 * meshes, 3D FX, and real 3D ragdoll physics on death/impact.
 * Public API mirrors the old 2D renderer so main.js stays mostly unchanged:
 *   setWorld(w), resize(w,h), draw(cam, sel, fx, season),
 *   screenToWorld(cam, sx, sy) -> [wx, wy], spawnRagdoll(x, y),
 *   props: world, terrainDirty, cbMode, reducedMotion, highContrast
 * Camera model (cam): { x, y (ground target in tile coords), dist, az, pol }.
 * ==========================================================================*/
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { TERRAIN } from './sim.js';

const PAL = {
  off: {
    [TERRAIN.WATER]: 0x2d5a7a, [TERRAIN.GRASS]: 0x5a8c4a, [TERRAIN.FOREST]: 0x2f5e34,
    [TERRAIN.HILL]: 0x8a7d5a, [TERRAIN.DESERT]: 0xc9b477, [TERRAIN.MOUNTAIN]: 0x6e6e78,
  },
  deuteranopia: {
    [TERRAIN.WATER]: 0x2b6a9a, [TERRAIN.GRASS]: 0x9a8f3a, [TERRAIN.FOREST]: 0x6b6320,
    [TERRAIN.HILL]: 0x8a7a55, [TERRAIN.DESERT]: 0xd8c98a, [TERRAIN.MOUNTAIN]: 0x707078,
  },
};
const TILE_H = {
  [TERRAIN.WATER]: -0.9, [TERRAIN.GRASS]: 0.0, [TERRAIN.FOREST]: 0.35,
  [TERRAIN.HILL]: 1.7, [TERRAIN.DESERT]: -0.1, [TERRAIN.MOUNTAIN]: 3.8,
};
const MAX_AGENTS = 500;
const MAX_RAGDOLLS = 9;

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.world = null;
    this.terrainDirty = true;
    this.cbMode = 'off';
    this.highContrast = false;
    this.reducedMotion = false;
    this.cssW = canvas.clientWidth || 800;
    this.cssH = canvas.clientHeight || 600;
    this.time = 0;
    this._lastT = performance.now();
    this._settMeshes = new Map();     // settId -> { group, builtCount, label, pop }
    this.profileAsset = null;
    this.profilePhysicsRadius = 0.5;
    window.__civAssetStatus = { loaded: false, attached: false, physics: false, error: '' };
    this.ragdolls = [];
    this.heights = null;              // per-tile Float32 center heights

    // ---- Three.js core ----
    const gl = new THREE.WebGLRenderer({
      canvas, antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance',
    });
    gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    gl.shadowMap.enabled = true;
    gl.shadowMap.type = THREE.PCFSoftShadowMap;
    gl.outputColorSpace = THREE.SRGBColorSpace;
    this.gl = gl;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0d13);
    this.scene.fog = new THREE.Fog(0x0a0d13, 60, 200);

    this.cam3 = new THREE.PerspectiveCamera(52, this.cssW / this.cssH, 0.5, 3000);

    // Lights
    this.hemi = new THREE.HemisphereLight(0xbfd3ff, 0x37301f, 0.9);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff2d0, 1.15);
    this.sun.position.set(40, 80, 30);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    const sc = this.sun.shadow.camera;
    sc.near = 1; sc.far = 300; sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70;
    this.sun.shadow.bias = -0.0008;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    // Groups
    this.terrainGroup = new THREE.Group(); this.scene.add(this.terrainGroup);
    this.settGroup = new THREE.Group(); this.scene.add(this.settGroup);
    this.fxGroup = new THREE.Group(); this.scene.add(this.fxGroup);
    this.ragGroup = new THREE.Group(); this.scene.add(this.ragGroup);

    // Agent instanced mesh
    const agGeo = new THREE.CapsuleGeometry(0.28, 0.5, 4, 8);
    agGeo.translate(0, 0.5, 0);
    const agMat = new THREE.MeshStandardMaterial({ roughness: 0.75, metalness: 0.0 });
    this.agentMesh = new THREE.InstancedMesh(agGeo, agMat, MAX_AGENTS);
    this.agentMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.agentMesh.castShadow = true;
    this.agentMesh.count = 0;
    this.scene.add(this.agentMesh);
    // ensure instanceColor allocated
    const c0 = new THREE.Color(1, 1, 1);
    for (let i = 0; i < MAX_AGENTS; i++) this.agentMesh.setColorAt(i, c0);
    this.agentMesh.instanceColor.needsUpdate = true;

    // Selection ring
    const ringGeo = new THREE.TorusGeometry(0.7, 0.08, 8, 24);
    ringGeo.rotateX(Math.PI / 2);
    this.selRing = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffd24a }));
    this.selRing.visible = false;
    this.scene.add(this.selRing);

    // FX pools
    this._ringPool = []; this._orbPool = [];
    const ringFxGeo = new THREE.RingGeometry(0.9, 1.0, 32); ringFxGeo.rotateX(-Math.PI / 2);
    this._ringFxGeo = ringFxGeo;
    this._orbGeo = new THREE.SphereGeometry(0.4, 10, 8);

    // Physics
    this.physics = new CANNON.World({ gravity: new CANNON.Vec3(0, -14, 0) });
    this.physics.broadphase = new CANNON.NaiveBroadphase();
    const ground = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() });
    ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    this.physics.addBody(ground);

    // reused temp objects
    this._m4 = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._v = new THREE.Vector3();
    this._up = new THREE.Vector3(0, 1, 0);
    this._raycaster = new THREE.Raycaster();
    this._groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this._loadProfileAsset();
  }

  _loadProfileAsset() {
    const GLTFLoader = window.THREE?.GLTFLoader;
    if (!GLTFLoader) { window.__civAssetStatus.error = 'GLTFLoader unavailable'; return; }
    const loader = new GLTFLoader();
    Promise.all([
      fetch('../../assets/blender-kits/civ-god-sim/physics.json').then((r) => r.ok ? r.json() : null).catch(() => null),
      new Promise((resolve, reject) => loader.load('../../assets/blender-kits/civ-god-sim/civ-god-sim-kit.glb', resolve, undefined, reject)),
    ]).then(([physics, gltf]) => {
      const source = gltf.scene.getObjectByName('PROFILE_PLAYER_DETAIL') || gltf.scene.getObjectByName('PLAYER_BODY');
      if (!source) throw new Error('Civ commander asset missing');
      this.profileAsset = source.clone(true);
      this.profileAsset.name = 'BLENDER_COMMANDER_ASSET';
      this.profileAsset.scale.setScalar(1.15);
      this.profileAsset.traverse((obj) => { obj.castShadow = true; obj.receiveShadow = true; });
      this.profilePhysicsRadius = physics?.playerCollider?.radius || 0.5;
      window.__civAssetStatus.loaded = true;
      window.__civAssetStatus.physics = !!physics?.playerCollider;
    }).catch((error) => { window.__civAssetStatus.error = String(error?.message || error); });
  }

  setWorld(w) {
    this.world = w;
    this.terrainDirty = true;
    // clear settlements & ragdolls & fx
    for (const [, e] of this._settMeshes) this.settGroup.remove(e.group);
    this._settMeshes.clear();
    this._clearRagdolls();
    while (this.fxGroup.children.length) this.fxGroup.remove(this.fxGroup.children[0]);
  }

  resize(cssW, cssH) {
    cssW = Math.max(1, cssW | 0); cssH = Math.max(1, cssH | 0);
    this.cssW = cssW; this.cssH = cssH;
    this.gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.gl.setSize(cssW, cssH, false);
    this.cam3.aspect = cssW / cssH;
    this.cam3.updateProjectionMatrix();
  }

  /** Standard three.js resize-to-display: keeps the drawing buffer matched to
   *  the canvas element's actual on-screen size, robust to boot-timing races. */
  _autoResize() {
    const c = this.canvas;
    const w = c.clientWidth || (c.parentElement && c.parentElement.clientWidth) || window.innerWidth;
    const h = c.clientHeight || (c.parentElement && c.parentElement.clientHeight) || window.innerHeight;
    if (w > 0 && h > 0 && (w !== this.cssW || h !== this.cssH)) this.resize(w, h);
  }

  _pal() { return PAL[this.cbMode] || PAL.off; }

  heightAt(x, y) {
    if (!this.heights) return 0;
    const w = this.world; const xi = Math.max(0, Math.min(w.W - 1, Math.round(x)));
    const yi = Math.max(0, Math.min(w.H - 1, Math.round(y)));
    return this.heights[yi * w.W + xi];
  }

  // ---- Terrain heightmap build --------------------------------------------
  _buildTerrain() {
    const w = this.world; if (!w) return;
    const { W, H } = w;
    // per-tile center heights
    this.heights = new Float32Array(W * H);
    const th = (t) => (TILE_H[t] !== undefined ? TILE_H[t] : 0);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let h = th(w.tiles[y * W + x]);
      // subtle per-tile jitter for low-poly life (deterministic)
      h += (((x * 92821 + y * 68917) % 100) / 100 - 0.5) * 0.18;
      this.heights[y * W + x] = h;
    }
    // clear old terrain meshes
    while (this.terrainGroup.children.length) {
      const c = this.terrainGroup.children[0];
      this.terrainGroup.remove(c); c.geometry && c.geometry.dispose();
    }
    // Build a vertex grid (W+1)x(H+1); vertex height = avg of neighbour tiles.
    const pal = this._pal();
    const vw = W + 1, vh = H + 1;
    const positions = new Float32Array(vw * vh * 3);
    const colors = new Float32Array(vw * vh * 3);
    const col = new THREE.Color();
    const sampleH = (tx, ty) => {
      let s = 0, n = 0;
      for (const [dx, dy] of [[0, 0], [-1, 0], [0, -1], [-1, -1]]) {
        const xx = tx + dx, yy = ty + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        s += this.heights[yy * W + xx]; n++;
      }
      return n ? s / n : 0;
    };
    const nearTile = (tx, ty) => {
      const xx = Math.max(0, Math.min(W - 1, tx)), yy = Math.max(0, Math.min(H - 1, ty));
      return w.tiles[yy * W + xx];
    };
    for (let j = 0; j < vh; j++) {
      for (let i = 0; i < vw; i++) {
        const vi = (j * vw + i) * 3;
        const hh = Math.max(-0.5, sampleH(i, j)); // land clamped above waterline visually
        positions[vi] = i; positions[vi + 1] = hh; positions[vi + 2] = j;
        col.setHex(pal[nearTile(i, j)]);
        if (this.highContrast) col.offsetHSL(0, 0.15, 0.05);
        colors[vi] = col.r; colors[vi + 1] = col.g; colors[vi + 2] = col.b;
      }
    }
    const idx = [];
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const a = j * vw + i, b = j * vw + i + 1, c = (j + 1) * vw + i, d = (j + 1) * vw + i + 1;
      idx.push(a, c, b, b, c, d);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95, metalness: 0.0 });
    const land = new THREE.Mesh(geo, mat);
    land.receiveShadow = true; land.castShadow = false;
    this.terrainGroup.add(land);

    // Trees on forest tiles (low-poly cones), instanced
    const treePos = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (w.tiles[y * W + x] === TERRAIN.FOREST && ((x * 13 + y * 7) % 3 === 0)) treePos.push([x, y]);
    }
    if (treePos.length) {
      const tGeo = new THREE.ConeGeometry(0.5, 1.4, 6); tGeo.translate(0, 0.7, 0);
      const tMat = new THREE.MeshStandardMaterial({ color: 0x24521f, flatShading: true, roughness: 1 });
      const trees = new THREE.InstancedMesh(tGeo, tMat, treePos.length);
      trees.castShadow = true;
      const m = new THREE.Matrix4();
      treePos.forEach(([x, y], i) => {
        m.makeTranslation(x + 0.5, this.heights[y * W + x], y + 0.5);
        trees.setMatrixAt(i, m);
      });
      trees.instanceMatrix.needsUpdate = true;
      this.terrainGroup.add(trees);
    }

    // Water plane
    const wGeo = new THREE.PlaneGeometry(W + 8, H + 8); wGeo.rotateX(-Math.PI / 2);
    const wMat = new THREE.MeshStandardMaterial({
      color: pal[TERRAIN.WATER], transparent: true, opacity: 0.82,
      roughness: 0.25, metalness: 0.3,
    });
    this.water = new THREE.Mesh(wGeo, wMat);
    this.water.position.set(W / 2, -0.25, H / 2);
    this.water.receiveShadow = true;
    this.terrainGroup.add(this.water);

    this.terrainDirty = false;
  }

  // ---- Building meshes -----------------------------------------------------
  _buildingMesh(type) {
    const g = new THREE.Group();
    const box = (w, h, d, color, x = 0, y = 0, z = 0) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d),
        new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85 }));
      m.position.set(x, y + h / 2, z); m.castShadow = true; m.receiveShadow = true; g.add(m); return m;
    };
    const cone = (r, h, color, x = 0, y = 0, z = 0, seg = 4) => {
      const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, seg),
        new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85 }));
      m.position.set(x, y + h / 2, z); m.castShadow = true; g.add(m); return m;
    };
    switch (type) {
      case 'campfire': {
        box(0.7, 0.14, 0.7, 0x5a3a20);
        const f = cone(0.28, 0.7, 0xff8a3a, 0, 0.14, 0);
        f.material.emissive = new THREE.Color(0xff6a1a); f.material.emissiveIntensity = 0.8;
        g.userData.flame = f;
        const light = new THREE.PointLight(0xff8030, 1.2, 6); light.position.set(0, 0.7, 0);
        g.add(light); g.userData.light = light;
        break;
      }
      case 'hut': box(1.1, 0.7, 1.1, 0x8a6a44); cone(0.95, 0.7, 0x5e3b22, 0, 0.7, 0); break;
      case 'storage': box(1.0, 0.9, 1.0, 0xb8975a); box(1.05, 0.18, 1.05, 0x7a5f30, 0, 0.55, 0); break;
      case 'farm': {
        const p = box(1.5, 0.12, 1.2, 0x7c9b3a);
        for (let i = -1; i <= 1; i++) box(1.4, 0.16, 0.12, 0x9bb84a, 0, 0.06, i * 0.4);
        break;
      }
      case 'well': {
        const c = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, 0.7, 10),
          new THREE.MeshStandardMaterial({ color: 0x8a8a92, flatShading: true }));
        c.position.y = 0.35; c.castShadow = true; g.add(c);
        box(0.1, 1.0, 0.1, 0x6a4a2a, -0.4, 0.6, 0); box(0.1, 1.0, 0.1, 0x6a4a2a, 0.4, 0.6, 0);
        break;
      }
      case 'workshop': box(1.5, 0.9, 1.2, 0x9a7a4a); box(0.3, 0.9, 0.3, 0x5a5a62, 0.5, 0.9, 0.3); break;
      case 'wall': box(2.0, 1.1, 0.5, 0x8a8a92); for (let i = -2; i <= 2; i++) box(0.3, 0.3, 0.5, 0x6a6a72, i * 0.45, 1.1, 0); break;
      case 'temple': {
        box(2.2, 0.35, 1.8, 0xe8dcc0);
        for (const dx of [-0.85, -0.28, 0.28, 0.85]) box(0.2, 1.0, 0.2, 0xd8c9a0, dx, 0.35, 0.7);
        cone(1.5, 1.0, 0xc9b98a, 0, 1.35, 0, 4);
        break;
      }
      default: box(0.8, 0.8, 0.8, 0x999999);
    }
    return g;
  }

  _syncSettlements(sel) {
    const w = this.world;
    const alive = new Set();
    for (const s of w.settlements) {
      if (!s.alive) continue;
      alive.add(s.id);
      let e = this._settMeshes.get(s.id);
      const pop = s.members.length;
      if (!e) {
        e = { group: new THREE.Group(), builtCount: -1, label: null, pop: -1 };
        this.settGroup.add(e.group);
        this._settMeshes.set(s.id, e);
      }
      // rebuild buildings if count changed
      if (e.builtCount !== s.buildings.length) {
        // remove building children (keep label sprite)
        for (let i = e.group.children.length - 1; i >= 0; i--) {
          const c = e.group.children[i];
          if (c !== e.label) e.group.remove(c);
        }
        for (const b of s.buildings) {
          const bm = this._buildingMesh(b.type);
          bm.position.set(b.x + 0.5, this.heightAt(b.x, b.y), b.y + 0.5);
          bm.rotation.y = ((b.x * 7 + b.y * 13) % 8) / 8 * Math.PI * 2;
          e.group.add(bm);
        }
        e.builtCount = s.buildings.length;
      }
      // label sprite
      if (!e.label || e.pop !== pop) {
        if (e.label) e.group.remove(e.label);
        e.label = this._makeLabel(`${s.name}  ·  ${pop}`);
        e.label.position.set(s.cx + 0.5, this.heightAt(s.cx, s.cy) + 3.4, s.cy + 0.5);
        e.group.add(e.label);
        e.pop = pop;
      }
      // animate campfire flames
      for (const bm of e.group.children) {
        if (bm.userData && bm.userData.flame) {
          const f = bm.userData.flame;
          f.scale.y = 1 + Math.sin(this.time * 8 + s.id) * 0.18;
          if (bm.userData.light) bm.userData.light.intensity = 1.0 + Math.sin(this.time * 10 + s.id) * 0.4;
        }
      }
    }
    // remove dead settlement groups
    for (const [id, e] of this._settMeshes) {
      if (!alive.has(id)) { this.settGroup.remove(e.group); this._settMeshes.delete(id); }
    }
  }

  _makeLabel(text) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 64;
    const ctx = c.getContext('2d');
    ctx.font = 'bold 30px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.strokeText(text, 128, 32);
    ctx.fillStyle = '#ffe9b0'; ctx.fillText(text, 128, 32);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    spr.scale.set(7, 1.75, 1);
    return spr;
  }

  // ---- Agents --------------------------------------------------------------
  _syncAgents(sel) {
    const w = this.world; const mesh = this.agentMesh;
    const col = new THREE.Color();
    let n = 0;
    for (const a of w.agents) {
      if (!a.alive) continue;
      if (n >= MAX_AGENTS) break;
      const h = this.heightAt(a.x, a.y);
      // face movement direction
      const dx = a.tx - a.x, dy = a.ty - a.y;
      const ang = (Math.abs(dx) + Math.abs(dy) > 0.01) ? Math.atan2(dx, dy) : 0;
      const sc = a.job === 'child' ? 0.62 : 1.0;
      this._q.setFromAxisAngle(this._up, ang);
      this._m4.compose(this._v.set(a.x + 0.5, h, a.y + 0.5), this._q, new THREE.Vector3(sc, sc, sc));
      mesh.setMatrixAt(n, this._m4);
      let hex = a.sex === 'F' ? 0xe79bd0 : 0x7fb6e6;
      if (a.job === 'child') hex = 0xf2e08a;
      if (a.blessed > 0) hex = 0xffe66a;
      if (a.cursed > 0) hex = 0x9b6ad0;
      if (a.health < 0.35) hex = 0xc85a5a;
      col.setHex(hex);
      mesh.setColorAt(n, col);
      a._inst = n;
      n++;
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

    // selection ring
    this.selRing.visible = false;
    if (sel) {
      if (sel.type === 'agent') {
        const a = w.agent(sel.id);
        if (a) { this.selRing.visible = true; this.selRing.scale.setScalar(1); this.selRing.position.set(a.x + 0.5, this.heightAt(a.x, a.y) + 0.05, a.y + 0.5); }
      } else if (sel.type === 'settlement') {
        const s = w.settlement(sel.id);
        if (s) { this.selRing.visible = true; const r = 2 + Math.sqrt(s.members.length); this.selRing.scale.setScalar(r); this.selRing.position.set(s.cx + 0.5, this.heightAt(s.cx, s.cy) + 0.05, s.cy + 0.5); }
      }
    }
    if (this.profileAsset) {
      const agent = sel?.type === 'agent' ? w.agent(sel.id) : null;
      const settlement = sel?.type === 'settlement' ? w.settlement(sel.id) : null;
      this.profileAsset.visible = !!agent || !!settlement;
      if (this.profileAsset.visible) {
        const x = agent ? agent.x : settlement.cx;
        const y = agent ? agent.y : settlement.cy;
        const h = this.heightAt(x, y);
        this.profileAsset.position.set(x + 0.5, h, y + 0.5);
        this.profileAsset.rotation.y = agent
          ? Math.atan2(agent.tx - agent.x, agent.ty - agent.y)
          : this.time * 0.12;
        this.profileAsset.scale.setScalar(agent ? 1.15 : 1.55);
        if (!this.profileAsset.parent) this.scene.add(this.profileAsset);
        window.__civAssetStatus.attached = true;
      }
    }
  }

  // ---- FX (3D) -------------------------------------------------------------
  _getRing() {
    let r = this._ringPool.find(m => !m.visible);
    if (!r) {
      r = new THREE.Mesh(this._ringFxGeo, new THREE.MeshBasicMaterial({ transparent: true, side: THREE.DoubleSide, depthWrite: false }));
      this._ringPool.push(r); this.fxGroup.add(r);
    }
    return r;
  }
  _getOrb() {
    let o = this._orbPool.find(m => !m.visible);
    if (!o) {
      o = new THREE.Mesh(this._orbGeo, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }));
      this._orbPool.push(o); this.fxGroup.add(o);
    }
    return o;
  }
  _syncFx(fx) {
    for (const m of this._ringPool) m.visible = false;
    for (const m of this._orbPool) m.visible = false;
    for (const p of fx) {
      const a = Math.max(0, p.life / p.max);
      const h = this.heightAt(p.x, p.y);
      const col = new THREE.Color(p.color);
      if (p.type === 'birth' || p.type === 'union' || p.type === 'bless' || p.type === 'food') {
        const o = this._getOrb(); o.visible = true;
        o.position.set(p.x + 0.5, h + 0.5 + (1 - a) * 3, p.y + 0.5);
        o.material.color = col; o.material.opacity = a;
        o.scale.setScalar((p.big ? 1.6 : 0.9) * (0.6 + a * 0.6));
      } else {
        const r = this._getRing(); r.visible = true;
        r.position.set(p.x + 0.5, h + 0.15, p.y + 0.5);
        r.material.color = col; r.material.opacity = a * 0.9;
        const rad = (1 - a) * (p.big ? 9 : 4) + 0.5;
        r.scale.setScalar(rad);
      }
    }
  }

  // ---- Ragdoll physics -----------------------------------------------------
  spawnRagdoll(x, y) {
    if (this.reducedMotion) return;
    if (this.ragdolls.length >= MAX_RAGDOLLS) this._removeRagdoll(this.ragdolls[0]);
    const h = this.heightAt(x, y) + 1.0;
    const px = x + 0.5, pz = y + 0.5;
    const bodies = [], meshes = [], constraints = [];
    const mkBody = (hw, hh, hd, mass, ox, oy, oz, color) => {
      const body = new CANNON.Body({ mass, shape: new CANNON.Box(new CANNON.Vec3(hw, hh, hd)), linearDamping: 0.1, angularDamping: 0.2 });
      body.position.set(px + ox, h + oy, pz + oz);
      this.physics.addBody(body); bodies.push(body);
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(hw * 2, hh * 2, hd * 2),
        new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.8 }));
      mesh.castShadow = true; this.ragGroup.add(mesh); meshes.push(mesh);
      return body;
    };
    const skin = 0xe8b98a;
    const torso = mkBody(0.28, 0.4, 0.18, 3, 0, 0, 0, 0x6a7fa0);
    const head = mkBody(0.2, 0.2, 0.2, 1, 0, 0.65, 0, skin);
    const armL = mkBody(0.12, 0.35, 0.12, 0.6, -0.42, 0.05, 0, skin);
    const armR = mkBody(0.12, 0.35, 0.12, 0.6, 0.42, 0.05, 0, skin);
    const legL = mkBody(0.14, 0.4, 0.14, 0.9, -0.16, -0.8, 0, 0x4a4a5a);
    const legR = mkBody(0.14, 0.4, 0.14, 0.9, 0.16, -0.8, 0, 0x4a4a5a);
    const link = (a, b, pivA, pivB) => {
      const c = new CANNON.ConeTwistConstraint(a, b, {
        pivotA: new CANNON.Vec3(...pivA), pivotB: new CANNON.Vec3(...pivB),
        axisA: new CANNON.Vec3(0, 1, 0), axisB: new CANNON.Vec3(0, 1, 0), angle: Math.PI / 3, twistAngle: Math.PI / 4,
      });
      this.physics.addConstraint(c); constraints.push(c);
    };
    link(torso, head, [0, 0.5, 0], [0, -0.25, 0]);
    link(torso, armL, [-0.3, 0.35, 0], [0, 0.35, 0]);
    link(torso, armR, [0.3, 0.35, 0], [0, 0.35, 0]);
    link(torso, legL, [-0.16, -0.4, 0], [0, 0.4, 0]);
    link(torso, legR, [0.16, -0.4, 0], [0, 0.4, 0]);
    // impulse: topple outward with spin
    const dir = new CANNON.Vec3((Math.random() - 0.5) * 6, 3 + Math.random() * 2, (Math.random() - 0.5) * 6);
    torso.velocity.copy(dir);
    torso.angularVelocity.set((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 8);
    this.ragdolls.push({ bodies, meshes, constraints, born: this.time });
  }
  _removeRagdoll(r) {
    if (!r) return;
    for (const c of r.constraints) this.physics.removeConstraint(c);
    for (const b of r.bodies) this.physics.removeBody(b);
    for (const m of r.meshes) { this.ragGroup.remove(m); m.geometry.dispose(); m.material.dispose(); }
    const i = this.ragdolls.indexOf(r); if (i >= 0) this.ragdolls.splice(i, 1);
  }
  _clearRagdolls() { for (const r of [...this.ragdolls]) this._removeRagdoll(r); }
  _stepPhysics(dt) {
    if (this.ragdolls.length) this.physics.step(1 / 60, dt, 3);
    for (const r of [...this.ragdolls]) {
      const age = this.time - r.born;
      const fade = age > 5 ? Math.max(0, 1 - (age - 5) / 1.5) : 1;
      for (let i = 0; i < r.bodies.length; i++) {
        const b = r.bodies[i], m = r.meshes[i];
        m.position.set(b.position.x, b.position.y, b.position.z);
        m.quaternion.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
        if (fade < 1) { m.material.transparent = true; m.material.opacity = fade; }
      }
      if (age > 6.5) this._removeRagdoll(r);
    }
  }

  // ---- Camera + season -----------------------------------------------------
  _applyCamera(cam) {
    const c = this.cam3;
    const tx = cam.x, tz = cam.y, ty = this.heightAt(cam.x, cam.y) + 1.0;
    const sp = Math.sin(cam.pol), cp = Math.cos(cam.pol);
    c.position.set(
      tx + cam.dist * sp * Math.sin(cam.az),
      ty + cam.dist * cp,
      tz + cam.dist * sp * Math.cos(cam.az)
    );
    c.lookAt(tx, ty, tz);
    // keep sun following target for shadow coverage
    this.sun.position.set(tx + 40, 90, tz + 30);
    this.sun.target.position.set(tx, 0, tz);
  }
  _applySeason(season) {
    let sky, fog, sunCol, hemiSky, hemiInt;
    switch (season) {
      case 'Winter': sky = 0x14202e; sunCol = 0xd8e6ff; hemiSky = 0xcfe0ff; hemiInt = 0.75; break;
      case 'Autumn': sky = 0x1a1710; sunCol = 0xffcf88; hemiSky = 0xe0b878; hemiInt = 0.8; break;
      case 'Summer': sky = 0x101d2a; sunCol = 0xfff0c0; hemiSky = 0xbfe0ff; hemiInt = 1.0; break;
      default: sky = 0x0e1622; sunCol = 0xfff2d0; hemiSky = 0xbfd3ff; hemiInt = 0.9;
    }
    fog = sky;
    this.scene.background.setHex(sky);
    this.scene.fog.color.setHex(fog);
    this.sun.color.setHex(sunCol);
    this.hemi.color.setHex(hemiSky); this.hemi.intensity = hemiInt;
  }

  // ---- Main draw -----------------------------------------------------------
  draw(cam, sel, fx, season) {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this._lastT) / 1000);
    this._lastT = now; this.time += dt;
    this._autoResize();
    if (!this.world) { this.gl.render(this.scene, this.cam3); return; }
    if (this.terrainDirty) this._buildTerrain();
    this._applySeason(season);
    this._applyCamera(cam);
    this._syncSettlements(sel);
    this._syncAgents(sel);
    this._syncFx(fx);
    this._stepPhysics(dt);
    if (this.water) this.water.material.opacity = 0.8 + Math.sin(this.time * 1.5) * 0.04;
    this.gl.render(this.scene, this.cam3);
  }

  // ---- Screen <-> world (raycast to ground) --------------------------------
  screenToWorld(cam, sx, sy) {
    const ndcX = (sx / this.cssW) * 2 - 1;
    const ndcY = -((sy / this.cssH) * 2 - 1);
    this._raycaster.setFromCamera({ x: ndcX, y: ndcY }, this.cam3);
    const hit = new THREE.Vector3();
    const ok = this._raycaster.ray.intersectPlane(this._groundPlane, hit);
    if (!ok) return [cam.x, cam.y];
    return [hit.x - 0.5, hit.z - 0.5];
  }
}
