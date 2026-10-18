import * as THREE from "three";
import type { EnemyKind, SpellId } from "../game/types";

const flat = (color: number, emissive = 0) => new THREE.MeshStandardMaterial({
  color,
  emissive,
  emissiveIntensity: emissive ? 0.65 : 0,
  roughness: 0.82,
  flatShading: true,
});

function shadow(mesh: THREE.Mesh) {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function createPlayer(spell: SpellId) {
  const group = new THREE.Group();
  const cloakColor = spell === "moonbeam" ? 0x8fa4e8 : spell === "seedburst" ? 0xd6a449 : 0x6ebf73;
  const body = shadow(new THREE.Mesh(new THREE.ConeGeometry(0.7, 1.55, 7), flat(cloakColor)));
  body.position.y = 0.85;
  const head = shadow(new THREE.Mesh(new THREE.SphereGeometry(0.43, 8, 6), flat(0xf1d9b0)));
  head.position.y = 1.78;
  const hood = shadow(new THREE.Mesh(new THREE.ConeGeometry(0.54, 0.7, 7), flat(0x263f3b)));
  hood.position.y = 2.14;
  const staff = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.07, 2.4, 6), flat(0x6d4931)));
  staff.position.set(0.68, 1.12, 0);
  staff.rotation.z = -0.08;
  const focus = shadow(new THREE.Mesh(new THREE.OctahedronGeometry(0.2), flat(0xf9e08e, 0xf9e08e)));
  focus.position.set(0.7, 2.28, 0);
  group.add(body, head, hood, staff, focus);
  group.userData.focus = focus;
  return group;
}

export function createWorldseed() {
  const group = new THREE.Group();
  const trunk = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.7, 2.1, 7), flat(0x7b4f32)));
  trunk.position.y = 1.05;
  const crown = shadow(new THREE.Mesh(new THREE.DodecahedronGeometry(1.4, 0), flat(0xf6c85f, 0xf6a83d)));
  crown.position.y = 2.65;
  const inner = shadow(new THREE.Mesh(new THREE.IcosahedronGeometry(0.54, 1), flat(0xfff1a8, 0xffcc5c)));
  inner.position.y = 2.72;
  const roots = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const root = shadow(new THREE.Mesh(new THREE.ConeGeometry(0.18, 1.45, 5), flat(0x7b4f32)));
    root.position.set(Math.cos(i * 1.256) * 0.55, 0.18, Math.sin(i * 1.256) * 0.55);
    root.rotation.z = Math.PI / 2;
    root.rotation.y = -i * 1.256;
    roots.add(root);
  }
  group.add(trunk, crown, inner, roots);
  group.userData.crown = crown;
  group.userData.roots = roots;
  return group;
}

export function createEnemy(kind: EnemyKind) {
  const group = new THREE.Group();
  if (kind === "wisp") {
    const core = shadow(new THREE.Mesh(new THREE.OctahedronGeometry(0.58), flat(0x9b68d5, 0x6d3ba5)));
    core.position.y = 1.05;
    const ring = shadow(new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.07, 5, 12), flat(0xd58aff, 0x7c36a8)));
    ring.position.y = 1.05;
    ring.rotation.x = Math.PI / 2;
    group.add(core, ring);
  } else if (kind === "crawler") {
    const body = shadow(new THREE.Mesh(new THREE.DodecahedronGeometry(0.72), flat(0x51345e)));
    body.scale.set(1.25, 0.72, 1);
    body.position.y = 0.62;
    group.add(body);
    for (let i = 0; i < 4; i++) {
      const leg = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 1.05, 5), flat(0x34213e)));
      leg.position.set(i < 2 ? -0.62 : 0.62, 0.35, i % 2 ? -0.42 : 0.42);
      leg.rotation.z = i < 2 ? -0.9 : 0.9;
      group.add(leg);
    }
  } else if (kind === "brute") {
    const body = shadow(new THREE.Mesh(new THREE.DodecahedronGeometry(1.18), flat(0x443046)));
    body.scale.y = 1.18;
    body.position.y = 1.15;
    const crystal = shadow(new THREE.Mesh(new THREE.ConeGeometry(0.38, 1.25, 5), flat(0xa159bf, 0x552267)));
    crystal.position.y = 2.4;
    group.add(body, crystal);
  } else if (kind === "spitter") {
    const body = shadow(new THREE.Mesh(new THREE.SphereGeometry(0.7, 7, 5), flat(0x71508c)));
    body.position.y = 0.8;
    const mouth = shadow(new THREE.Mesh(new THREE.ConeGeometry(0.38, 0.75, 6), flat(0xc379d7, 0x71318c)));
    mouth.position.set(0, 0.92, -0.64);
    mouth.rotation.x = Math.PI / 2;
    group.add(body, mouth);
  } else {
    const body = shadow(new THREE.Mesh(new THREE.CylinderGeometry(1.45, 2, 3.4, 8), flat(0x33213f)));
    body.position.y = 1.7;
    const crown = shadow(new THREE.Mesh(new THREE.TorusGeometry(1.55, 0.22, 6, 9), flat(0xa548c1, 0x5c176f)));
    crown.position.y = 3.35;
    crown.rotation.x = Math.PI / 2;
    const heart = shadow(new THREE.Mesh(new THREE.OctahedronGeometry(0.62), flat(0xe46af3, 0xa21fb5)));
    heart.position.set(0, 1.9, -1.42);
    group.add(body, crown, heart);
    group.scale.setScalar(1.25);
  }
  return group;
}

