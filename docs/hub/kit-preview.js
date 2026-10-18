(() => {
  const id = new URLSearchParams(location.search).get('id') || 'voxhaven';
  const THREE = window.THREE;
  const titleEl = document.querySelector('#title');
  const metaEl = document.querySelector('#meta');
  const statusEl = document.querySelector('#status');
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x081018);
  scene.fog = new THREE.Fog(0x081018, 18, 50);
  const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, .1, 100);
  camera.position.set(8, 6, 10);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  document.body.appendChild(renderer.domElement);
  scene.add(new THREE.HemisphereLight(0xb8e2ff, 0x101820, 1.6));
  const sun = new THREE.DirectionalLight(0xfff3da, 2.2);
  sun.position.set(5, 10, 6); sun.castShadow = true; scene.add(sun);
  const ground = new THREE.Mesh(new THREE.BoxGeometry(24, .3, 24), new THREE.MeshStandardMaterial({ color: 0x172a31, roughness: .82 }));
  ground.position.y = -.18; ground.receiveShadow = true; scene.add(ground);
  const keys = new Set();
  const velocity = new THREE.Vector3();
  let root = null; let player = null; let mixer = null; let physicsMeta = null; let playerRadius = .5; let ragdoll = false; let last = performance.now();
  const obstacles = [];
  function setStatus(text) { statusEl.textContent = text; }
  function followCamera(dt) {
    if (!root) return;
    const desired = new THREE.Vector3(root.position.x + 7, root.position.y + 5, root.position.z + 9);
    camera.position.lerp(desired, Math.min(1, dt * 4));
    camera.lookAt(root.position.x, root.position.y + 1, root.position.z);
  }
  function toggleRagdoll() {
    ragdoll = !ragdoll;
    if (!root) return;
    root.traverse((obj) => { if (obj.userData.ragdoll_part || obj.name.startsWith('COLLIDER_')) obj.visible = ragdoll; });
    if (window.RVKKOAudio) RVKKOAudio.cue(id, ragdoll ? 'impact' : 'success');
    setStatus(ragdoll ? 'Ragdoll proxy active' : 'Animation controller active');
  }
  function animate(now) {
    requestAnimationFrame(animate);
    const dt = Math.min(.05, (now - last) / 1000); last = now;
    if (root) {
      const x = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
      const z = (keys.has('s') || keys.has('arrowdown') ? 1 : 0) - (keys.has('w') || keys.has('arrowup') ? 1 : 0);
      const moving = x || z;
      if (moving) { const len = Math.hypot(x, z) || 1; velocity.x += (x / len) * dt * 9; velocity.z += (z / len) * dt * 9; }
      velocity.x *= Math.pow(.06, dt); velocity.z *= Math.pow(.06, dt);
      velocity.y -= 18 * dt;
      root.position.addScaledVector(velocity, dt);
      if (root.position.y < 0) { root.position.y = 0; velocity.y = 0; }
      root.position.x = THREE.MathUtils.clamp(root.position.x, -10 + playerRadius, 10 - playerRadius);
      root.position.z = THREE.MathUtils.clamp(root.position.z, -10 + playerRadius, 10 - playerRadius);
      if (mixer) mixer.update(dt);
      if (moving && window.RVKKOAudio) RVKKOAudio.cue(id, 'movement', .06);
      followCamera(dt);
    }
    renderer.render(scene, camera);
  }
  window.addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase(); keys.add(key);
    if (key === 'r') toggleRagdoll();
    if (key === 'v' && window.RVKKOAudio) RVKKOAudio.speak(id, `${id.replaceAll('-', ' ')} systems online`);
    if (key === 'escape') history.back();
    if (event.code === 'Space' && root && root.position.y <= .01) velocity.y = 7.5;
  });
  window.addEventListener('keyup', (event) => keys.delete(event.key.toLowerCase()));
  window.addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
  document.querySelector('#back').onclick = () => history.back();
  fetch('../games/asset-manifest.json').then((r) => r.json()).then((manifest) => {
    const entry = (manifest.entries || []).find((item) => item.id === id);
    if (entry) { titleEl.textContent = entry.title; metaEl.textContent = `${entry.category} · ${entry.assetArchetype || 'game-specific kit'} · ${entry.gameplayVerb || 'move and interact'} · ${entry.cameraMode || 'third-person'}`; }
  });
  fetch(`../assets/blender-kits/${encodeURIComponent(id)}/physics.json`).then((r) => r.ok ? r.json() : null).then((physics) => { physicsMeta = physics; if (physics?.playerCollider?.radius) playerRadius = physics.playerCollider.radius; }).catch(() => {});
  const loader = new THREE.GLTFLoader();
  loader.load(`../assets/blender-kits/${encodeURIComponent(id)}/${encodeURIComponent(id)}-kit.glb`, (gltf) => {
    root = gltf.scene; root.position.y = 0; scene.add(root);
    const bounds = new THREE.Box3().setFromObject(root);
    playerRadius = Math.max(playerRadius, physicsMeta?.playerCollider?.radius || Math.max(bounds.max.x - bounds.min.x, bounds.max.z - bounds.min.z) * .5);
    root.traverse((obj) => { obj.castShadow = true; obj.receiveShadow = true; if (obj.name.startsWith('COLLIDER_')) obj.userData.ragdoll_part = true; });
    if (gltf.animations.length) { mixer = new THREE.AnimationMixer(root); mixer.clipAction(gltf.animations[0]).play(); }
    setStatus('3D kit loaded · camera, animation, gravity, collision bounds, ragdoll proxy, and audio ready');
  }, undefined, (error) => { setStatus(`Could not load 3D kit: ${error.message || error}`); });
  animate(performance.now());
})();
