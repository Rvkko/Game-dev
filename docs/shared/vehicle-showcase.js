const scriptCache = new Map();

function loadScript(url) {
  if (scriptCache.has(url)) return scriptCache.get(url);
  const promise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = url;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Could not load ${url}`));
    document.head.appendChild(script);
  });
  scriptCache.set(url, promise);
  return promise;
}

export function mountVehicleKit({ gameId, statusKey, accent = 0x47d3ff, getState }) {
  const status = { loaded: false, physics: false, attached: false, error: '' };
  window[statusKey] = status;
  const root = new URL('../', import.meta.url);

  const fail = (error) => {
    status.error = String(error?.message || error);
    window[statusKey] = status;
  };

  (async () => {
    try {
      if (!window.THREE) {
        await loadScript(new URL('vendor/three-r128/three.min.js', root).href);
        await loadScript(new URL('vendor/three-r128/GLTFLoader.js', root).href);
      }
      const canvas = document.createElement('canvas');
      canvas.className = 'vehicleKitStage';
      canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:1;opacity:.42';
      document.body.prepend(canvas);

      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
      renderer.setSize(innerWidth, innerHeight, false);
      renderer.outputEncoding = THREE.sRGBEncoding;
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 100);
      camera.position.set(0, 5.5, 13);
      scene.fog = new THREE.Fog(0x07121d, 12, 48);
      scene.add(new THREE.HemisphereLight(0xb8e8ff, 0x111a22, 1.6));
      const key = new THREE.DirectionalLight(0xffffff, 2.2);
      key.position.set(-5, 9, 6);
      scene.add(key);
      const rim = new THREE.PointLight(accent, 2.8, 28);
      rim.position.set(3, 4, 2);
      scene.add(rim);
      const road = new THREE.Mesh(
        new THREE.BoxGeometry(11, 0.22, 28),
        new THREE.MeshStandardMaterial({ color: 0x121923, roughness: 0.92, metalness: 0.08 })
      );
      road.position.y = -1.3;
      scene.add(road);
      const edgeMaterial = new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.62 });
      for (const side of [-1, 1]) {
        const edge = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.03, 28), edgeMaterial);
        edge.position.set(side * 5.25, -1.16, 0);
        scene.add(edge);
      }

      let kit = null;
      new THREE.GLTFLoader().load(new URL(`assets/blender-kits/${gameId}/${gameId}-kit.glb`, root).href, (gltf) => {
        kit = gltf.scene;
        kit.scale.setScalar(1.55);
        kit.position.set(0, -1.05, 0);
        scene.add(kit);
        status.loaded = true;
        status.attached = true;
        window[statusKey] = status;
      }, undefined, fail);

      fetch(new URL(`assets/blender-kits/${gameId}/physics.json`, root).href)
        .then((response) => response.ok ? response.json() : Promise.reject(new Error(`physics ${response.status}`)))
        .then((physics) => { status.physics = Boolean(physics.playerCollider); window[statusKey] = status; })
        .catch(fail);

      const resize = () => {
        renderer.setSize(innerWidth, innerHeight, false);
        camera.aspect = innerWidth / innerHeight;
        camera.updateProjectionMatrix();
      };
      addEventListener('resize', resize);
      canvas.addEventListener('webglcontextlost', (event) => { event.preventDefault(); fail(new Error('WebGL context lost')); });

      let previous = performance.now();
      const render = (now) => {
        const delta = Math.min(0.05, (now - previous) / 1000);
        previous = now;
        const state = getState() || {};
        canvas.style.opacity = state.active ? '.42' : '.18';
        if (kit) {
          const speed = Math.min(1, Math.max(0, (state.speed || 0) / (state.maxSpeed || 240)));
          const steer = Math.max(-1, Math.min(1, state.steer || 0));
          kit.rotation.y += delta * (state.active ? 0.22 + speed * 0.55 : 0.12);
          kit.rotation.z += (steer * 0.18 - kit.rotation.z) * Math.min(1, delta * 8);
          kit.position.x += (steer * 1.2 - kit.position.x) * Math.min(1, delta * 5);
          kit.position.y = -1.05 + Math.sin(now * 0.005 + speed * 4) * (state.active ? 0.035 + speed * 0.04 : 0.02);
        }
        renderer.render(scene, camera);
        requestAnimationFrame(render);
      };
      requestAnimationFrame(render);
    } catch (error) { fail(error); }
  })();

  return status;
}
