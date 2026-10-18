import * as THREE from "three";
import { ENCOUNTERS, SPELLS } from "../game/content";
import { GameSimulation } from "../game/simulation";
import type { ProfileSave, RunState, SpellId } from "../game/types";
import { InputController } from "../input";
import { GameUI } from "../ui";
import { GameAudio } from "../audio";
import {
  createEnemy,
  createForest,
  createPickup,
  createPlayer,
  createProjectile,
  createWorldseed,
} from "./assets";

interface GameCallbacks {
  onRunEnd(state: RunState): void;
  onExit(): void;
}

export class GameApp {
  readonly simulation: GameSimulation;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(42, 1, 0.1, 180);
  private readonly clock = new THREE.Clock();
  private readonly input: InputController;
  private readonly audio = new GameAudio();
  private readonly playerMesh: THREE.Group;
  private readonly seedMesh: THREE.Group;
  private readonly enemyMeshes = new Map<number, THREE.Group>();
  private readonly projectileMeshes = new Map<number, THREE.Mesh>();
  private readonly pickupMeshes = new Map<number, THREE.Mesh>();
  private readonly targetMarker: THREE.Group;
  private frame = 0;
  private paused = false;
  private ended = false;
  private upgradeVisible = false;
  private previousProjectileCount = 0;
  private previousKills = 0;

  constructor(
    private readonly container: HTMLElement,
    private readonly ui: GameUI,
    profile: ProfileSave,
    selectedSpell: SpellId,
    private readonly callbacks: GameCallbacks,
  ) {
    this.simulation = new GameSimulation(profile);
    this.simulation.state.spell = SPELLS.find((spell) => spell.id === selectedSpell) ?? SPELLS[0];
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.replaceChildren(this.renderer.domElement);

    this.scene.background = new THREE.Color(0x172b27);
    this.scene.fog = new THREE.FogExp2(0x172b27, 0.014);
    createForest(this.scene);
    this.setupLighting();
    this.playerMesh = createPlayer(selectedSpell);
    this.seedMesh = createWorldseed();
    this.scene.add(this.playerMesh, this.seedMesh);
    this.targetMarker = this.createTargetMarker();
    this.scene.add(this.targetMarker);

    this.camera.position.set(15, 22, 20);
    this.camera.lookAt(0, 0, 0);
    this.input = new InputController(ui.joystick, ui.joystickKnob);
    this.audio.start(profile.musicVolume);
    this.ui.beginGame(() => this.togglePause());
    window.addEventListener("resize", this.onResize);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("blur", this.onBlur);
    this.renderer.domElement.addEventListener("webglcontextlost", this.onContextLost);
    this.renderer.domElement.addEventListener("webglcontextrestored", this.onContextRestored);
    this.onResize();
    this.frame = requestAnimationFrame(this.animate);
  }

