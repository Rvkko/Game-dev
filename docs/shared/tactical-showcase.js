const cached = new Map();

function script(url) {
  if (cached.has(url)) return cached.get(url);
  const pending = new Promise((resolve, reject) => {
    const node = document.createElement('script');
    node.src = url;
    node.onload = resolve;
    node.onerror = () => reject(new Error(`Could not load ${url}`));
    document.head.appendChild(node);
  });
  cached.set(url, pending);
  return pending;
}

export function mountTacticalKit({ gameId, statusKey, accent = 0x47d3ff, getState }) {
  const status = { loaded: false, physics: false, attached: false, error: '' };
  window[statusKey] = status;
  const root = new URL('../', import.meta.url);
  const fail = (error) => { status.error = String(error?.message || error); window[statusKey] = status; };
  (async () => {
    try {
      if (!window.THREE) {
        await script(new URL('vendor/three-r128/three.min.js', root).href);
        await script(new URL('vendor/three-r128/GLTFLoader.js', root).href);
      }
      const canvas = document.createElement('canvas');
      canvas.className = 'tacticalKitStage';
      canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:1;opacity:.34';
      document.body.prepend(canvas);
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(1.5, devicePixelRatio || 1));
      renderer.setSize(innerWidth, innerHeight, false);
      renderer.outputEncoding = THREE.sRGBEncoding;
      const scene = new THREE.Scene();
      scene.fog = new THREE.Fog(0x081018, 13, 48);
      const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 100);
      camera.position.set(0, 7.8, 14);
      scene.add(new THREE.HemisphereLight(0xc4e9ff, 0x111720, 1.65));
      const key = new THREE.PointLight(accent, 3, 32); key.position.set(0, 7, 2); scene.add(key);
      const board = new THREE.Mesh(new THREE.BoxGeometry(17, 0.28, 12), new THREE.MeshStandardMaterial({ color: 0x182633, roughness: 0.86, metalness: 0.1 }));
      board.position.y = -1.3; scene.add(board);
      const grid = new THREE.GridHelper(16, 8, accent, 0x29404d); grid.position.y = -1.14; scene.add(grid);
      let kit = null;
      new THREE.GLTFLoader().load(new URL(`assets/blender-kits/${gameId}/${gameId}-kit.glb`, root).href, (gltf) => {
        kit = gltf.scene; kit.scale.setScalar(1.5); kit.position.y = -1.08; scene.add(kit);
        status.loaded = true; status.attached = true; window[statusKey] = status;
      }, undefined, fail);
      fetch(new URL(`assets/blender-kits/${gameId}/physics.json`, root).href)
        .then((r) => r.ok ? r.json() : Promise.reject(new Error(`physics ${r.status}`)))
        .then((physics) => { status.physics = Boolean(physics.playerCollider); window[statusKey] = status; })
        .catch(fail);
      addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });
      canvas.addEventListener('webglcontextlost', (event) => { event.preventDefault(); fail(new Error('WebGL context lost')); });
      let previous = performance.now();
      const frame = (now) => {
        const dt = Math.min(0.05, (now - previous) / 1000); previous = now;
        const state = getState() || {}, tension = Math.max(0, Math.min(1, state.tension || 0));
        canvas.style.opacity = state.active ? '.34' : '.14';
        key.intensity = 2.3 + tension * 1.9;
        if (kit) { kit.rotation.y += dt * (.12 + tension * .4); kit.position.x = Math.sin(now * .0012) * (.12 + tension * .22); kit.position.y = -1.08 + Math.sin(now * .003) * .035; }
        renderer.render(scene, camera); requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    } catch (error) { fail(error); }
  })();
  return status;
}
