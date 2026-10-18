const cache = new Map();
function load(url) { if (cache.has(url)) return cache.get(url); const p = new Promise((resolve, reject) => { const s = document.createElement('script'); s.src = url; s.onload = resolve; s.onerror = () => reject(new Error(`Could not load ${url}`)); document.head.appendChild(s); }); cache.set(url, p); return p; }

export function mountAdventureKit({ gameId, statusKey, accent = 0x38c6a3, getState }) {
  const status = { loaded: false, physics: false, attached: false, error: '' };
  window[statusKey] = status;
  const root = new URL('../', import.meta.url), fail = (error) => { status.error = String(error?.message || error); window[statusKey] = status; };
  (async () => { try {
    if (!window.THREE) { await load(new URL('vendor/three-r128/three.min.js', root).href); await load(new URL('vendor/three-r128/GLTFLoader.js', root).href); }
    const canvas = document.createElement('canvas'); canvas.className = 'adventureKitStage'; canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:1;opacity:.3'; document.body.prepend(canvas);
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); renderer.setPixelRatio(Math.min(1.5, devicePixelRatio || 1)); renderer.setSize(innerWidth, innerHeight, false); renderer.outputEncoding = THREE.sRGBEncoding;
    const scene = new THREE.Scene(); scene.fog = new THREE.Fog(0x0a1720, 15, 58); const camera = new THREE.PerspectiveCamera(43, innerWidth / innerHeight, .1, 100); camera.position.set(0, 6.7, 14); scene.add(new THREE.HemisphereLight(0xc7ecff, 0x132218, 1.8)); const sun = new THREE.DirectionalLight(0xffe6b0, 2); sun.position.set(-5, 10, 4); scene.add(sun); const glow = new THREE.PointLight(accent, 2.7, 32); glow.position.set(2, 4, 2); scene.add(glow);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(14, 40), new THREE.MeshStandardMaterial({ color: 0x254633, roughness: 1 })); ground.rotation.x = -Math.PI / 2; ground.position.y = -1.3; scene.add(ground);
    let kit = null; new THREE.GLTFLoader().load(new URL(`assets/blender-kits/${gameId}/${gameId}-kit.glb`, root).href, (gltf) => { kit = gltf.scene; kit.scale.setScalar(1.55); kit.position.y = -1.08; scene.add(kit); status.loaded = true; status.attached = true; window[statusKey] = status; }, undefined, fail);
    fetch(new URL(`assets/blender-kits/${gameId}/physics.json`, root).href).then((r) => r.ok ? r.json() : Promise.reject(new Error(`physics ${r.status}`))).then((physics) => { status.physics = Boolean(physics.playerCollider); window[statusKey] = status; }).catch(fail);
    addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }); canvas.addEventListener('webglcontextlost', (event) => { event.preventDefault(); fail(new Error('WebGL context lost')); });
    let previous = performance.now(); const render = (now) => { const dt = Math.min(.05, (now - previous) / 1000); previous = now; const state = getState() || {}, motion = Math.max(0, Math.min(1, state.motion || 0)), danger = Math.max(0, Math.min(1, state.danger || 0)); canvas.style.opacity = state.active ? '.3' : '.12'; glow.intensity = 2.2 + danger * 2.5; if (kit) { kit.rotation.y += dt * (.1 + motion * .65); kit.position.x = Math.sin(now * .0015) * (.1 + motion * .35); kit.position.y = -1.08 + Math.abs(Math.sin(now * .006)) * motion * .09; } renderer.render(scene, camera); requestAnimationFrame(render); }; requestAnimationFrame(render);
  } catch (error) { fail(error); } })();
  return status;
}