  destroy() {
    cancelAnimationFrame(this.frame);
    window.removeEventListener("resize", this.onResize);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("blur", this.onBlur);
    this.renderer.domElement.removeEventListener("webglcontextlost", this.onContextLost);
    this.renderer.domElement.removeEventListener("webglcontextrestored", this.onContextRestored);
    this.input.destroy();
    this.audio.stop();
    this.scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((material) => material.dispose());
    });
    this.renderer.dispose();
    this.container.replaceChildren();
  }

  private animate = () => {
    this.frame = requestAnimationFrame(this.animate);
    const dt = this.clock.getDelta();
    if (!this.paused && !this.ended) {
      this.simulation.update(dt, this.input.getMove());
      this.processGameEvents();
    }
    this.syncView();
    this.renderer.render(this.scene, this.camera);
  };

  private processGameEvents() {
    const state = this.simulation.state;
    this.ui.update(state);
    if (state.projectiles.length > this.previousProjectileCount) this.audio.blip(510, 0.22, 0.055);
    if (state.kills > this.previousKills) this.audio.blip(190, 0.28, 0.09);
    this.previousProjectileCount = state.projectiles.length;
    this.previousKills = state.kills;

    if (state.pendingUpgrade && !this.upgradeVisible) {
      this.upgradeVisible = true;
      this.paused = true;
      this.ui.showUpgrade(state, (index) => {
        this.simulation.chooseUpgrade(index);
        this.upgradeVisible = false;
        this.paused = false;
        this.ui.hideOverlay();
        this.clock.getDelta();
      });
    }

    if ((state.phase === "victory" || state.phase === "defeat") && !this.ended) {
      this.ended = true;
      this.paused = true;
      this.callbacks.onRunEnd(state);
    }
  }

  private syncView() {
    const state = this.simulation.state;
    const elapsed = performance.now() * 0.001;
    this.playerMesh.position.set(state.player.position.x, 0, state.player.position.z);
    const move = this.input.getMove();
    if (Math.hypot(move.x, move.z) > 0.1) this.playerMesh.rotation.y = Math.atan2(move.x, move.z);
    this.playerMesh.position.y = Math.sin(elapsed * 7) * 0.045;

    this.seedMesh.position.set(state.worldseed.position.x, 0, state.worldseed.position.z);
    const crown = this.seedMesh.userData.crown as THREE.Mesh;
    const roots = this.seedMesh.userData.roots as THREE.Group;
    crown.rotation.y = elapsed * 0.24;
    crown.scale.setScalar(1 + Math.sin(elapsed * 2.4) * 0.04);
    roots.visible = state.worldseed.rooted;
    this.seedMesh.rotation.z = state.worldseed.rooted ? 0 : Math.sin(elapsed * 5) * 0.03;

    this.syncMap(
      state.enemies,
      this.enemyMeshes,
      (enemy) => {
        const mesh = createEnemy(enemy.kind);
        this.scene.add(mesh);
        return mesh;
      },
      (enemy, mesh) => {
        mesh.position.set(enemy.position.x, enemy.kind === "wisp" ? Math.sin(elapsed * 4 + enemy.id) * 0.18 : 0, enemy.position.z);
        mesh.rotation.y = Math.atan2(state.player.position.x - enemy.position.x, state.player.position.z - enemy.position.z);
        if (enemy.kind === "warden") mesh.rotation.y += Math.sin(elapsed) * 0.08;
      },
    );
    this.syncMap(
      state.projectiles,
      this.projectileMeshes,
      (projectile) => {
        const mesh = createProjectile(projectile.color, !projectile.friendly);
        this.scene.add(mesh);
        return mesh;
      },
      (projectile, mesh) => {
        mesh.position.x = projectile.position.x;
        mesh.position.z = projectile.position.z;
        mesh.rotation.y += 0.16;
        mesh.rotation.x += 0.1;
      },
    );
    this.syncMap(
      state.pickups,
      this.pickupMeshes,
      (pickup) => {
        const mesh = createPickup(pickup.kind);
        this.scene.add(mesh);
        return mesh;
      },
      (pickup, mesh) => {
        mesh.position.x = pickup.position.x;
        mesh.position.z = pickup.position.z;
        mesh.position.y = 0.55 + Math.sin(elapsed * 4 + pickup.id) * 0.16;
        mesh.rotation.y += 0.05;
      },
    );

    if (state.phase === "travel") {
      const encounter = ENCOUNTERS[state.clearingIndex];
      this.targetMarker.visible = Boolean(encounter);
      if (encounter) this.targetMarker.position.set(encounter.position.x, 0, encounter.position.z);
    } else {
      this.targetMarker.visible = false;
    }
    const markerRing = this.targetMarker.userData.ring as THREE.Mesh;
    markerRing.rotation.z = elapsed * 0.35;

    const targetCamera = new THREE.Vector3(state.player.position.x + 13, 20, state.player.position.z + 17);
    this.camera.position.lerp(targetCamera, 0.055);
    this.camera.lookAt(state.player.position.x, 0.4, state.player.position.z);
  }

  private syncMap<T extends { id: number }, M extends THREE.Object3D>(
    items: T[],
    map: Map<number, M>,
    create: (item: T) => M,
    update: (item: T, mesh: M) => void,
  ) {
    const active = new Set<number>();
    for (const item of items) {
      active.add(item.id);
      let mesh = map.get(item.id);
      if (!mesh) {
        mesh = create(item);
        map.set(item.id, mesh);
      }
      update(item, mesh);
    }
    for (const [id, mesh] of map) {
      if (active.has(id)) continue;
      this.scene.remove(mesh);
      mesh.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => material.dispose());
      });
      map.delete(id);
    }
  }

  private setupLighting() {
    const hemisphere = new THREE.HemisphereLight(0xb9e5d0, 0x1b2a21, 2.2);
    const sun = new THREE.DirectionalLight(0xffe5a5, 3.2);
    sun.position.set(-18, 32, 16);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -42;
    sun.shadow.camera.right = 42;
    sun.shadow.camera.top = 42;
    sun.shadow.camera.bottom = -42;
    const fill = new THREE.PointLight(0x8656c8, 22, 60, 2);
    fill.position.set(25, 9, -30);
    this.scene.add(hemisphere, sun, fill);
  }

  private createTargetMarker() {
    const group = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(2.6, 0.08, 5, 24),
      new THREE.MeshBasicMaterial({ color: 0xffda78, transparent: true, opacity: 0.74 }),
    );
    ring.position.y = 4.5;
    ring.rotation.x = Math.PI / 2;
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.42, 8, 8, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffdc85, transparent: true, opacity: 0.14, side: THREE.DoubleSide }),
    );
    beam.position.y = 4;
    group.add(ring, beam);
    group.userData.ring = ring;
    return group;
  }

  private togglePause() {
    if (this.ended || this.upgradeVisible) return;
    if (this.paused) {
      this.paused = false;
      this.ui.hideOverlay();
      this.clock.getDelta();
    } else {
      this.paused = true;
      this.ui.showPause(() => this.togglePause(), this.callbacks.onExit);
    }
  }

  private onKeyDown = (event: KeyboardEvent) => {
    if (event.code === "Escape") this.togglePause();
  };

  private onBlur = () => {
    if (!this.paused && !this.ended) this.togglePause();
  };

  private onResize = () => {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    this.camera.aspect = width / Math.max(height, 1);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  };

  private onContextLost = (event: Event) => {
    event.preventDefault();
    this.paused = true;
    this.ui.showHint("Graphics paused — restoring the forest", 5000);
  };

  private onContextRestored = () => {
    this.paused = false;
    this.ui.showHint("The forest has returned");
  };
}