export function createProjectile(color: number, hostile: boolean) {
  const geometry = hostile ? new THREE.SphereGeometry(0.32, 7, 5) : new THREE.OctahedronGeometry(0.27);
  const mesh = shadow(new THREE.Mesh(geometry, flat(color, color)));
  mesh.position.y = hostile ? 0.8 : 1.25;
  return mesh;
}

export function createPickup(kind: "essence" | "dew" | "fury") {
  const colors = { essence: 0x7be7b4, dew: 0x79cfff, fury: 0xff9a4d };
  const mesh = shadow(new THREE.Mesh(new THREE.OctahedronGeometry(kind === "essence" ? 0.22 : 0.34), flat(colors[kind], colors[kind])));
  mesh.position.y = 0.55;
  return mesh;
}

export function createForest(scene: THREE.Scene) {
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(59, 64),
    new THREE.MeshStandardMaterial({ color: 0x193d31, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const inner = new THREE.Mesh(
    new THREE.CircleGeometry(51, 64),
    new THREE.MeshStandardMaterial({ color: 0x285a43, roughness: 1, vertexColors: false }),
  );
  inner.position.y = 0.012;
  inner.rotation.x = -Math.PI / 2;
  inner.receiveShadow = true;
  scene.add(inner);

  const rng = mulberry32(92471);
  const trunkGeometry = new THREE.CylinderGeometry(0.35, 0.62, 3.7, 6);
  const crownGeometry = new THREE.DodecahedronGeometry(1.65);
  const trunkMaterial = flat(0x61402d);
  const crownMaterials = [flat(0x376c48), flat(0x467a50), flat(0x315b43)];
  for (let i = 0; i < 62; i++) {
    const angle = rng() * Math.PI * 2;
    const radius = i < 34 ? 48 + rng() * 8 : 11 + rng() * 35;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    if (Math.hypot(x, z) < 10) continue;
    const tree = new THREE.Group();
    const trunk = shadow(new THREE.Mesh(trunkGeometry, trunkMaterial));
    trunk.position.y = 1.85;
    const crown = shadow(new THREE.Mesh(crownGeometry, crownMaterials[i % crownMaterials.length]));
    crown.position.y = 4.3;
    crown.scale.set(0.9 + rng() * 0.45, 1 + rng() * 0.6, 0.9 + rng() * 0.45);
    tree.add(trunk, crown);
    tree.position.set(x, 0, z);
    tree.rotation.y = rng() * Math.PI;
    scene.add(tree);
  }

  const clearingMaterial = new THREE.MeshStandardMaterial({
    color: 0x8bc76c,
    emissive: 0x2b5f35,
    emissiveIntensity: 0.25,
    roughness: 0.9,
  });
  const clearingPositions = [[-31, -27], [35, -12], [12, 39]];
  for (const [x, z] of clearingPositions) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(4.3, 4.75, 28), clearingMaterial);
    ring.position.set(x, 0.035, z);
    ring.rotation.x = -Math.PI / 2;
    scene.add(ring);
  }

  const mushroomGeometry = new THREE.ConeGeometry(0.28, 0.48, 6);
  const mushroomMaterial = flat(0xf0ae73, 0x7b3a35);
  for (let i = 0; i < 55; i++) {
    const radius = 8 + rng() * 44;
    const angle = rng() * Math.PI * 2;
    const mushroom = new THREE.Mesh(mushroomGeometry, mushroomMaterial);
    mushroom.position.set(Math.cos(angle) * radius, 0.24, Math.sin(angle) * radius);
    mushroom.scale.setScalar(0.55 + rng() * 0.8);
    scene.add(mushroom);
  }
}

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
