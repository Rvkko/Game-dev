/* ============================================================
   Pilot Fuel Tanker Explorer — Made for Dad
   Interactive educational 3D gasoline tanker (procedural, Three.js)
   Educational model only — not a replacement for company/DOT training.
   ============================================================ */
(function () {
'use strict';

/* ---------------- basic setup ---------------- */
const canvas = document.getElementById('scene');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
} catch (e) {
  document.body.innerHTML = '<p style="padding:30px">Sorry — WebGL is not available on this device/browser.</p>';
  return;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;

/* saved settings & progress */
const SAVE = (function () { try { return JSON.parse(localStorage.getItem('tankerSave')) || {}; } catch (e) { return {}; } })();

const scene = new THREE.Scene();
const DAY_SKY = 0x9ec8e8, NIGHT_SKY = 0x0b1026;
scene.background = new THREE.Color(DAY_SKY);
scene.fog = new THREE.Fog(DAY_SKY, 90, 240);

const camera = new THREE.PerspectiveCamera(50, 2, 0.1, 500);

/* soft studio-ish reflections so chrome reads as chrome */
(function makeEnv() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 32;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 32);
  g.addColorStop(0, '#cfe8ff'); g.addColorStop(0.48, '#f3f6f9');
  g.addColorStop(0.52, '#b8b1a2'); g.addColorStop(1, '#5d5c58');
  x.fillStyle = g; x.fillRect(0, 0, 64, 32);
  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromEquirectangular(tex).texture;
  tex.dispose(); pm.dispose();
})();

const hemi = new THREE.HemisphereLight(0xcfe0ff, 0x6b6156, 0.85);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff2df, 2.0);
sun.position.set(28, 42, 18);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -22; sun.shadow.camera.right = 22;
sun.shadow.camera.top = 22; sun.shadow.camera.bottom = -22;
sun.shadow.camera.far = 120;
sun.shadow.bias = -0.0015;
scene.add(sun);
const nightLight = new THREE.PointLight(0xffd9a0, 0, 60, 1.8);
nightLight.position.set(6, 8, 0);
scene.add(nightLight);

/* sky dome — procedural equirect: day sun+clouds / night stars+moon / rain overcast */
function makeSkyTex(kind) {
  return canvasTex(512, 256, (x, W, H) => {
    const g = x.createLinearGradient(0, 0, 0, H);
    if (kind === 'night') { g.addColorStop(0, '#02030a'); g.addColorStop(0.55, '#0b1026'); g.addColorStop(1, '#1a2038'); }
    else if (kind === 'rain') { g.addColorStop(0, '#5f6a72'); g.addColorStop(0.6, '#8a949c'); g.addColorStop(1, '#a8b0b6'); }
    else { g.addColorStop(0, '#2f6fc4'); g.addColorStop(0.55, '#9ec8e8'); g.addColorStop(1, '#d8ecf7'); }
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    if (kind === 'day') {
      const sg = x.createRadialGradient(370, 70, 4, 370, 70, 60);
      sg.addColorStop(0, 'rgba(255,250,220,1)'); sg.addColorStop(0.12, 'rgba(255,244,190,0.9)'); sg.addColorStop(1, 'rgba(255,244,190,0)');
      x.fillStyle = sg; x.beginPath(); x.arc(370, 70, 60, 0, 7); x.fill();
    }
    if (kind !== 'night') {
      x.fillStyle = kind === 'rain' ? 'rgba(70,78,86,0.55)' : 'rgba(255,255,255,0.85)';
      for (let i = 0; i < (kind === 'rain' ? 26 : 14); i++) {
        const cx = Math.random() * W, cy = 30 + Math.random() * 90, r = 12 + Math.random() * 26;
        for (let j = 0; j < 4; j++) {
          x.globalAlpha = 0.16;
          x.beginPath(); x.ellipse(cx + (Math.random() - 0.5) * r * 1.6, cy + (Math.random() - 0.5) * r * 0.5, r, r * 0.42, 0, 0, 7); x.fill();
        }
      }
      x.globalAlpha = 1;
    } else {
      x.fillStyle = '#fff';
      for (let i = 0; i < 340; i++) {
        x.globalAlpha = 0.25 + Math.random() * 0.75;
        x.fillRect(Math.random() * W, Math.random() * H * 0.7, Math.random() < 0.12 ? 2 : 1, 1);
      }
      x.globalAlpha = 1;
      const mg = x.createRadialGradient(120, 60, 2, 120, 60, 34);
      mg.addColorStop(0, 'rgba(240,244,255,1)'); mg.addColorStop(0.3, 'rgba(220,228,248,0.7)'); mg.addColorStop(1, 'rgba(220,228,248,0)');
      x.fillStyle = mg; x.beginPath(); x.arc(120, 60, 34, 0, 7); x.fill();
      x.fillStyle = '#e8ecfa'; x.beginPath(); x.arc(120, 60, 13, 0, 7); x.fill();
    }
  });
}
const skyTexDay = makeSkyTex('day'), skyTexNight = makeSkyTex('night'), skyTexRain = makeSkyTex('rain');
const skyMat = new THREE.MeshBasicMaterial({ map: skyTexDay, side: THREE.BackSide, fog: false, depthWrite: false });
const sky = new THREE.Mesh(new THREE.SphereGeometry(380, 32, 16), skyMat);
sky.renderOrder = -1;
scene.add(sky);
const sunFlareTex = canvasTex(128, 128, (x) => {
  const g = x.createRadialGradient(64, 64, 2, 64, 64, 62);
  g.addColorStop(0, 'rgba(255,255,235,0.95)'); g.addColorStop(0.12, 'rgba(255,226,150,0.68)'); g.addColorStop(0.42, 'rgba(255,190,95,0.16)'); g.addColorStop(1, 'rgba(255,180,80,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
});
const sunFlare = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunFlareTex, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
sunFlare.position.set(72, 78, 34); sunFlare.scale.set(11, 11, 1); scene.add(sunFlare);

/* ---------------- tiny helpers ---------------- */
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
function std(color, opt) {
  return new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.6, metalness: 0.1 }, opt || {}));
}
function box(w, h, d, m) { return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); }
function cyl(rt, rb, h, m, seg) { return new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg || 20), m); }
function at(mesh, x, y, z) { mesh.position.set(x, y, z); return mesh; }
function shadow(o) { o.traverse(n => { if (n.isMesh) { n.castShadow = true; n.receiveShadow = true; } }); return o; }
function roundedBox(w, h, d, r, m, bevel) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  r = Math.min(r, w / 2, h / 2);
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  const b = bevel || 0.04;
  const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: b, bevelThickness: b, curveSegments: 4 });
  g.translate(0, 0, -d / 2);
  g.computeVertexNormals();
  return new THREE.Mesh(g, m);
}
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/* ---------------- shared materials ---------------- */
const M = {
  red:      new THREE.MeshPhysicalMaterial({ color: 0xb3121b, roughness: 0.3, metalness: 0.28, clearcoat: 0.72, clearcoatRoughness: 0.18 }),
  redLow:   std(0xb3121b, { roughness: 0.36, metalness: 0.22 }),
  redDark:  std(0x7d0d13, { roughness: 0.5 }),
  chrome:   std(0xffffff, { roughness: 0.14, metalness: 1.0 }),
  alu:      std(0xd4d8dc, { roughness: 0.3, metalness: 0.85 }),
  steel:    std(0x33373d, { roughness: 0.65, metalness: 0.5 }),
  dark:     std(0x1e2126, { roughness: 0.8, metalness: 0.2 }),
  rubber:   std(0x181a1c, { roughness: 0.95 }),
  glass:    std(0x86b9ae, { roughness: 0.08, metalness: 0.18, transparent: true, opacity: 0.48, side: THREE.DoubleSide }),
  white:    std(0xf2f2f2, { roughness: 0.5 }),
  yellow:   std(0xffc60b, { roughness: 0.5 }),
  orange:   std(0xff7a1a, { roughness: 0.6 }),
  concrete: std(0xb9b6ae, { roughness: 0.95, metalness: 0 }),
  asphalt:  std(0x3c3f43, { roughness: 0.98, metalness: 0 }),
  green:    std(0x1f7a33, { roughness: 0.6 }),
  interior: std(0x4a4d52, { roughness: 0.85 }),
};
/* dedicated light materials (instances we toggle) */
function lightMat(base, emissive) {
  return new THREE.MeshStandardMaterial({ color: base, emissive, emissiveIntensity: 0, roughness: 0.3, metalness: 0.2 });
}
const LM = {
  head:  lightMat(0xdadfe2, 0xffffff),
  amber: lightMat(0xcc8a1a, 0xffb400),
  turnL: lightMat(0xcc8a1a, 0xffb400),
  turnR: lightMat(0xcc8a1a, 0xffb400),
  tail:  lightMat(0x5a0d0d, 0xff2020),
  brake: lightMat(0x5a0d0d, 0xff2020),
  rev:   lightMat(0xd8dde0, 0xffffff),
};

/* ---------------- part registry ---------------- */
const partRoots = {};   // id -> [Object3D]
const pickables = [];
function tag(obj, id) {
  obj.userData.partId = id;
  (partRoots[id] = partRoots[id] || []).push(obj);
  pickables.push(obj);
  return obj;
}

const INFO = {
  hood: ['Tilt Hood', 'The whole fiberglass hood tilts forward to expose the engine.', 'Gives full access for daily engine checks.', 'Check latches are secured before driving; look for cracks or loose panels.'],
  grille: ['Grille', 'Chrome grille in front of the radiator.', 'Lets cooling air reach the radiator while blocking debris.', 'Check for damage and blockage (paper, ice, bugs).'],
  headlights: ['Headlights', 'Main forward lights of the tractor.', 'Let the driver see and be seen at night and in weather.', 'Both must work — high and low beam. Tap the Lights buttons to try them.'],
  foglights: ['Fog / Marker Lights', 'Low-mounted auxiliary lights in the bumper.', 'Cut glare in fog and mark the truck’s width.', 'Check lenses for cracks and proper operation.'],
  roofMarkers: ['Roof Marker Lights', 'Five amber lights on the cab roof.', 'Required on wide vehicles so others can judge the truck’s size at night.', 'All five must light with the marker switch.'],
  mirrors: ['Mirrors', 'West-coast flat mirrors plus convex spot mirrors.', 'The driver’s main view down both sides of a 70-ft rig.', 'Clean, adjusted, brackets tight, no cracks.'],
  windshield: ['Windshield & Wipers', 'Laminated glass with electric wipers.', 'Clear forward vision in all weather.', 'No cracks in the driver’s view; wipers and washers must work.'],
  doorL: ['Driver Door', 'Left-side cab door with window and mirror mount.', 'Driver entry — always maintain 3 points of contact climbing in.', 'Hinges, latch, window and seal in good shape. Tap the door button to open it.'],
  doorR: ['Passenger Door', 'Right-side cab door.', 'Secondary entry and exit.', 'Same checks as the driver door.'],
  steps: ['Cab Steps', 'Grip-textured steps below each door.', 'Safe climbing with 3 points of contact.', 'Secure, not bent, free of ice/fuel/grease.'],
  grabHandles: ['Grab Handles', 'Vertical handles beside the doors.', 'The other part of 3-point contact.', 'Tightly mounted, not bent.'],
  sleeper: ['Sleeper Berth', 'Compact sleeper compartment behind the seats.', 'Rest area for required off-duty time on long hauls.', 'Bunk restraint and exits in working order.'],
  exhaust: ['Exhaust Stack', 'Vertical chrome exhaust with heat shield.', 'Carries hot diesel exhaust above the cab — critical on a fuel truck.', 'Mounted tight, no leaks (sparks/heat near gasoline vapors are dangerous).'],
  frame: ['Chassis / Frame', 'The tractor’s steel frame rails.', 'Everything — cab, engine, fifth wheel — bolts to these rails.', 'No cracks, bends, loose bolts or shifted crossmembers.'],
  fuelTanks: ['Tractor Fuel Tanks', 'Polished aluminum saddle tanks (the truck’s own diesel).', 'Fuel for the tractor engine — separate from the cargo in the trailer!', 'Caps tight, straps secure, no leaks or dents.'],
  defTank: ['DEF Tank', 'Small tank for Diesel Exhaust Fluid.', 'DEF is injected into the exhaust to cut emissions.', 'Adequate level; cap sealed (blue cap = DEF).'],
  engine: ['Engine Block', 'Heavy-duty inline-6 diesel (typically 400–500 hp).', 'Moves 80,000 lbs of truck and fuel.', 'Look for oil/coolant/fuel leaks, loose wires, worn parts.'],
  radiator: ['Radiator', 'Large cooling core at the front of the engine bay.', 'Keeps the engine at operating temperature.', 'Coolant level, no leaks, fins clear of debris.'],
  fan: ['Cooling Fan', 'Engine-driven fan behind the radiator.', 'Pulls air through the radiator at low speed.', 'Blades intact; spins with the engine (start the engine to see it).'],
  belts: ['Belts & Hoses', 'Serpentine belt and coolant hoses.', 'Drive the alternator, water pump, and A/C.', 'No cracks, fraying, glazing or soft/bulging hoses.'],
  airfilter: ['Air Intake / Filter', 'Intake ducting with a large filter canister.', 'Clean air for the engine — a diesel swallows huge volumes of it.', 'Restriction indicator, clamps tight, no cracks in ducting.'],
  coolant: ['Coolant Reservoir', 'Translucent overflow bottle.', 'Shows coolant level at a glance.', 'Level between MIN and MAX marks; never open hot.'],
  batteries: ['Battery Box', 'Battery bank in a covered box on the frame.', 'Cranks the engine and powers electrical systems.', 'Terminals clean/tight, hold-downs secure, cover in place.'],
  oilCheck: ['Oil / Fluid Check Points', 'Dipstick and fill points, marked yellow.', 'Daily oil-level check keeps the engine alive.', 'Oil level in the safe range; no fresh drips under the truck.'],
  engLabel: ['Engine Warning Labels', 'Caution decals in the engine bay.', 'Warn about the fan, hot surfaces and pressurized coolant.', 'Read and respect them — a fan can start without warning.'],
  fifthWheel: ['Fifth Wheel', 'Greased steel plate with locking jaws over the rear axles.', 'This is what carries and locks the trailer to the tractor.', 'Properly greased, mounted tight, jaws locked around the kingpin, release arm in.'],
  kingpin: ['Kingpin & Coupling', 'Hardened steel pin under the trailer’s nose.', 'The fifth-wheel jaws close around it — the only thing holding the trailer.', 'No cracks or wear; jaws fully closed; no gap between trailer apron and fifth wheel.'],
  airLines: ['Air & Electrical Lines', 'Red (emergency) and blue (service) air lines plus the green electrical pigtail.', 'They supply the trailer’s brakes and lights.', 'No leaks, chafing or tangling; gladhand seals good; lines secured.'],
  wheelsTractor: ['Tractor Tires & Wheels', 'Steer singles up front, drive duals behind.', 'The contact patch for steering and 80,000 lbs of braking.', 'Tread depth (4/32 steer, 2/32 drive), inflation, no sidewall damage, lug nuts tight, no rust trails.'],
  mudflapsTractor: ['Mud Flaps', 'Rubber flaps behind the drive wheels.', 'Stop rocks and spray from hitting cars behind.', 'Present, secure, not torn.'],
  dash: ['Dashboard', 'Wrap-around dash with gauges and switches.', 'The driver’s command center.', 'Warning lights out after start; air pressure builds to ~120 psi.'],
  steeringWheel: ['Steering Wheel', 'Large-diameter wheel for leverage.', 'Steers roughly 12,000 lbs on the front axle.', 'No more than about 10° of free play.'],
  seat: ['Air-Ride Seat', 'Suspension seat with belts.', 'Absorbs road shock over a long shift.', 'Seat belt latches and retracts properly.'],
  gauges: ['Gauge Cluster', 'Speed, RPM, air pressure, fuel, temps.', 'Air pressure gauges matter most — brakes run on air.', 'Low-air warning must trigger before 60 psi. Start the engine and watch the needles.'],
  switches: ['Switch Panel', 'Lights, wipers, air suspension dump, PTO.', 'One place for every system.', 'Know each switch before rolling.'],
  radio: ['CB / Radio Panel', 'Communication radio in the console.', 'Terminal, dispatch and traffic info.', 'Working mic and antenna.'],
  logbook: ['Logbook / ELD', 'Clipboard and electronic logging device.', 'Records driving hours — federal law for fuel haulers too.', 'Up-to-date and accurate before driving.'],
  extinguisher: ['Fire Extinguisher', '10 B:C rated extinguisher behind the seat.', 'Required safety equipment on a hazmat vehicle.', 'Charged (gauge in green), secured, accessible.'],
  tankShell: ['Tanker Shell', 'Aluminum MC-406/DOT-406 cargo tank, about 9,500 gallons.', 'Holds the gasoline in separate internal compartments.', 'Walk the whole shell: dents, gouges, leaks, weeping seams. Try X-Ray view to see inside!'],
  frontCap: ['Front Head (Cap)', 'Rounded front end of the tank.', 'Domed heads handle liquid surge pressure better than flat walls.', 'No dents or cracks, placard holder intact.'],
  rearCap: ['Rear Head (Cap)', 'Rounded rear end of the tank.', 'Same pressure-handling job as the front head.', 'Check along with the ladder and rear lights.'],
  tankFrame: ['Tanker Frame & Saddles', 'Sub-frame and saddle supports under the shell.', 'Ties the tank to the running gear and kingpin.', 'No cracked welds or loose bolts where saddle meets shell.'],
  catwalk: ['Top Catwalk', 'Non-slip walkway along the tank top.', 'The only safe path when working at the hatches.', 'Grip surface intact, nothing loose. Fall protection is required at the rack in real life.'],
  hatch: ['Manholes / Top Hatches', 'One sealed hatch per compartment (4 here).', 'Access for cleaning and inspection; house the pressure/vacuum vents.', 'Covers closed and latched, gaskets sound, no product seepage.'],
  vaporRecovery: ['Vapor Recovery', 'Vapor line and hood connections.', 'Returns gasoline vapors to the terminal/station tank instead of the air.', 'Caps in place, hoses/couplers undamaged. Required at most sites.'],
  sidePiping: ['Side Piping', 'Product piping running under the shell.', 'Routes fuel from each compartment to the manifold.', 'No dents, kinks, or drips at the joints.'],
  valves: ['Product Valves / Manifold', 'Emergency (internal) valves per compartment feed API adapters at the manifold.', 'Where the delivery hose couples on. Internal valves stay shut unless delivering.', 'Dust caps on, no leaks, handles move freely. Tap the Valve button to work it.'],
  hose: ['Fuel Delivery Hose', '4-inch petroleum drop hose.', 'Gravity-drops fuel from the trailer into the station’s underground tank.', 'No cuts, soft spots, or damaged cam-lock couplers. Try the Hose buttons!'],
  hoseTubes: ['Hose Storage Tubes', 'Long tubes under the tank’s side.', 'Keep hoses clean, drained and secure between stops.', 'End caps latched so a hose can’t slide out on the highway.'],
  emergencyShutoff: ['Emergency Shutoff', 'Remote emergency valve control (red handle).', 'Instantly closes all internal valves if something goes wrong during a drop.', 'Clearly marked, reachable, tested. Know where it is BEFORE unloading.'],
  ladder: ['Rear Ladder', 'Fixed ladder up the rear head.', 'Access to the catwalk and hatches.', 'Rungs tight, no bends; keep boots clean of fuel.'],
  rearBumper: ['Rear Bumper (Underride Guard)', 'DOT bumper below the rear head.', 'Stops cars from sliding under the trailer in a crash.', 'Secure and undamaged — it’s also rear-impact protection for the tank.'],
  rearLights: ['Rear Lights', 'Tail, brake, and turn lamps.', 'Signal 40 tons of intentions to traffic.', 'All working, lenses intact. Try Brake and Hazard buttons.'],
  sideMarkers: ['Side Marker Lights', 'Amber (front/middle) and red (rear) markers.', 'Show the trailer’s length at night from the side.', 'All lit with markers on; none cracked.'],
  reflectiveTape: ['Reflective Conspicuity Tape', 'Red/white DOT-C2 tape along the sides and rear.', 'Makes the trailer visible in headlights even with dead bulbs.', 'Continuous coverage, not peeling or painted over.'],
  landingGear: ['Landing Gear', 'Crank-down support legs.', 'Hold the loaded trailer when the tractor unhooks.', 'Fully raised before driving! Legs straight, crank handle stowed. Try the Gear button.'],
  wheelsTrailer: ['Trailer Tires, Axles & Suspension', 'Tandem axles with air-ride suspension and dual wheels.', 'Carry most of the cargo weight.', 'Tread/inflation/duals not touching, airbags sound, no leaking hubs.'],
  mudflapsTrailer: ['Trailer Mud Flaps', 'Flaps behind the trailer tandems.', 'Protect traffic from spray and stones.', 'Present and secure.'],
  placard: ['Hazmat Placards', 'Diamond placards on all four sides. Gasoline = red Class 3 flammable, UN 1203. Diesel = UN 1993.', 'Tell responders exactly what’s in the tank from 100 ft away. The CARGO decides the placard — switch Cargo mode to see.', 'Correct number for the product, all 4 visible and legible. Educational model only — placarding rules come from 49 CFR and company training.'],
  compartments: ['Internal Compartments', 'The tank is split into 4 separate compartments (about 2,500 + 2,500 + 2,000 + 2,500 gal).', 'Lets one trailer carry different grades — regular, premium, diesel — and controls surge.', 'Drivers track exactly which product is in which compartment for every drop.'],
  port: ['Underground Tank Fill Port', 'Ground-level fill and vapor connections at the station (dummy training port here).', 'Where the drop hose couples to send fuel to the station’s underground tank.', 'Confirm the RIGHT port for the RIGHT product — a mixed drop is a catastrophic (and career-ending) mistake.'],
  pump: ['Fuel Dispenser', 'Retail dispenser on the island.', 'Pulls fuel up from the same underground tanks this truck fills.', 'Delivery drivers park clear of dispenser traffic.'],
  cones: ['Safety Cones', 'Orange cones from the truck’s kit.', 'Mark the delivery safety zone around hoses.', 'Set out before the drop, collected after.'],
  chocks: ['Wheel Chocks', 'Wedges placed against the tires.', 'Insurance against any rolling while parked and unloading.', 'Used along with parking brakes during every drop.'],
  spillKit: ['Spill Kit', 'Sealed box with absorbent pads, booms, gloves and drain covers.', 'The first response to a small drip or spill during a drop — minutes matter.', 'Sealed, fully stocked, and reachable. Check the inventory tag date.'],
  pistons: ['Pistons & Crankshaft', 'Six pistons drive the crankshaft inside the block (simplified cutaway).', 'Diesel combustion pushing these is what moves 80,000 lbs.', 'Not driver-serviceable — listen for knocks, watch for oil problems.'],
  oilPan: ['Oil Pan & Oil System', 'Sump under the engine holding the oil supply.', 'Oil lubricates and cools everything inside the block.', 'No drips under the pan; check the level at the dipstick daily.'],
  wiring: ['Wiring Harness', 'Main electrical bundle from the batteries through the firewall.', 'Feeds the starter, ECM, lights, and gauges.', 'No chafing, corrosion, or loose connectors.'],
  turbo: ['Turbocharger', 'Exhaust-driven turbine that force-feeds air to the engine.', 'A diesel this size needs boosted air to pull a loaded tanker.', 'Listen for new whines; check oil lines and clamps.'],
  firewall: ['Firewall', 'Steel wall between the engine bay and the cab.', 'Shields the driver from engine heat, noise, and fire.', 'Grommets sealed, no loose penetrations.'],
  pedals: ['Pedals', 'Throttle and brake pedals at the driver’s feet.', 'Primary control of 80,000 lbs — smooth inputs matter.', 'Full travel, no sticking, floor mat clear of the pedals.'],
  gearSelector: ['Gear Selector', 'Transmission control on the console.', 'Modern fuel haulers usually run automated-manual transmissions.', 'Starts in neutral; know the pattern before rolling.'],
  parkingBrake: ['Parking Brake Valves', 'Yellow (tractor) and red (trailer) air valves on the dash.', 'Spring brakes lock the rig when air is released — used at every stop.', 'Set both for every drop; part of securing the vehicle.'],
  gloveBox: ['Glove Box / Documents', 'Storage on the passenger side of the dash.', 'Registration, permits, and insurance live here.', 'Required paperwork present and current.'],
  sleeperBed: ['Sleeper Bunk', 'Bed in the sleeper compartment.', 'Federal hours-of-service rules require real rest on long hauls.', 'Bunk restraint works, exits clear.'],
  baffles: ['Surge Baffles', 'Perforated walls inside each compartment (solid ones are the compartment bulkheads).', 'They break up the wave when 20,000 lbs of gasoline tries to keep moving at a red light.', 'Internal — checked at tank recertification, not on the daily walkaround.'],
  sunVisor: ['Sun Visor', 'Exterior visor over the windshield.', 'Blocks low sun and makes the cab look properly custom.', 'Mounted tight, no cracks.'],
  airHorns: ['Air Horns', 'Roof-mounted chrome trumpets fed by the air system.', 'The serious horn — for real warnings (and the occasional kid doing the arm-pump).', 'Press H or the Horn button. You know you want to.'],
  antennas: ['CB Antennas', 'Twin whip antennas on the cab.', 'CB radio still lives at truck stops — channel 19 for road traffic.', 'Watch them lean back as you get rolling in Drive mode.'],
  plate: ['License Plate', 'Tennessee “PILOT 91”.', 'Combination registration covers the whole rig.', 'Tags current, plate lit at night.'],
  flag: ['Travel Center Flag', 'The Pilot flag over the lot.', 'Drivers read flags for wind at a glance — crosswind matters to a high-sided tanker.', 'Watch it blow harder in the rain!'],
  dancer: ['Sky Dancer', 'The inflatable guy who never stops celebrating.', 'Marketing science: nobody can ignore a 12-foot flailing tube man.', 'Not part of the DOT pre-trip. Unofficially: always check the vibes.'],
  sign: ['Travel Center Sign', 'The high sign visible from the interstate.', 'How drivers (and Dad) find a Pilot Flying J from miles out.', 'Just for looks here — tap the truck for the real lessons!'],
  exhaustStack: null,
};
function infoHTML(id) {
  const e = INFO[id];
  if (!e) return null;
  return '<p><b>' + e[0] + '</b></p>' +
    '<p><span class="lbl">What it is:</span> ' + e[1] + '</p>' +
    '<p><span class="lbl">Why it matters:</span> ' + e[2] + '</p>' +
    '<p><span class="lbl">Driver check:</span> ' + e[3] + '</p>';
}

/* ---------------- canvas textures ---------------- */
function drawSwooshText(x, W2, H2) {
  // banner space: origin center, x: -W2..W2 (front..rear), y: -H2..H2 (up..down on tank)
  // white under-swoosh
  x.fillStyle = '#ffffff';
  x.beginPath();
  x.moveTo(-W2, H2 * 0.30);
  x.bezierCurveTo(-W2 * 0.3, H2 * 0.42, W2 * 0.25, H2 * 0.05, W2, -H2 * 0.28);
  x.lineTo(W2, -H2 * 0.02);
  x.bezierCurveTo(W2 * 0.25, H2 * 0.32, -W2 * 0.3, H2 * 0.70, -W2, H2 * 0.60);
  x.closePath(); x.fill();
  // yellow swoosh on top
  x.fillStyle = '#ffc60b';
  x.beginPath();
  x.moveTo(-W2, H2 * 0.40);
  x.bezierCurveTo(-W2 * 0.3, H2 * 0.52, W2 * 0.25, H2 * 0.15, W2, -H2 * 0.18);
  x.lineTo(W2, 0);
  x.bezierCurveTo(W2 * 0.25, H2 * 0.34, -W2 * 0.3, H2 * 0.72, -W2, H2 * 0.62);
  x.closePath(); x.fill();
  // PILOT wordmark
  x.save();
  x.transform(1, 0, -0.22, 1, 0, 0); // italic shear
  x.fillStyle = '#ffffff';
  x.font = '900 ' + Math.round(H2 * 0.62) + 'px "Arial Black", Arial, sans-serif';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.shadowColor = 'rgba(0,0,0,0.35)'; x.shadowBlur = 8; x.shadowOffsetY = 5;
  x.fillText('PILOT', -W2 * 0.36, -H2 * 0.28);
  x.shadowColor = 'transparent';
  x.restore();
  // Flying J script
  x.save();
  x.fillStyle = '#ffd23f';
  x.font = 'italic bold ' + Math.round(H2 * 0.34) + 'px Georgia, "Times New Roman", serif';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText('Flying J', W2 * 0.30, -H2 * 0.30);
  x.restore();
  // small fleet text
  x.fillStyle = '#ffffff';
  x.font = 'bold ' + Math.round(H2 * 0.10) + 'px Arial, sans-serif';
  x.textAlign = 'center';
  x.fillText('E N E R G Y  •  F U E L  T R A N S P O R T', W2 * 0.30, -H2 * 0.06);
  x.font = 'bold ' + Math.round(H2 * 0.09) + 'px Arial, sans-serif';
  x.fillText('UNIT 91', -W2 * 0.82, -H2 * 0.62);
}
function makeTankTexture() {
  // canvas: width = around circumference (u), height = along tank length (v, top=front)
  const W = 1024, H = 2048;
  return canvasTex(W, H, (x) => {
    const paint = x.createLinearGradient(0, 0, W, 0);
    paint.addColorStop(0, '#861018'); paint.addColorStop(0.18, '#b91723'); paint.addColorStop(0.52, '#c51b27'); paint.addColorStop(0.82, '#a51019'); paint.addColorStop(1, '#780b12');
    x.fillStyle = paint; x.fillRect(0, 0, W, H);
    // rain streaks and oxidized vertical trails (canvas vertical = tank length)
    for (let i = 0; i < 90; i++) {
      const xx = Math.random() * W, yy = Math.random() * H, len = 80 + Math.random() * 520;
      const g = x.createLinearGradient(xx, yy, xx, yy + len);
      g.addColorStop(0, 'rgba(255,220,190,0)'); g.addColorStop(0.18, 'rgba(255,220,190,0.045)'); g.addColorStop(1, 'rgba(45,20,12,0)');
      x.strokeStyle = g; x.lineWidth = 1 + Math.random() * 3;
      x.beginPath(); x.moveTo(xx, yy); x.lineTo(xx + (Math.random() - 0.5) * 8, yy + len); x.stroke();
    }
    // road film and wheel spray concentrated around the lower circumference
    const grime = x.createLinearGradient(0, 0, W, 0);
    grime.addColorStop(0, 'rgba(28,25,22,0.46)'); grime.addColorStop(0.2, 'rgba(70,48,34,0.08)');
    grime.addColorStop(0.5, 'rgba(80,50,34,0)'); grime.addColorStop(0.8, 'rgba(70,48,34,0.08)'); grime.addColorStop(1, 'rgba(28,25,22,0.46)');
    x.fillStyle = grime; x.fillRect(0, 0, W, H);
    for (let i = 0; i < 260; i++) {
      const side = Math.random() < 0.5 ? Math.random() * 150 : W - Math.random() * 150;
      x.fillStyle = 'rgba(45,35,27,' + (0.02 + Math.random() * 0.08) + ')';
      x.fillRect(side, H * 0.55 + Math.random() * H * 0.45, 1 + Math.random() * 4, 2 + Math.random() * 12);
    }
    // faint horizontal weld seams (rings around tank => lines across u at fixed v)
    x.strokeStyle = 'rgba(0,0,0,0.12)'; x.lineWidth = 3;
    for (let i = 1; i < 5; i++) { x.beginPath(); x.moveTo(0, H * i / 5); x.lineTo(W, H * i / 5); x.stroke(); }
    // banner drawing: banner-x = along length(2048), banner-y = around(1024)
    // canvas(cx,cy) = (W - by, bx)
    x.save();
    x.translate(W, 0); x.rotate(Math.PI / 2);
    // now drawing coords are (bx, by), bx: 0..2048 front->rear, by: 0..1024 around
    const W2 = 940, H2 = 195;
    // right/curbside of tank centered at by=768
    x.save(); x.translate(1024, 768); drawSwooshText(x, W2, H2); x.restore();
    // left/road side at by=256 — rotate 180° so it reads upright there
    x.save(); x.translate(1024, 256); x.rotate(Math.PI); drawSwooshText(x, W2, H2); x.restore();
    x.restore();
  });
}
function makeTankSurfaceMap(roughness) {
  return canvasTex(512, 1024, (x, W, H) => {
    x.fillStyle = roughness ? '#a9a9a9' : '#777'; x.fillRect(0, 0, W, H);
    for (let i = 0; i < 450; i++) {
      const v = roughness ? 130 + Math.random() * 90 : 95 + Math.random() * 70;
      x.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')';
      x.fillRect(Math.random() * W, Math.random() * H, 1 + Math.random() * 3, 6 + Math.random() * 45);
    }
    const edge = x.createLinearGradient(0, 0, W, 0);
    edge.addColorStop(0, roughness ? '#eeeeee' : '#444'); edge.addColorStop(0.18, 'rgba(160,160,160,0)');
    edge.addColorStop(0.82, 'rgba(160,160,160,0)'); edge.addColorStop(1, roughness ? '#eeeeee' : '#444');
    x.fillStyle = edge; x.fillRect(0, 0, W, H);
  });
}
function makePlacardTexture(mode) {
  return canvasTex(256, 256, (x) => {
    x.clearRect(0, 0, 256, 256);
    // aluminum placard holder
    x.fillStyle = '#c8ccd0'; x.fillRect(8, 8, 240, 240);
    x.strokeStyle = '#8a8f94'; x.lineWidth = 4; x.strokeRect(8, 8, 240, 240);
    if (mode === 'empty') {
      x.fillStyle = '#6a6f75'; x.font = 'bold 26px Arial'; x.textAlign = 'center';
      x.fillText('NO CARGO', 128, 120);
      x.font = '18px Arial';
      x.fillText('(cleaned / purged)', 128, 150);
      return;
    }
    const un = mode === 'diesel' ? '1993' : '1203';
    // red diamond
    x.save();
    x.translate(128, 128); x.rotate(Math.PI / 4);
    const s = 148;
    x.fillStyle = '#d21f26'; x.fillRect(-s / 2, -s / 2, s, s);
    x.strokeStyle = '#ffffff'; x.lineWidth = 6; x.strokeRect(-s / 2 + 8, -s / 2 + 8, s - 16, s - 16);
    x.restore();
    // flame symbol
    x.fillStyle = '#ffffff';
    x.beginPath();
    x.moveTo(128, 42);
    x.bezierCurveTo(140, 62, 156, 68, 152, 88);
    x.bezierCurveTo(150, 100, 140, 106, 128, 108);
    x.bezierCurveTo(116, 106, 106, 100, 104, 88);
    x.bezierCurveTo(100, 68, 116, 62, 128, 42);
    x.closePath(); x.fill();
    // UN number band
    x.fillStyle = '#ffffff'; x.fillRect(70, 116, 116, 34);
    x.fillStyle = '#111'; x.font = 'bold 30px Arial'; x.textAlign = 'center';
    x.fillText(un, 128, 142);
    // class 3
    x.fillStyle = '#ffffff'; x.font = 'bold 34px Arial';
    x.fillText('3', 128, 200);
  });
}
const placardTex = { gasoline: makePlacardTexture('gasoline'), diesel: makePlacardTexture('diesel'), empty: makePlacardTexture('empty') };
function makePilotSignTexture(sub) {
  return canvasTex(512, 256, (x) => {
    x.fillStyle = '#b3121b'; x.fillRect(0, 0, 512, 256);
    x.strokeStyle = '#ffd23f'; x.lineWidth = 8; x.strokeRect(6, 6, 500, 244);
    x.save();
    x.transform(1, 0, -0.2, 1, 30, 0);
    x.fillStyle = '#fff'; x.font = '900 110px "Arial Black", Arial, sans-serif';
    x.textAlign = 'center'; x.fillText('PILOT', 256, 128);
    x.restore();
    x.fillStyle = '#ffd23f'; x.font = 'italic bold 56px Georgia, serif';
    x.textAlign = 'center'; x.fillText(sub || 'Flying J', 276, 200);
  });
}
function makeGaugeTexture(running) {
  return canvasTex(256, 128, (x) => {
    x.fillStyle = '#15171b'; x.fillRect(0, 0, 256, 128);
    const dial = (cx, cy, label, frac) => {
      x.strokeStyle = '#aab2bb'; x.lineWidth = 3;
      x.beginPath(); x.arc(cx, cy, 40, 0, Math.PI * 2); x.stroke();
      x.strokeStyle = '#555'; x.lineWidth = 2;
      for (let i = 0; i <= 8; i++) {
        const a = Math.PI * 0.75 + i / 8 * Math.PI * 1.5;
        x.beginPath();
        x.moveTo(cx + Math.cos(a) * 32, cy + Math.sin(a) * 32);
        x.lineTo(cx + Math.cos(a) * 38, cy + Math.sin(a) * 38);
        x.stroke();
      }
      x.fillStyle = '#3a3f45'; x.beginPath(); x.arc(cx, cy, 4, 0, 7); x.fill();
      x.fillStyle = '#cfd4da'; x.font = 'bold 12px Arial'; x.textAlign = 'center';
      x.fillText(label, cx, cy + 28);
    };
    dial(64, 62, 'MPH', 0);
    dial(192, 62, 'RPM', running ? 0.22 : 0);
    x.fillStyle = running ? '#39d353' : '#333'; x.beginPath(); x.arc(128, 30, 6, 0, 7); x.fill();
    x.fillStyle = '#8a919a'; x.font = '10px Arial'; x.textAlign = 'center';
    x.fillText(running ? 'ENGINE RUNNING • AIR 120 PSI' : 'ENGINE OFF', 128, 110);
  });
}
const gaugeMat = new THREE.MeshBasicMaterial({ map: makeGaugeTexture(false) });
const stripeTex = canvasTex(128, 16, (x) => {
  for (let i = 0; i < 8; i++) { x.fillStyle = i % 2 ? '#e7e2d5' : '#b92b2b'; x.fillRect(i * 16, 0, 16, 16); }
  x.fillStyle = 'rgba(64,48,38,0.16)';
  for (let i = 0; i < 34; i++) x.fillRect(Math.random() * 128, Math.random() * 16, 1 + Math.random() * 5, 1);
});
stripeTex.wrapS = THREE.RepeatWrapping; stripeTex.repeat.set(4, 1);
const tapeMat = new THREE.MeshStandardMaterial({ map: stripeTex, roughness: 0.35, metalness: 0.2, emissive: 0x552222, emissiveIntensity: 0.25 });
const doorDecalTex = canvasTex(256, 128, (x) => {
  x.clearRect(0, 0, 256, 128);
  x.fillStyle = '#ffd23f'; x.font = '900 36px "Arial Black", Arial'; x.textAlign = 'center';
  x.fillText('PILOT', 128, 44);
  x.fillStyle = '#ffffff'; x.font = 'bold 22px Arial';
  x.fillText('ENERGY  •  UNIT 91', 128, 78);
  x.font = 'italic bold 20px Georgia';
  x.fillStyle = '#ffd23f';
  x.fillText('Made for Dad ❤', 128, 110);
});
const asphaltTex = canvasTex(256, 256, (x) => {
  x.fillStyle = '#3c3f43'; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) {
    x.fillStyle = 'rgba(' + (40 + Math.random() * 50) + ',' + (40 + Math.random() * 50) + ',' + (44 + Math.random() * 50) + ',0.5)';
    x.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
});
asphaltTex.wrapS = asphaltTex.wrapT = THREE.RepeatWrapping; asphaltTex.repeat.set(40, 40);

/* ================= RIG ================= */
const rig = new THREE.Group();
scene.add(rig);
const spinWheels = [];
const steerPivots = [];

const treadTex = canvasTex(64, 64, (x) => {
  x.fillStyle = '#17191b'; x.fillRect(0, 0, 64, 64);
  x.fillStyle = '#0b0c0d';
  x.fillRect(0, 0, 10, 64); x.fillRect(28, 0, 8, 64); x.fillRect(52, 0, 8, 64);
  x.fillStyle = '#212427';
  for (let i = 0; i < 4; i++) x.fillRect(12 + (i % 2) * 26, i * 18, 14, 10);
});
treadTex.wrapS = treadTex.wrapT = THREE.RepeatWrapping; treadTex.repeat.set(22, 1);
const treadMat = new THREE.MeshStandardMaterial({ map: treadTex, bumpMap: treadTex, bumpScale: 0.15, roughness: 0.95 });
const sidewallTex = canvasTex(256, 256, (x) => {
  x.clearRect(0, 0, 256, 256);
  x.strokeStyle = 'rgba(18,20,22,0.95)'; x.lineWidth = 38; x.beginPath(); x.arc(128, 128, 99, 0, Math.PI * 2); x.stroke();
  x.fillStyle = '#aaa49a'; x.font = 'bold 20px Arial'; x.textAlign = 'center';
  x.fillText('ROADMASTER', 128, 43); x.save(); x.translate(128, 213); x.rotate(Math.PI); x.fillText('PREMIUM 22.5', 0, 0); x.restore();
  x.strokeStyle = 'rgba(200,195,180,0.22)'; x.lineWidth = 2; x.beginPath(); x.arc(128, 128, 79, 0, Math.PI * 2); x.stroke();
});
const sidewallMat = new THREE.MeshBasicMaterial({ map: sidewallTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 });
const rimDustMat = std(0xa7a49f, { roughness: 0.42, metalness: 0.72 });
function makeWheel(width, single) {
  const g = new THREE.Group();
  const spin = new THREE.Group();
  g.add(spin);
  g.userData.spin = spin;
  const tireGeo = new THREE.CylinderGeometry(0.52, 0.52, width, 28);
  tireGeo.rotateZ(Math.PI / 2);
  spin.add(new THREE.Mesh(tireGeo, [treadMat, M.rubber, M.rubber]));
  [-1, 1].forEach(s => {
    const bulge = new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.075, 8, 28), M.rubber);
    bulge.rotation.y = Math.PI / 2; bulge.position.x = s * (width / 2 - 0.015);
    spin.add(bulge);
    const brand = new THREE.Mesh(new THREE.PlaneGeometry(0.94, 0.94), sidewallMat);
    brand.rotation.y = s * Math.PI / 2; brand.position.x = s * (width / 2 + 0.076);
    brand.userData.qualityDetail = true;
    spin.add(brand);
  });
  const rimGeo = new THREE.CylinderGeometry(0.30, 0.30, width * 0.64, 24);
  rimGeo.rotateZ(Math.PI / 2);
  spin.add(new THREE.Mesh(rimGeo, rimDustMat));
  [-1, 1].forEach(s => {
    const lip = new THREE.Mesh(new THREE.TorusGeometry(0.285, 0.025, 8, 24), M.chrome);
    lip.rotation.y = Math.PI / 2; lip.position.x = s * (width / 2 + 0.02); spin.add(lip);
  });
  const hubGeo = new THREE.CylinderGeometry(0.12, 0.14, width + 0.16, 12);
  hubGeo.rotateZ(Math.PI / 2);
  spin.add(new THREE.Mesh(hubGeo, M.chrome));
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2;
    const nutGeo = new THREE.CylinderGeometry(0.028, 0.028, width + 0.2, 6);
    nutGeo.rotateZ(Math.PI / 2);
    const nut = new THREE.Mesh(nutGeo, M.steel);
    nut.position.set(0, Math.sin(a) * 0.2, Math.cos(a) * 0.2);
    spin.add(nut);
  }
  return g;
}
function addAxle(parent, z, y, width, tagId, steer) {
  const axGeo = new THREE.CylinderGeometry(0.07, 0.07, 2.1, 10); axGeo.rotateZ(Math.PI / 2);
  const axle = new THREE.Mesh(axGeo, M.steel); axle.position.set(0, y, z); parent.add(axle);
  [-1, 1].forEach(side => {
    const w = makeWheel(width);
    w.position.set(side * (width > 0.5 ? 0.95 : 1.02), y, z);
    if (steer) {
      const piv = new THREE.Group(); piv.position.copy(w.position); w.position.set(0, 0, 0);
      piv.add(w); parent.add(piv); steerPivots.push(piv);
    } else parent.add(w);
    spinWheels.push(w);
    tag(w, tagId);
  });
}

/* ---------------- tractor ---------------- */
const tractor = new THREE.Group();
rig.add(tractor);

// frame
const frameG = new THREE.Group();
[-0.45, 0.45].forEach(x => frameG.add(at(box(0.12, 0.28, 7.6, M.dark), x, 0.85, 5.2)));
frameG.add(at(box(1.0, 0.1, 0.5, M.dark), 0, 0.85, 3.0));
frameG.add(at(box(2.3, 0.42, 0.2, M.chrome), 0, 0.6, 9.12)); // bumper
tag(frameG, 'frame');
tractor.add(frameG);

// hood (tilts forward, pivot at front bottom)
const hoodG = new THREE.Group();
hoodG.position.set(0, 0.98, 8.95);
tractor.add(hoodG);
const hoodShell = new THREE.Group();
hoodShell.add(at(roundedBox(1.82, 0.92, 1.86, 0.22, M.red, 0.07), 0, 0.62, -0.95));
const hoodShoulders = at(roundedBox(2.18, 0.42, 1.82, 0.2, M.red, 0.06), 0, 0.24, -0.95);
hoodShell.add(hoodShoulders);
[-1, 1].forEach(s => {
  const fender = new THREE.Mesh(new THREE.TorusGeometry(0.57, 0.115, 8, 24, Math.PI), M.red);
  fender.rotation.y = Math.PI / 2;
  fender.position.set(s * 1.02, -0.36, -0.95);
  hoodShell.add(fender);
});
const grille = new THREE.Group();
grille.add(at(box(1.45, 0.75, 0.06, M.chrome), 0, 0.5, 0.01));
for (let i = 0; i < 5; i++) grille.add(at(box(1.3, 0.05, 0.08, M.dark), 0, 0.24 + i * 0.13, 0.02));
tag(grille, 'grille');
hoodShell.add(grille);
const headG = new THREE.Group();
[-0.85, 0.85].forEach(x => headG.add(at(box(0.32, 0.2, 0.08, LM.head), x, 0.42, 0.02)));
tag(headG, 'headlights'); hoodShell.add(headG);
const fogG = new THREE.Group();
[-0.7, 0.7].forEach(x => fogG.add(at(box(0.18, 0.12, 0.08, x < 0 ? LM.turnL : LM.turnR), x, 0.62, 9.24)));
tag(fogG, 'foglights'); tractor.add(fogG);
// front license plate
const plateTex = canvasTex(128, 64, (x) => {
  x.fillStyle = '#f4f6f8'; x.fillRect(0, 0, 128, 64);
  x.strokeStyle = '#1a3f8f'; x.lineWidth = 6; x.strokeRect(3, 3, 122, 58);
  x.fillStyle = '#b3121b'; x.font = 'bold 11px Arial'; x.textAlign = 'center';
  x.fillText('TENNESSEE', 64, 16);
  x.fillStyle = '#1a3f8f'; x.font = '900 26px Arial';
  x.fillText('PILOT-91', 64, 44);
});
const plateMat = new THREE.MeshStandardMaterial({ map: plateTex, roughness: 0.5, metalness: 0.2 });
const frontPlate = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.2), plateMat);
frontPlate.position.set(0, 0.44, 9.23);
tag(frontPlate, 'plate'); tractor.add(frontPlate);
// chrome air intake on hood + exhaust of hood emblem
hoodShell.add(at(roundedBox(0.5, 0.06, 1.2, 0.03, M.chrome, 0.015), 0, 1.07, -0.9));
tag(hoodShell, 'hood');
hoodG.add(hoodShell);

// engine bay (revealed under hood)
const bay = new THREE.Group();
tractor.add(bay);
const engBlock = at(box(0.9, 0.9, 1.5, std(0x555a60, { roughness: 0.6, metalness: 0.6 })), 0, 1.25, 8.0);
tag(engBlock, 'engine'); bay.add(engBlock);
bay.add(tag(at(box(0.85, 0.12, 1.4, std(0xb8860b, { metalness: 0.7, roughness: 0.4 })), 0, 1.86, 8.0), 'engine'));
const radiator = at(box(1.35, 0.95, 0.12, std(0x23262a, { roughness: 0.9 })), 0, 1.35, 8.82);
tag(radiator, 'radiator'); bay.add(radiator);
const fan = new THREE.Group();
for (let i = 0; i < 6; i++) {
  const b = box(0.09, 0.42, 0.03, M.alu);
  b.position.y = 0.24;
  const h = new THREE.Group(); h.rotation.z = i * Math.PI / 3; h.add(b); fan.add(h);
}
fan.position.set(0, 1.35, 8.66);
tag(fan, 'fan'); bay.add(fan);
const beltMesh = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.03, 8, 24), M.rubber);
beltMesh.position.set(0, 1.2, 8.78);
tag(beltMesh, 'belts'); bay.add(beltMesh);
const airFilterGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.55, 14); airFilterGeo.rotateX(Math.PI / 2);
const airFilter = new THREE.Mesh(airFilterGeo, M.alu);
airFilter.position.set(-0.62, 1.6, 7.7);
tag(airFilter, 'airfilter'); bay.add(airFilter);
const coolantRes = at(box(0.25, 0.3, 0.25, std(0xe8e2d2, { transparent: true, opacity: 0.85 })), 0.62, 1.7, 8.5);
tag(coolantRes, 'coolant'); bay.add(coolantRes);
const dip = at(cyl(0.02, 0.02, 0.3, M.yellow, 8), 0.5, 1.85, 7.9);
tag(dip, 'oilCheck'); bay.add(dip);
const engLabel = at(box(0.3, 0.18, 0.01, new THREE.MeshBasicMaterial({ color: 0xffd23f })), -0.46, 1.55, 8.45);
engLabel.rotation.y = -0.5;
tag(engLabel, 'engLabel'); bay.add(engLabel);
const batBox = at(box(0.72, 0.34, 0.5, M.dark), -0.95, 0.75, 4.5);
tag(batBox, 'batteries'); tractor.add(batBox);
/* deeper engine bay: oil pan, firewall, turbo, wiring, exhaust run */
const oilPan = at(box(0.85, 0.16, 1.4, M.dark), 0, 0.72, 8.0);
tag(oilPan, 'oilPan'); bay.add(oilPan);
const firewall = at(box(1.9, 1.05, 0.06, M.redDark), 0, 1.45, 7.18);
tag(firewall, 'firewall'); bay.add(firewall);
const turboG = new THREE.Group();
const turboBody = cyl(0.11, 0.11, 0.2, M.alu, 12);
turboBody.rotation.z = Math.PI / 2; turboBody.position.set(0.5, 1.72, 7.55);
turboG.add(turboBody);
turboG.add(at(cyl(0.05, 0.05, 0.3, M.steel, 8), 0.5, 1.55, 7.55));
tag(turboG, 'turbo'); bay.add(turboG);
const wireCurve = new THREE.CatmullRomCurve3([V3(-0.95, 0.95, 4.7), V3(-0.9, 1.3, 6.2), V3(-0.6, 1.5, 7.22), V3(-0.32, 1.55, 7.9)]);
const wiring = new THREE.Mesh(new THREE.TubeGeometry(wireCurve, 24, 0.03, 6), M.rubber);
tag(wiring, 'wiring'); tractor.add(wiring);
const exhCurve = new THREE.CatmullRomCurve3([V3(0.45, 1.2, 7.5), V3(0.9, 1.3, 6.0), V3(1.15, 1.5, 4.5)]);
const exhRun = new THREE.Mesh(new THREE.TubeGeometry(exhCurve, 20, 0.055, 8), M.steel);
tag(exhRun, 'exhaust'); tractor.add(exhRun);
/* engine internals — only visible in X-Ray Engine / Cutaway */
const engineInternals = new THREE.Group();
engineInternals.visible = false;
bay.add(engineInternals);
const pistonG = new THREE.Group();
for (let i = 0; i < 6; i++) pistonG.add(at(cyl(0.055, 0.055, 0.26, M.alu, 10), 0, 1.44, 7.42 + i * 0.23));
const crankMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.45, 10), M.steel);
crankMesh.rotation.x = Math.PI / 2;
crankMesh.position.set(0, 1.0, 8.0);
pistonG.add(crankMesh);
tag(pistonG, 'pistons');
engineInternals.add(pistonG);
/* fluid schematic overlays (drawn through bodywork — educational only) */
function fluidMat(color) { return new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.75, depthTest: false }); }
const fluidPulseMats = [];
function fluidGroup(parent) {
  const g = new THREE.Group();
  g.visible = false;
  parent.add(g);
  return g;
}
const dieselG = fluidGroup(tractor);
{
  const dm = fluidMat(0xb8860b); fluidPulseMats.push(dm);
  [-1, 1].forEach(s => {
    const c = new THREE.CylinderGeometry(0.24, 0.24, 1.3, 14); c.rotateX(Math.PI / 2);
    dieselG.add(at(new THREE.Mesh(c, dm), s * 1.0, 0.62, 5.9));
  });
  const feed = new THREE.CatmullRomCurve3([V3(-1.0, 0.66, 5.9), V3(-0.5, 1.0, 7.3), V3(0, 1.1, 7.9)]);
  dieselG.add(new THREE.Mesh(new THREE.TubeGeometry(feed, 20, 0.03, 6), dm));
  tag(dieselG, 'fuelTanks');
}
const oilG = fluidGroup(tractor);
{
  const om = fluidMat(0xd9a520); fluidPulseMats.push(om);
  oilG.add(at(box(0.7, 0.1, 1.2, om), 0, 0.74, 8.0));
  const path = new THREE.CatmullRomCurve3([V3(0, 0.8, 8.0), V3(0.32, 1.5, 8.0), V3(0, 1.84, 8.0)]);
  oilG.add(new THREE.Mesh(new THREE.TubeGeometry(path, 16, 0.028, 6), om));
  tag(oilG, 'oilPan');
}
const coolG = fluidGroup(tractor);
{
  const cm = fluidMat(0x2fd66a); fluidPulseMats.push(cm);
  const loop = new THREE.CatmullRomCurve3(
    [V3(0, 1.35, 8.78), V3(0.45, 1.55, 8.4), V3(0.3, 1.6, 8.0), V3(-0.3, 1.45, 8.0), V3(-0.45, 1.3, 8.5)], true);
  coolG.add(new THREE.Mesh(new THREE.TubeGeometry(loop, 40, 0.035, 6, true), cm));
  tag(coolG, 'coolant');
}
const defG = fluidGroup(tractor);
{
  const fm = fluidMat(0x2e6fe8); fluidPulseMats.push(fm);
  const c = new THREE.CylinderGeometry(0.17, 0.17, 0.6, 12); c.rotateX(Math.PI / 2);
  defG.add(at(new THREE.Mesh(c, fm), -1.0, 0.6, 4.4));
  tag(defG, 'defTank');
}
[dieselG, oilG, coolG, defG].forEach(g => g.traverse(n => { n.renderOrder = 50; }));

// cab
const cabG = new THREE.Group();
tractor.add(cabG);
const cabMain = at(roundedBox(2.4, 1.6, 1.5, 0.22, M.red, 0.07), 0, 1.7, 6.3);
cabG.add(cabMain);
const cabRoof = at(roundedBox(2.34, 0.54, 1.42, 0.24, M.red, 0.09), 0, 2.77, 6.25);
cabG.add(cabRoof);
const sleeper = at(roundedBox(2.4, 1.5, 1.05, 0.18, M.red, 0.06), 0, 1.68, 5.1);
tag(sleeper, 'sleeper'); cabG.add(sleeper);
const roofFairBase = at(roundedBox(2.3, 0.75, 1.0, 0.2, M.red, 0.07), 0, 2.72, 5.12);
cabG.add(roofFairBase);
const fairing = at(roundedBox(2.2, 0.7, 1.15, 0.24, M.red, 0.09), 0, 3.12, 5.45);
fairing.rotation.x = 0.35; cabG.add(fairing);
// windshield
const wsGeo = new THREE.BoxGeometry(2.05, 0.75, 0.05);
const windshield = new THREE.Mesh(wsGeo, M.glass);
windshield.position.set(0, 2.35, 7.06); windshield.rotation.x = -0.13;
tag(windshield, 'windshield'); cabG.add(windshield);
const wiperG = new THREE.Group();
const wiperPivots = [];
[-0.5, 0.35].forEach(x => {
  const piv = new THREE.Group();
  piv.position.set(x, 1.95, 7.12);
  piv.add(at(box(0.035, 0.42, 0.02, M.dark), 0, 0.21, 0));
  piv.add(at(box(0.02, 0.34, 0.015, M.rubber), 0.035, 0.36, 0.006));
  piv.rotation.z = 0.5;
  wiperPivots.push(piv);
  wiperG.add(piv);
});
tag(wiperG, 'windshield'); cabG.add(wiperG);
// roof markers
const roofMk = new THREE.Group();
for (let i = -2; i <= 2; i++) roofMk.add(at(cyl(0.05, 0.06, 0.06, LM.amber, 10), i * 0.42, 3.07, 6.9));
tag(roofMk, 'roofMarkers'); cabG.add(roofMk);
// sun visor
const visor = at(box(2.15, 0.05, 0.55, M.red), 0, 2.8, 7.22);
visor.rotation.x = -0.45;
tag(visor, 'sunVisor'); cabG.add(visor);
// air horns
const hornG = new THREE.Group();
[-0.3, 0.3].forEach(x => {
  const h = cyl(0.05, 0.085, 0.5, M.chrome, 12);
  h.rotation.x = Math.PI / 2 - 0.15;
  h.position.set(x, 3.14, 6.4);
  hornG.add(h);
});
tag(hornG, 'airHorns'); cabG.add(hornG);
// CB whip antennas (sway with speed)
const antennas = [];
[-1.0, 1.0].forEach(x => {
  const piv = new THREE.Group();
  piv.position.set(x, 3.46, 5.15);
  piv.add(at(cyl(0.008, 0.012, 1.15, M.dark, 6), 0, 0.575, 0));
  antennas.push(piv);
  cabG.add(piv);
});
tag(antennas[0], 'antennas'); tag(antennas[1], 'antennas');
// mirrors
const mirrorG = new THREE.Group();
[-1, 1].forEach(s => {
  const arm = at(cyl(0.02, 0.02, 0.5, M.chrome, 8), s * 1.32, 2.45, 7.02);
  arm.rotation.z = s * 1.2; mirrorG.add(arm);
  mirrorG.add(at(box(0.06, 0.55, 0.28, M.chrome), s * 1.52, 2.25, 7.0));
  mirrorG.add(at(box(0.05, 0.18, 0.18, M.chrome), s * 1.5, 1.85, 7.0));
});
tag(mirrorG, 'mirrors'); cabG.add(mirrorG);
// doors (front-hinged)
function makeDoor(side) { // side -1 = driver/left
  const piv = new THREE.Group();
  piv.position.set(side * 1.21, 1.75, 6.95);
  const d = new THREE.Group();
  const panel = at(roundedBox(1.15, 1.35, 0.06, 0.08, M.red, 0.025), 0, -0.12, -0.58);
  panel.rotation.y = Math.PI / 2; d.add(panel);
  d.add(at(box(0.05, 0.55, 1.0, M.glass), 0, 0.62, -0.58));
  const decal = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.4),
    new THREE.MeshBasicMaterial({ map: doorDecalTex, transparent: true }));
  decal.position.set(side * 0.035, -0.05, -0.58);
  decal.rotation.y = side * Math.PI / 2;
  d.add(decal);
  d.add(at(box(0.04, 0.5, 0.06, M.chrome), side * 0.05, 0.1, -1.1)); // inner grab
  d.add(at(box(0.05, 0.045, 0.2, M.chrome), side * 0.05, -0.28, -1.0)); // outside door handle
  d.add(at(cyl(0.012, 0.012, 0.05, M.dark, 8), side * 0.05, -0.36, -1.0)); // keyhole
  piv.add(d);
  cabG.add(piv);
  return piv;
}
const doorLPiv = makeDoor(-1); tag(doorLPiv, 'doorL');
const doorRPiv = makeDoor(1); tag(doorRPiv, 'doorR');
/* outer cab shell — faded by X-Ray Cab / Full Cutaway views */
const cabShellParts = [cabMain, cabRoof, sleeper, roofFairBase, fairing, windshield, doorLPiv, doorRPiv];
// steps & handles
const stepsG = new THREE.Group();
[-1, 1].forEach(s => {
  stepsG.add(at(box(0.55, 0.06, 0.4, M.steel), s * 1.1, 0.42, 6.4));
  stepsG.add(at(box(0.55, 0.06, 0.4, M.steel), s * 1.1, 0.78, 6.4));
});
tag(stepsG, 'steps'); tractor.add(stepsG);
const grabG = new THREE.Group();
[-1, 1].forEach(s => grabG.add(at(cyl(0.025, 0.025, 1.1, M.chrome, 8), s * 1.24, 1.6, 7.06)));
tag(grabG, 'grabHandles'); cabG.add(grabG);
// exhaust
const exhaustG = new THREE.Group();
exhaustG.add(at(cyl(0.09, 0.09, 2.5, M.chrome, 14), 1.15, 2.5, 4.45));
exhaustG.add(at(cyl(0.13, 0.13, 1.1, M.alu, 14), 1.15, 1.8, 4.45));
tag(exhaustG, 'exhaust'); tractor.add(exhaustG);
// tractor fuel tanks
const tFuelG = new THREE.Group();
[-1, 1].forEach(s => {
  const g = new THREE.CylinderGeometry(0.33, 0.33, 1.5, 18); g.rotateX(Math.PI / 2);
  tFuelG.add(at(new THREE.Mesh(g, M.chrome), s * 1.0, 0.66, 5.9));
  tFuelG.add(at(box(0.75, 0.06, 0.3, M.steel), s * 1.0, 1.02, 5.9));
});
tag(tFuelG, 'fuelTanks'); tractor.add(tFuelG);
const defGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.7, 14); defGeo.rotateX(Math.PI / 2);
const defTank = new THREE.Mesh(defGeo, std(0xe8eef2, { roughness: 0.4 }));
defTank.position.set(-1.0, 0.62, 4.4);
tag(defTank, 'defTank'); tractor.add(defTank);
// fifth wheel
const fwG = new THREE.Group();
const fwGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.09, 24, 1, false, Math.PI * 0.15, Math.PI * 1.7);
const fwPlate = new THREE.Mesh(fwGeo, std(0x3a3d42, { roughness: 0.45, metalness: 0.8 }));
fwPlate.position.set(0, 1.14, 2.9);
fwG.add(fwPlate);
fwG.add(at(box(0.9, 0.12, 0.5, M.steel), 0, 1.05, 2.9));
tag(fwG, 'fifthWheel'); tractor.add(fwG);
// air/electrical lines to trailer
const lineColors = [0xcc2222, 0x2255cc, 0x22aa44];
const airLinesG = new THREE.Group();
lineColors.forEach((col, i) => {
  const curve = new THREE.CatmullRomCurve3([
    V3(-0.3 + i * 0.3, 2.35, 5.55), V3(-0.3 + i * 0.3, 1.9, 4.2), V3(-0.25 + i * 0.25, 2.5, 3.2)
  ]);
  airLinesG.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 20, 0.025, 6), std(col, { roughness: 0.7 })));
});
tag(airLinesG, 'airLines'); tractor.add(airLinesG);
// wheels
addAxle(tractor, 8.0, 0.52, 0.36, 'wheelsTractor', true);
addAxle(tractor, 3.5, 0.52, 0.62, 'wheelsTractor');
addAxle(tractor, 2.2, 0.52, 0.62, 'wheelsTractor');
const flapTex = canvasTex(128, 128, (x) => {
  x.fillStyle = '#141618'; x.fillRect(0, 0, 128, 128);
  x.save(); x.transform(1, 0, -0.18, 1, 12, 0);
  x.fillStyle = '#ffffff'; x.font = '900 30px "Arial Black", Arial'; x.textAlign = 'center';
  x.fillText('PILOT', 64, 62);
  x.restore();
  x.fillStyle = '#ffd23f'; x.fillRect(20, 76, 88, 7);
});
const flapMat = new THREE.MeshStandardMaterial({ map: flapTex, roughness: 0.95 });
const mudTracG = new THREE.Group();
[-1, 1].forEach(s => mudTracG.add(at(box(0.55, 0.6, 0.03, flapMat), s * 0.95, 0.35, 1.7)));
tag(mudTracG, 'mudflapsTractor'); tractor.add(mudTracG);

/* cab interior */
const interior = new THREE.Group();
cabG.add(interior);
interior.add(at(box(2.2, 0.05, 2.4, M.interior), 0, 0.95, 5.9)); // floor
const dashG = new THREE.Group();
dashG.add(at(box(2.15, 0.4, 0.35, M.dark), 0, 1.62, 6.82));
tag(dashG, 'dash'); interior.add(dashG);
const gaugePlane = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.3), gaugeMat);
gaugePlane.position.set(-0.55, 1.78, 6.66); gaugePlane.rotation.x = -0.35; gaugePlane.rotation.y = Math.PI;
gaugePlane.rotation.order = 'YXZ';
tag(gaugePlane, 'gauges'); interior.add(gaugePlane);
/* real gauge needles driven by speed / rpm */
function makeNeedle() {
  const n = new THREE.Group();
  const b = box(0.012, 0.075, 0.004, new THREE.MeshBasicMaterial({ color: 0xff5330 }));
  b.position.y = 0.028;
  n.add(b);
  n.position.z = 0.008;
  gaugePlane.add(n);
  return n;
}
const mphNeedle = makeNeedle(); mphNeedle.position.x = -0.15;
const rpmNeedle = makeNeedle(); rpmNeedle.position.x = 0.15;
function setNeedle(n, frac) {
  const a = Math.PI * 0.75 + Math.max(0, Math.min(1, frac)) * Math.PI * 1.5;
  n.rotation.z = Math.atan2(-Math.cos(a), -Math.sin(a));
}
setNeedle(mphNeedle, 0); setNeedle(rpmNeedle, 0);
const switchPanel = at(box(0.4, 0.18, 0.04, std(0x2b2f36)), 0.05, 1.7, 6.68);
tag(switchPanel, 'switches'); interior.add(switchPanel);
const radio = at(box(0.3, 0.12, 0.1, std(0x111318)), 0.05, 1.5, 6.7);
tag(radio, 'radio'); interior.add(radio);
const logbook = at(box(0.22, 0.02, 0.3, M.white), 0.6, 1.84, 6.7);
logbook.rotation.z = 0.1;
tag(logbook, 'logbook'); interior.add(logbook);
const wheelG = new THREE.Group();
const swTorus = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.025, 8, 24), M.dark);
wheelG.add(swTorus);
wheelG.add(at(cyl(0.03, 0.04, 0.35, M.dark, 8), 0, 0, 0));
wheelG.children[1].rotation.x = Math.PI / 2;
for (let i = 0; i < 3; i++) {
  const spoke = box(0.03, 0.2, 0.015, M.dark);
  spoke.position.y = 0.1;
  const h = new THREE.Group(); h.rotation.z = Math.PI + i * (Math.PI * 2 / 3); h.add(spoke);
  wheelG.add(h);
}
wheelG.position.set(-0.55, 1.62, 6.45); wheelG.rotation.x = -1.1;
tag(wheelG, 'steeringWheel'); interior.add(wheelG);
const seatG = new THREE.Group();
[-0.55, 0.55].forEach(x => {
  const s = new THREE.Group();
  s.add(at(box(0.5, 0.12, 0.5, M.interior), 0, 0, 0));
  s.add(at(box(0.5, 0.6, 0.12, M.interior), 0, 0.35, -0.25));
  s.add(at(box(0.32, 0.16, 0.1, M.interior), 0, 0.74, -0.26)); // headrest
  s.add(at(box(0.08, 0.1, 0.45, M.interior), -0.29, 0.15, -0.05)); // armrest
  s.position.set(x, 1.35, 5.9);
  seatG.add(s);
});
tag(seatG, 'seat'); interior.add(seatG);
const ext = at(cyl(0.06, 0.06, 0.3, std(0xcc1111), 10), -0.95, 1.25, 5.45);
tag(ext, 'extinguisher'); interior.add(ext);
/* deeper cab interior */
const pedalsG = new THREE.Group();
[-0.68, -0.45].forEach(px => {
  const pl = at(box(0.12, 0.18, 0.02, M.dark), px, 1.12, 6.62);
  pl.rotation.x = -0.5;
  pedalsG.add(pl);
});
tag(pedalsG, 'pedals'); interior.add(pedalsG);
const gearSel = new THREE.Group();
gearSel.add(at(cyl(0.015, 0.015, 0.18, M.steel, 8), -0.25, 1.5, 6.35));
gearSel.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), M.dark), -0.25, 1.6, 6.35));
tag(gearSel, 'gearSelector'); interior.add(gearSel);
const pBrake = new THREE.Group();
pBrake.add(at(box(0.09, 0.05, 0.09, M.yellow), -0.3, 1.62, 6.6));
pBrake.add(at(box(0.09, 0.05, 0.09, std(0xd21f26)), -0.17, 1.62, 6.6));
tag(pBrake, 'parkingBrake'); interior.add(pBrake);
const glove = at(box(0.5, 0.22, 0.04, M.dark), 0.55, 1.5, 6.62);
tag(glove, 'gloveBox'); interior.add(glove);
interior.add(at(cyl(0.045, 0.04, 0.06, M.dark, 10), 0.0, 1.42, 6.3));  // cup holders
interior.add(at(cyl(0.045, 0.04, 0.06, M.dark, 10), 0.11, 1.42, 6.3));
const bunk = new THREE.Group();
bunk.add(at(box(2.0, 0.16, 0.85, M.interior), 0, 1.32, 5.02));
bunk.add(at(box(0.5, 0.08, 0.6, M.white), -0.6, 1.44, 5.02)); // pillow
tag(bunk, 'sleeperBed'); interior.add(bunk);
[-0.55, 0.55].forEach(x => { // seat belts
  const belt = at(box(0.06, 0.5, 0.015, M.dark), x - 0.18, 1.55, 5.72);
  belt.rotation.z = 0.35;
  interior.add(belt);
});
[-0.55, 0.55].forEach(x => interior.add(at(box(0.55, 0.012, 0.6, M.rubber), x, 0.985, 6.35)));  // floor mats

/* ---------------- trailer (articulated — follows the fifth wheel) ---------------- */
const trailer = new THREE.Group();
scene.add(trailer);
const KINGPIN_Z = 2.9, TRAILER_WHEELBASE = 11.65;
let trailerYaw = 0;
const trailerAxle = V3(0, 0, KINGPIN_Z - TRAILER_WHEELBASE);
function hitchWorld() {
  return V3(Math.sin(rig.rotation.y) * KINGPIN_Z, 0, Math.cos(rig.rotation.y) * KINGPIN_Z).add(rig.position);
}
function updateTrailer() {
  const h = hitchWorld();
  const dir = h.clone().sub(trailerAxle); dir.y = 0;
  if (dir.lengthSq() < 1e-8) dir.set(Math.sin(trailerYaw), 0, Math.cos(trailerYaw));
  dir.normalize();
  trailerAxle.copy(h).addScaledVector(dir, -TRAILER_WHEELBASE);
  trailerYaw = Math.atan2(dir.x, dir.z);
  trailer.rotation.y = trailerYaw;
  trailer.position.set(h.x - Math.sin(trailerYaw) * KINGPIN_Z, 0, h.z - Math.cos(trailerYaw) * KINGPIN_Z);
}
function placeRig(x, z, yaw) {
  rig.position.set(x, 0, z); rig.rotation.set(0, yaw, 0);
  const h = hitchWorld();
  trailerYaw = yaw;
  trailerAxle.copy(h).addScaledVector(V3(Math.sin(yaw), 0, Math.cos(yaw)), -TRAILER_WHEELBASE);
  updateTrailer();
}
const TANK_R = 1.04, TANK_Y = 2.34;

const tankG = new THREE.Group();
tankG.position.set(0, TANK_Y, -3.75);
trailer.add(tankG);
const shellGeo = new THREE.CylinderGeometry(TANK_R, TANK_R, 11.6, 44, 1, true);
shellGeo.rotateX(Math.PI / 2);
const tankTexture = makeTankTexture();
const tankBump = makeTankSurfaceMap(false), tankRoughness = makeTankSurfaceMap(true);
const shellMat = new THREE.MeshPhysicalMaterial({ map: tankTexture, bumpMap: tankBump, bumpScale: 0.025, roughnessMap: tankRoughness, roughness: 0.34, metalness: 0.38, clearcoat: 0.68, clearcoatRoughness: 0.2 });
const shellMatLow = new THREE.MeshStandardMaterial({ map: tankTexture, roughness: 0.38, metalness: 0.3 });
const shell = new THREE.Mesh(shellGeo, shellMat);
shell.userData.qualityHigh = shellMat; shell.userData.qualityLow = shellMatLow;
tag(shell, 'tankShell'); tankG.add(shell);
const capMatF = new THREE.MeshPhysicalMaterial({ color: 0xb3121b, roughness: 0.3, metalness: 0.3, clearcoat: 0.68, clearcoatRoughness: 0.2 });
const capMatLow = std(0xb3121b, { roughness: 0.36, metalness: 0.25 });
const frontCap = new THREE.Mesh(new THREE.SphereGeometry(TANK_R, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), capMatF);
frontCap.userData.qualityHigh = capMatF; frontCap.userData.qualityLow = capMatLow;
frontCap.rotation.x = Math.PI / 2; frontCap.scale.set(1, 1, 0.55);
frontCap.position.z = 5.8;
tag(frontCap, 'frontCap'); tankG.add(frontCap);
const rearCap = frontCap.clone();
rearCap.userData.qualityHigh = capMatF; rearCap.userData.qualityLow = capMatLow;
rearCap.rotation.x = -Math.PI / 2; rearCap.position.z = -5.8;
tag(rearCap, 'rearCap'); tankG.add(rearCap);
// raised weld bands around the barrel
for (let i = 1; i < 5; i++) {
  const rib = new THREE.Mesh(new THREE.TorusGeometry(TANK_R + 0.008, 0.018, 8, 40), capMatF);
  rib.position.z = -5.8 + i * (11.6 / 5);
  tankG.add(rib);
}

// internal compartments (x-ray / exploded)
const compG = new THREE.Group();
compG.position.copy(tankG.position);
trailer.add(compG);
const compSpecs = [[3.9, 2.6, '2,500 gal'], [1.05, 2.6, '2,500 gal'], [-1.6, 2.1, '2,000 gal'], [-4.2, 2.6, '2,500 gal']];
const compColors = [0xd7a13c, 0xc98a2e, 0xd7a13c, 0xc98a2e];
const compMeshes = [];
/* perforated surge baffles between compartments */
const bafFace = canvasTex(128, 128, (x) => {
  x.fillStyle = '#c9ced4'; x.beginPath(); x.arc(64, 64, 64, 0, 7); x.fill();
  x.fillStyle = '#4a4f55';
  [[64, 64], [64, 26], [64, 102], [26, 64], [102, 64]].forEach(h => { x.beginPath(); x.arc(h[0], h[1], 13, 0, 7); x.fill(); });
  x.strokeStyle = '#8a9096'; x.lineWidth = 4; x.beginPath(); x.arc(64, 64, 60, 0, 7); x.stroke();
});
const bafAlpha = canvasTex(128, 128, (x) => {
  x.fillStyle = '#fff'; x.fillRect(0, 0, 128, 128);
  x.fillStyle = '#000';
  [[64, 26], [64, 102], [26, 64], [102, 64]].forEach(h => { x.beginPath(); x.arc(h[0], h[1], 13, 0, 7); x.fill(); });
});
const bafMat = new THREE.MeshStandardMaterial({ map: bafFace, alphaMap: bafAlpha, alphaTest: 0.5, side: THREE.DoubleSide, metalness: 0.7, roughness: 0.45 });
compSpecs.forEach((cs, i) => {
  const g = new THREE.CylinderGeometry(0.88, 0.88, cs[1], 22); g.rotateX(Math.PI / 2);
  const m = new THREE.Mesh(g, std(compColors[i], { roughness: 0.5, transparent: true, opacity: 0.95 }));
  m.position.z = cs[0];
  compG.add(m);
  compMeshes.push(m);
  const lab = canvasTex(128, 64, (x) => {
    x.fillStyle = '#101216'; x.fillRect(0, 0, 128, 64);
    x.fillStyle = '#ffd23f'; x.font = 'bold 26px Arial'; x.textAlign = 'center';
    x.fillText('C' + (i + 1), 64, 28);
    x.fillStyle = '#fff'; x.font = '16px Arial'; x.fillText(cs[2], 64, 52);
  });
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: lab }));
  spr.scale.set(0.9, 0.45, 1); spr.position.set(0, 1.35, cs[0]);
  compG.add(spr);
  // perforated surge baffle between compartments
  if (i < 3) {
    const baf = new THREE.Mesh(new THREE.CircleGeometry(0.92, 24), bafMat);
    baf.position.z = cs[0] - cs[1] / 2 - 0.18;
    tag(baf, 'baffles');
    compG.add(baf);
  }
});
tag(compG, 'compartments');
compG.visible = false;

// tanker frame / saddles / kingpin
const tFrameG = new THREE.Group();
tFrameG.add(at(box(2.2, 0.14, 1.7, M.dark), 0, 1.24, 2.6)); // kingpin apron
const kingpin = at(cyl(0.06, 0.06, 0.22, M.steel, 10), 0, 1.1, 2.9);
tag(kingpin, 'kingpin'); trailer.add(kingpin);
[-0.5, 0.5].forEach(x => tFrameG.add(at(box(0.12, 0.24, 4.6, M.dark), x, 1.1, -8.0)));
tag(tFrameG, 'tankFrame'); trailer.add(tFrameG);
const saddleG = new THREE.Group();
[-8.9, -6.2, 2.2].forEach(z => saddleG.add(at(box(2.0, 0.42, 0.28, M.redDark), 0, 1.42, z)));
tag(saddleG, 'saddles'); trailer.add(saddleG);

// catwalk + rail
const catwalkG = new THREE.Group();
const cwMesh = at(box(0.55, 0.05, 7.6, std(0x2c2f33, { roughness: 0.95 })), 0, 3.42, -2.6);
catwalkG.add(cwMesh);
for (let i = 0; i < 12; i++) catwalkG.add(at(box(0.55, 0.055, 0.03, M.steel), 0, 3.425, -6.0 + i * 0.62));
const rail = at(cyl(0.02, 0.02, 7.4, M.alu, 8), 0.35, 3.75, -2.6);
rail.rotation.x = Math.PI / 2;
catwalkG.add(rail);
[-6.2, 1.0].forEach(z => catwalkG.add(at(cyl(0.02, 0.02, 0.6, M.alu, 8), 0.35, 3.55, z)));
tag(catwalkG, 'catwalk'); trailer.add(catwalkG);

// hatches + vapor vents
const hatchG = new THREE.Group();
const hatchLids = [];
[1.15, -1.35, -3.85, -6.35].forEach(z => {
  hatchG.add(at(cyl(0.29, 0.32, 0.14, M.alu, 18), 0, 3.42, z));
  const lidPiv = new THREE.Group();
  lidPiv.position.set(-0.24, 3.49, z);
  lidPiv.add(at(cyl(0.24, 0.24, 0.05, M.chrome, 18), 0.24, 0.02, 0));
  hatchLids.push(lidPiv);
  hatchG.add(lidPiv);
  const clamp = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.02, 6, 18), M.steel);
  clamp.rotation.x = Math.PI / 2; clamp.position.set(0, 3.4, z);
  hatchG.add(clamp);
});
tag(hatchG, 'hatch'); trailer.add(hatchG);
const vaporG = new THREE.Group();
[1.15, -1.35, -3.85, -6.35].forEach(z => vaporG.add(at(cyl(0.06, 0.06, 0.12, M.alu, 10), 0.42, 3.42, z)));
const vaporPipeCurve = new THREE.CatmullRomCurve3([V3(0.42, 3.42, 1.15), V3(0.72, 3.2, -5.0), V3(1.0, 1.35, -6.6), V3(1.0, 1.15, -3.9)]);
vaporG.add(new THREE.Mesh(new THREE.TubeGeometry(vaporPipeCurve, 30, 0.045, 8), M.alu));
const vaporPort = at(cyl(0.09, 0.09, 0.18, std(0xcc7722, { metalness: 0.7, roughness: 0.35 }), 12), 1.02, 1.15, -3.85);
vaporPort.rotation.z = Math.PI / 2;
vaporG.add(vaporPort);
tag(vaporG, 'vaporRecovery'); trailer.add(vaporG);

// side piping + manifold + valves
const pipeG = new THREE.Group();
[-0.85, 0.85].forEach(x => {
  const g = new THREE.CylinderGeometry(0.05, 0.05, 7.5, 10); g.rotateX(Math.PI / 2);
  pipeG.add(at(new THREE.Mesh(g, M.alu), x, 1.32, -4.4));
});
tag(pipeG, 'sidePiping'); trailer.add(pipeG);
const manifoldG = new THREE.Group();
manifoldG.add(at(box(1.5, 0.42, 0.8, M.steel), 0, 1.05, -3.3));
for (let i = 0; i < 4; i++) {
  const a = cyl(0.09, 0.09, 0.3, M.chrome, 12);
  a.rotation.z = Math.PI / 2;
  a.position.set(0.85, 1.0, -2.7 - i * 0.4);
  manifoldG.add(a);
  const lever = at(box(0.05, 0.16, 0.03, std(0xcc1111)), 0.78, 1.3, -2.7 - i * 0.4);
  manifoldG.add(lever);
}
tag(manifoldG, 'valves'); trailer.add(manifoldG);
const valveWheel = new THREE.Group();
const vw = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.02, 8, 18), std(0xcc1111));
valveWheel.add(vw);
valveWheel.add(at(box(0.24, 0.02, 0.02, std(0xcc1111)), 0, 0, 0));
valveWheel.position.set(1.03, 1.35, -3.3);
valveWheel.rotation.z = Math.PI / 2;
tag(valveWheel, 'valves'); trailer.add(valveWheel);
// emergency shutoffs
const emerG = new THREE.Group();
[[-1.02, 1.9, 2.0], [0.7, 1.35, -3.0]].forEach(p => {
  const e = new THREE.Group();
  e.add(at(box(0.16, 0.22, 0.06, std(0xd21f26)), 0, 0, 0));
  e.add(at(box(0.04, 0.14, 0.04, M.yellow), 0, 0.02, 0.05));
  e.position.set(p[0], p[1], p[2]);
  emerG.add(e);
});
tag(emerG, 'emergencyShutoff'); trailer.add(emerG);
// spill kit box on the front bulkhead
const spillKitG = new THREE.Group();
spillKitG.add(at(box(0.5, 0.35, 0.28, M.white), -0.85, 1.8, 1.9));
spillKitG.add(at(box(0.42, 0.12, 0.01, std(0xd21f26)), -0.85, 1.82, 2.05));
tag(spillKitG, 'spillKit'); trailer.add(spillKitG);
// hose tubes
const hoseTubeG = new THREE.Group();
[1.44, 1.7].forEach(y => {
  const g = new THREE.CylinderGeometry(0.14, 0.14, 3.4, 14); g.rotateX(Math.PI / 2);
  hoseTubeG.add(at(new THREE.Mesh(g, std(0xdcdfe2, { roughness: 0.4, metalness: 0.5 })), 1.06, y, -6.6));
  hoseTubeG.add(at(cyl(0.15, 0.15, 0.06, M.steel, 14), 1.06, y, -4.9)).children;
});
tag(hoseTubeG, 'hoseTubes'); trailer.add(hoseTubeG);

/* hose (dynamic) */
const PORT_POS = V3(6.2, 0.14, -4.2);
const HOSE_START = V3(0.98, 1.0, -3.1);
const hoseMat = std(0x232527, { roughness: 0.75 });
let hoseMesh = null;
const hoseGroup = new THREE.Group();   // world coords — hose ops require rig parked at origin
scene.add(hoseGroup);
tag(hoseGroup, 'hose');
const coupler = cyl(0.11, 0.11, 0.22, M.chrome, 12);
coupler.visible = false;
hoseGroup.add(coupler);
let hoseCurve = null;
function hoseEndFor(t) { // t: 0 stored->deployed near port, 1 connected
  return V3(PORT_POS.x - 0.4 + 0.4 * t, 0.5 - 0.36 * t, PORT_POS.z + 0.5 - 0.5 * t);
}
function setHose(endPos, frac) {
  if (hoseMesh) { hoseGroup.remove(hoseMesh); hoseMesh.geometry.dispose(); }
  hoseCurve = new THREE.CatmullRomCurve3([
    HOSE_START.clone(),
    V3(1.9, 0.5, -3.2),
    V3(3.6, 0.16, -3.6),
    endPos.clone()
  ]);
  const geo = new THREE.TubeGeometry(hoseCurve, 48, 0.085, 10);
  if (frac < 1) geo.setDrawRange(0, Math.floor(48 * frac) * 10 * 6);
  hoseMesh = new THREE.Mesh(geo, hoseMat);
  hoseMesh.userData.partId = 'hose';
  hoseGroup.add(hoseMesh);
  coupler.position.copy(hoseCurve.getPoint(Math.min(frac, 1)));
  coupler.visible = frac > 0.05;
  const tangent = hoseCurve.getTangent(Math.min(frac, 1));
  coupler.quaternion.setFromUnitVectors(V3(0, 1, 0), tangent);
}
/* flow indicator */
const flowG = new THREE.Group();
scene.add(flowG);
const flowMat = new THREE.MeshBasicMaterial({ color: 0xffd23f });
for (let i = 0; i < 8; i++) flowG.add(new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), flowMat));
flowG.visible = false;
/* live gallons counter over the fill port — compartment 2 actually drains */
const galCanvas = document.createElement('canvas'); galCanvas.width = 256; galCanvas.height = 96;
const galTex = new THREE.CanvasTexture(galCanvas);
galTex.colorSpace = THREE.SRGBColorSpace;
const galSpr = new THREE.Sprite(new THREE.SpriteMaterial({ map: galTex, transparent: true, depthTest: false }));
galSpr.scale.set(2.6, 1.0, 1);
galSpr.position.set(PORT_POS.x, 1.75, PORT_POS.z);
galSpr.visible = false;
scene.add(galSpr);
let galTimer = 0, dropToastDone = false, prevFlow = false;
function drawGal() {
  const x = galCanvas.getContext('2d');
  x.clearRect(0, 0, 256, 96);
  x.fillStyle = 'rgba(12,14,18,0.88)'; x.fillRect(0, 6, 256, 84);
  x.strokeStyle = '#39d353'; x.lineWidth = 3; x.strokeRect(2, 8, 252, 80);
  x.fillStyle = '#9aa1ab'; x.font = 'bold 14px Arial'; x.textAlign = 'center';
  x.fillText('COMPARTMENT 2 → UNDERGROUND', 128, 30);
  x.fillStyle = '#39d353'; x.font = 'bold 32px monospace';
  x.fillText(Math.floor(state.dropGal).toLocaleString() + ' gal', 128, 64);
  x.fillStyle = '#ffd23f'; x.font = 'bold 12px Arial';
  x.fillText(state.flow ? '▼ FLOWING' : (state.dropGal > 0 ? 'PAUSED' : ''), 128, 84);
  galTex.needsUpdate = true;
}
function resetDrop() {
  state.dropGal = 0;
  dropToastDone = false;
  galSpr.visible = false;
  compMeshes.forEach(m => { m.scale.y = 1; m.position.y = 0; });
}

// rear: ladder, bumper, lights
const ladderG = new THREE.Group();
[-0.25, 0.25].forEach(x => ladderG.add(at(cyl(0.025, 0.025, 2.2, M.alu, 8), x, 2.3, -9.95)));
for (let i = 0; i < 6; i++) {
  const r = at(cyl(0.02, 0.02, 0.5, M.alu, 8), 0, 1.35 + i * 0.38, -9.95);
  r.rotation.z = Math.PI / 2; ladderG.add(r);
}
tag(ladderG, 'ladder'); trailer.add(ladderG);
const bumperG = new THREE.Group();
bumperG.add(at(box(2.3, 0.22, 0.12, M.steel), 0, 0.55, -10.35));
[-0.8, 0.8].forEach(x => bumperG.add(at(box(0.1, 0.6, 0.1, M.steel), x, 0.9, -10.28)));
const bumpTape = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.14), tapeMat);
bumpTape.position.set(0, 0.55, -10.42); bumpTape.rotation.y = Math.PI;
bumperG.add(bumpTape);
tag(bumperG, 'rearBumper'); trailer.add(bumperG);
const rearLightsG = new THREE.Group();
[-0.95, 0.95].forEach(x => {
  rearLightsG.add(at(box(0.2, 0.14, 0.05, LM.tail), x, 0.92, -10.4));
  rearLightsG.add(at(box(0.14, 0.14, 0.05, x < 0 ? LM.turnL : LM.turnR), x, 1.12, -10.4));
});
[-0.62, 0.35].forEach(x => rearLightsG.add(at(box(0.12, 0.1, 0.05, LM.rev), x, 0.78, -10.4))); // reverse lamps
tag(rearLightsG, 'rearLights'); trailer.add(rearLightsG);
// side markers
const sideMarkG = new THREE.Group();
[-1, 1].forEach(s => {
  [1.8, -1.5, -4.8].forEach(z => sideMarkG.add(at(box(0.04, 0.08, 0.16, LM.amber), s * 1.05, 1.42, z)));
  sideMarkG.add(at(box(0.04, 0.08, 0.16, LM.tail), s * 1.02, 1.3, -9.4));
});
tag(sideMarkG, 'sideMarkers'); trailer.add(sideMarkG);
// reflective tape strips along tank sides
const tapeG = new THREE.Group();
[-1, 1].forEach(s => {
  const t = new THREE.Mesh(new THREE.PlaneGeometry(7.6, 0.1), tapeMat);
  t.position.set(s * 0.9, 1.8, -3.4);
  t.rotation.y = s * Math.PI / 2;
  tapeG.add(t);
});
tag(tapeG, 'reflectiveTape'); trailer.add(tapeG);
// landing gear
const gearG = new THREE.Group();
const gearFeet = [];
[-0.7, 0.7].forEach(x => {
  const leg = new THREE.Group();
  leg.add(at(box(0.15, 0.75, 0.15, M.steel), 0, -0.38, 0));
  const inner = new THREE.Group();
  inner.add(at(box(0.1, 0.6, 0.1, M.alu), 0, -0.3, 0));
  inner.add(at(box(0.26, 0.06, 0.3, M.steel), 0, -0.62, 0));
  inner.position.y = -0.35;
  leg.add(inner);
  gearFeet.push(inner);
  leg.position.set(x, 1.55, 0.9);
  gearG.add(leg);
});
gearG.add(at(box(1.4, 0.08, 0.08, M.steel), 0, 1.15, 0.9));
const crank = new THREE.Group();
crank.add(at(cyl(0.02, 0.02, 0.25, M.steel, 8), 0, 0, 0.1));
crank.children[0].rotation.x = Math.PI / 2;
crank.add(at(box(0.03, 0.12, 0.03, M.steel), 0, -0.07, 0.22));
crank.position.set(0.82, 1.35, 0.9);
gearG.add(crank);
tag(gearG, 'landingGear'); trailer.add(gearG);
// trailer axles/suspension
const suspG = new THREE.Group();
[-8.1, -9.4].forEach(z => {
  [-0.6, 0.6].forEach(x => {
    const bag = cyl(0.16, 0.16, 0.22, std(0x26282c, { roughness: 0.9 }), 12);
    bag.position.set(x, 0.95, z);
    suspG.add(bag);
  });
});
tag(suspG, 'wheelsTrailer'); trailer.add(suspG);
addAxle(trailer, -8.1, 0.52, 0.62, 'wheelsTrailer');
addAxle(trailer, -9.4, 0.52, 0.62, 'wheelsTrailer');
const mudTrailG = new THREE.Group();
[-1, 1].forEach(s => mudTrailG.add(at(box(0.55, 0.6, 0.03, flapMat), s * 0.95, 0.35, -10.0)));
tag(mudTrailG, 'mudflapsTrailer'); trailer.add(mudTrailG);
// rear license plate
const rearPlate = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.2), plateMat);
rearPlate.position.set(0.55, 0.78, -10.43);
rearPlate.rotation.y = Math.PI;
tag(rearPlate, 'plate'); trailer.add(rearPlate);
// placards (4 sides)
const placardMeshes = [];
function addPlacard(pos, rotY) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5),
    new THREE.MeshBasicMaterial({ map: placardTex.gasoline, transparent: true }));
  m.position.copy(pos); m.rotation.y = rotY;
  tag(m, 'placard');
  trailer.add(m);
  placardMeshes.push(m);
}
addPlacard(V3(0, 2.3, 2.65), 0);            // front cap
addPlacard(V3(0, 1.6, -10.44), Math.PI);    // rear
addPlacard(V3(TANK_R + 0.015, 2.34, -8.2), Math.PI / 2);
addPlacard(V3(-TANK_R - 0.015, 2.34, -8.2), -Math.PI / 2);

/* cutaway system labels */
function makeLabelSprite(text) {
  const tex = canvasTex(256, 64, (x) => {
    x.fillStyle = 'rgba(16,18,22,0.85)'; x.fillRect(0, 8, 256, 48);
    x.strokeStyle = '#ffd23f'; x.lineWidth = 3; x.strokeRect(2, 10, 252, 44);
    x.fillStyle = '#ffd23f'; x.font = 'bold 24px Arial'; x.textAlign = 'center';
    x.fillText(text, 128, 42);
  });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.scale.set(2.6, 0.65, 1);
  s.visible = false;
  return s;
}
const labelSprites = [];
[['ENGINE', tractor, V3(0, 3.0, 8.2)], ['CAB & INTERIOR', tractor, V3(0, 4.1, 6.0)],
 ['CARGO COMPARTMENTS', trailer, V3(0, 4.6, -3.7)], ['VALVES & MANIFOLD', trailer, V3(1.9, 0.5, -3.3)],
 ['FIFTH WHEEL', tractor, V3(0, 2.1, 2.9)], ['LANDING GEAR', trailer, V3(0, 0.35, 0.9)]]
.forEach(L => { const s = makeLabelSprite(L[0]); s.position.copy(L[2]); L[1].add(s); labelSprites.push(s); });

shadow(rig);
shadow(trailer);
const blobTex = canvasTex(128, 256, (x, W, H) => {
  x.clearRect(0, 0, W, H);
  const g = x.createRadialGradient(W / 2, H / 2, 8, W / 2, H / 2, W * 0.58);
  g.addColorStop(0, 'rgba(0,0,0,0.38)'); g.addColorStop(0.6, 'rgba(0,0,0,0.2)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
});
const blobMat = new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, opacity: 0.72 });
const tractorBlob = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 8.8), blobMat);
tractorBlob.rotation.x = -Math.PI / 2; tractorBlob.position.set(0, 0.025, 5.5); tractorBlob.renderOrder = 1; tractorBlob.castShadow = false; rig.add(tractorBlob);
const trailerBlob = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 14.2), blobMat);
trailerBlob.rotation.x = -Math.PI / 2; trailerBlob.position.set(0, 0.025, -3.7); trailerBlob.renderOrder = 1; trailerBlob.castShadow = false; trailer.add(trailerBlob);
updateTrailer();

/* pre-trip hotspot markers (pulse during inspection mode) */
const hotMat = new THREE.SpriteMaterial({
  map: canvasTex(64, 64, (x) => {
    const g = x.createRadialGradient(32, 32, 4, 32, 32, 30);
    g.addColorStop(0, 'rgba(255,225,90,1)'); g.addColorStop(0.35, 'rgba(255,210,63,0.85)'); g.addColorStop(1, 'rgba(255,210,63,0)');
    x.fillStyle = g; x.beginPath(); x.arc(32, 32, 30, 0, 7); x.fill();
  }),
  depthTest: false, transparent: true,
});
const hotspots = [];
scene.updateMatrixWorld(true);
['hood', 'mirrors', 'wheelsTractor', 'fifthWheel', 'airLines', 'tankShell', 'hatch', 'valves', 'hoseTubes', 'landingGear', 'rearLights', 'placard'].forEach(id => {
  const root = partRoots[id] && partRoots[id][0];
  if (!root) return;
  const c = new THREE.Box3().setFromObject(root).getCenter(new THREE.Vector3());
  const s = new THREE.Sprite(hotMat);
  root.add(s);
  s.position.copy(root.worldToLocal(c));
  s.scale.set(0.3, 0.3, 1);
  s.visible = false;
  hotspots.push(s);
});

/* headlight spotlights */
const headSpots = [];
[-0.85, 0.85].forEach(x => {
  const sp = new THREE.SpotLight(0xfff4d0, 0, 30, 0.5, 0.5, 1.2);
  sp.position.set(x, 1.4, 9.0);
  sp.target.position.set(x, 0.6, 20);
  tractor.add(sp); tractor.add(sp.target);
  headSpots.push(sp);
});
/* visible headlight beam cones (night only) */
const beamCones = [];
{
  const bg = new THREE.CylinderGeometry(0.22, 1.7, 12, 12, 1, true);
  bg.translate(0, -6, 0);
  const bm = new THREE.MeshBasicMaterial({ color: 0xfff4c8, transparent: true, opacity: 0.055, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  [-0.85, 0.85].forEach(x => {
    const b = new THREE.Mesh(bg, bm);
    b.position.set(x, 1.42, 9.05);
    b.rotation.x = -Math.PI / 2 + 0.08;
    b.visible = false;
    tractor.add(b);
    beamCones.push(b);
  });
}
/* exhaust smoke puffs */
const puffTex = canvasTex(64, 64, (x) => {
  const g = x.createRadialGradient(32, 32, 4, 32, 32, 30);
  g.addColorStop(0, 'rgba(150,150,155,0.85)'); g.addColorStop(1, 'rgba(150,150,155,0)');
  x.fillStyle = g; x.beginPath(); x.arc(32, 32, 30, 0, 7); x.fill();
});
const smokePuffs = [];
for (let i = 0; i < 14; i++) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, transparent: true, opacity: 0, depthWrite: false }));
  s.visible = false;
  tractor.add(s);
  smokePuffs.push({ s, life: 0 });
}
let smokeTimer = 0;
/* confetti — for Dad */
const confTex = canvasTex(16, 16, (x) => { x.fillStyle = '#fff'; x.fillRect(2, 2, 12, 12); });
const confColors = [0xb3121b, 0xffd23f, 0xffffff, 0x39d353, 0x2e6fe8, 0xff7a1a];
const confetti = [];
for (let i = 0; i < 60; i++) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: confTex, color: confColors[i % confColors.length], transparent: true, depthTest: false }));
  s.scale.set(0.24, 0.24, 1);
  s.visible = false;
  scene.add(s);
  confetti.push({ s, vx: 0, vy: 0, vz: 0, rot: 0, life: 0 });
}
function throwConfetti() {
  confetti.forEach(c => {
    c.life = 4.5 + Math.random() * 2;
    c.s.visible = true;
    c.s.position.set((Math.random() - 0.5) * 10, 7 + Math.random() * 5, (Math.random() - 0.5) * 14 - 1);
    c.vx = (Math.random() - 0.5) * 1.2;
    c.vy = -(1 + Math.random() * 1.2);
    c.vz = (Math.random() - 0.5) * 1.2;
    c.rot = (Math.random() - 0.5) * 6;
    c.s.material.opacity = 1;
  });
  toast('❤️  Happy trucking, Dad! Love you. 🚛', 5200);
  audio.horn();
  setTimeout(() => audio.horn(), 700);
}

/* ================= environment ================= */
const env = new THREE.Group();
scene.add(env);
const groundMat = new THREE.MeshStandardMaterial({ map: asphaltTex, bumpMap: asphaltTex, bumpScale: 0.05, roughness: 0.97 });
const ground = new THREE.Mesh(new THREE.PlaneGeometry(320, 320), groundMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
env.add(ground);
const pad = new THREE.Mesh(new THREE.PlaneGeometry(30, 14), M.concrete);
pad.rotation.x = -Math.PI / 2; pad.position.set(2, 0.012, 0); pad.receiveShadow = true;
env.add(pad);
const groundDetailG = new THREE.Group();
const edgeFadeMat = new THREE.MeshBasicMaterial({ color: 0x77736c, transparent: true, opacity: 0.34, depthWrite: false });
[-7.1, 7.1].forEach(z => {
  const e = new THREE.Mesh(new THREE.PlaneGeometry(30, 0.8), edgeFadeMat);
  e.rotation.x = -Math.PI / 2; e.position.set(2, 0.021, z); groundDetailG.add(e);
});
const oilTex = canvasTex(256, 256, (x, W, H) => {
  x.clearRect(0, 0, W, H);
  for (let i = 0; i < 24; i++) {
    const g = x.createRadialGradient(128 + (Math.random() - 0.5) * 45, 128 + (Math.random() - 0.5) * 25, 2, 128, 128, 45 + Math.random() * 65);
    g.addColorStop(0, 'rgba(18,14,12,0.13)'); g.addColorStop(1, 'rgba(18,14,12,0)'); x.fillStyle = g; x.fillRect(0, 0, W, H);
  }
});
const oilMat = new THREE.MeshBasicMaterial({ map: oilTex, transparent: true, depthWrite: false, opacity: 0.48 });
[[-22, 2.5, 2.1], [-19, 2.5, 1.8], [-25, 2.5, 2.0]].forEach(p => {
  const d = new THREE.Mesh(new THREE.PlaneGeometry(p[2], p[2] * 0.65), oilMat);
  d.rotation.x = -Math.PI / 2; d.position.set(p[0], 0.027, p[1]); d.rotation.z = p[0] * 0.07; groundDetailG.add(d);
});
const arrowTex = canvasTex(128, 256, (x) => {
  x.clearRect(0, 0, 128, 256); x.fillStyle = 'rgba(238,228,184,0.68)';
  x.beginPath(); x.moveTo(64, 8); x.lineTo(116, 76); x.lineTo(82, 76); x.lineTo(82, 235); x.lineTo(46, 235); x.lineTo(46, 76); x.lineTo(12, 76); x.closePath(); x.fill();
  x.fillStyle = 'rgba(80,75,68,0.16)'; for (let i = 0; i < 35; i++) x.fillRect(Math.random() * 128, Math.random() * 256, 2 + Math.random() * 10, 2);
});
const arrowMat = new THREE.MeshBasicMaterial({ map: arrowTex, transparent: true, depthWrite: false });
[[6, 4.8], [6, -3.4]].forEach(p => {
  const a = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 2.6), arrowMat);
  a.rotation.x = -Math.PI / 2; a.position.set(p[0], 0.03, p[1]); groundDetailG.add(a);
});
const crackTex = canvasTex(256, 128, (x) => {
  x.clearRect(0, 0, 256, 128); x.strokeStyle = 'rgba(35,33,31,0.55)'; x.lineWidth = 2;
  x.beginPath(); x.moveTo(2, 70); let py = 70; for (let i = 1; i < 10; i++) { py += (Math.random() - 0.5) * 32; x.lineTo(i * 28, py); } x.stroke();
  x.lineWidth = 1; [[72,58],[132,82],[190,62]].forEach(p => { x.beginPath(); x.moveTo(p[0],p[1]); x.lineTo(p[0]-18,p[1]-26); x.moveTo(p[0],p[1]); x.lineTo(p[0]+14,p[1]+22); x.stroke(); });
});
const crackMat = new THREE.MeshBasicMaterial({ map: crackTex, transparent: true, depthWrite: false });
[[-3, -6, 0.3], [12, 5, -0.4], [-13, 7, 0.5], [18, -3, -0.2]].forEach(p => {
  const c = new THREE.Mesh(new THREE.PlaneGeometry(4, 2), crackMat); c.rotation.x = -Math.PI / 2; c.rotation.z = p[2]; c.position.set(p[0], 0.026, p[1]); c.userData.qualityDetail = true; groundDetailG.add(c);
});
env.add(groundDetailG);
// underground fill port
const portG = new THREE.Group();
portG.add(at(cyl(0.3, 0.3, 0.05, M.green, 18), 0, 0.025, 0));
portG.add(at(cyl(0.32, 0.34, 0.02, M.alu, 18), 0, 0.005, 0));
portG.add(at(cyl(0.2, 0.2, 0.06, std(0xcc7722, { metalness: 0.6 }), 14), 0, 0.05, 0.6)); // vapor port (orange)
[-0.9, 0.9].forEach(x => portG.add(at(cyl(0.07, 0.07, 0.7, M.yellow, 10), x, 0.35, 0)));
portG.position.set(PORT_POS.x, 0, PORT_POS.z);
tag(portG, 'port'); env.add(portG);
// fuel island + canopy
const islandG = new THREE.Group();
islandG.position.set(-9, 0, -1);
const curb = at(box(9, 0.22, 3.2, M.concrete), 0, 0.11, 0); islandG.add(curb);
const pumpTex = canvasTex(128, 256, (x) => {
  x.fillStyle = '#e8e9eb'; x.fillRect(0, 0, 128, 256);
  x.fillStyle = '#b3121b'; x.fillRect(0, 0, 128, 60);
  x.fillStyle = '#fff'; x.font = '900 30px Arial'; x.textAlign = 'center'; x.fillText('PILOT', 64, 42);
  x.fillStyle = '#15171b'; x.fillRect(14, 80, 100, 70);
  x.fillStyle = '#39d353'; x.font = 'bold 20px monospace'; x.fillText('088.8', 64, 112);
  x.fillStyle = '#ffd23f'; x.fillText('$2.99', 64, 140);
});
[-2.6, 2.6].forEach(xx => {
  const p = box(0.75, 1.7, 0.5, new THREE.MeshStandardMaterial({ map: pumpTex, roughness: 0.6 }));
  p.position.set(xx, 1.07, 0);
  tag(p, 'pump'); islandG.add(p);
});
[-4, 4].forEach(xx => islandG.add(at(cyl(0.16, 0.18, 5.6, M.steel, 12), xx, 2.8, 0)));
const canopy = new THREE.Group();
canopy.add(at(box(12, 0.35, 7, M.white), 0, 5.75, 0));
const fasciaTex = makePilotSignTexture('Flying J');
[[0, 3.6], [0, -3.6]].forEach(p => {
  const f = new THREE.Mesh(new THREE.PlaneGeometry(11.8, 1.1),
    new THREE.MeshStandardMaterial({ map: fasciaTex, emissive: 0xffd59a, emissiveMap: fasciaTex, emissiveIntensity: 0 }));
  f.position.set(p[0], 5.35, p[1]);
  if (p[1] < 0) f.rotation.y = Math.PI;
  canopy.add(f);
});
islandG.add(canopy);
const canopyLights = [];
[-2.7, 2.7].forEach(x => {
  const fixture = at(box(1.2, 0.04, 0.55, std(0xfff1cf, { emissive: 0xffd48a, emissiveIntensity: 0.25 })), x, 5.54, 0);
  canopy.add(fixture);
  const light = new THREE.PointLight(0xffd29a, 0, 14, 2.1); light.position.set(x, 5.42, 0); canopy.add(light); canopyLights.push(light);
});
env.add(shadow(islandG));
// high sign
const signG = new THREE.Group();
signG.position.set(16, 0, 22);
signG.add(at(cyl(0.3, 0.4, 13, M.steel, 12), 0, 6.5, 0));
const signTex = makePilotSignTexture('Flying J  •  Travel Center');
const signMat = new THREE.MeshStandardMaterial({ map: signTex, emissive: 0xffcf8a, emissiveMap: signTex, emissiveIntensity: 0 });
[[0.16, 0], [-0.16, Math.PI]].forEach(p => {
  const s = new THREE.Mesh(new THREE.PlaneGeometry(6, 3), signMat);
  s.position.set(0, 13.5, p[0] * 2); s.rotation.y = p[1];
  signG.add(s);
});
signG.add(at(box(6.2, 3.2, 0.3, M.steel), 0, 13.5, 0));
tag(signG, 'sign'); env.add(shadow(signG));
// store building
const store = new THREE.Group();
store.position.set(-26, 0, -10);
store.add(at(box(16, 4.6, 9, std(0xcfc4ae, { roughness: 0.9 })), 0, 2.3, 0));
store.add(at(box(16.2, 0.8, 9.2, std(0xb3121b)), 0, 4.6, 0));
const storeSignTex = makePilotSignTexture('Travel Center');
const storeSign = new THREE.Mesh(new THREE.PlaneGeometry(7, 1.6), new THREE.MeshStandardMaterial({ map: storeSignTex, emissive: 0xffcf8a, emissiveMap: storeSignTex, emissiveIntensity: 0 }));
storeSign.position.set(0, 3.6, 4.56);
store.add(storeSign);
store.add(at(box(10, 2.0, 0.06, M.glass), 0, 1.2, 4.52));
const storeDecor = new THREE.Group();
const trimMat = std(0x373b40, { roughness: 0.58, metalness: 0.45 });
[-5, 5].forEach(x => storeDecor.add(at(box(0.12, 2.25, 0.12, trimMat), x, 1.25, 4.6)));
[-2.5, 0, 2.5].forEach(x => storeDecor.add(at(box(0.08, 2.05, 0.11, trimMat), x, 1.2, 4.6)));
storeDecor.add(at(box(10.1, 0.1, 0.12, trimMat), 0, 2.25, 4.6));
const doorFrame = new THREE.Group();
[-0.72, 0.72].forEach(x => doorFrame.add(at(box(0.09, 2.15, 0.12, M.alu), x, 1.18, 4.64)));
doorFrame.add(at(box(1.52, 0.1, 0.12, M.alu), 0, 2.25, 4.64)); doorFrame.add(at(box(0.08, 2.05, 0.12, M.alu), 0, 1.2, 4.64));
storeDecor.add(doorFrame);
const iceTex = canvasTex(128, 128, (x) => { x.fillStyle = '#edf4f7'; x.fillRect(0,0,128,128); x.fillStyle = '#2c79b9'; x.font = '900 42px Arial'; x.textAlign = 'center'; x.fillText('ICE',64,70); x.font='bold 14px Arial'; x.fillText('COLD • CLEAN',64,96); });
const ice = at(box(1.35, 1.5, 0.72, new THREE.MeshStandardMaterial({ map: iceTex, roughness: 0.7 })), -6.7, 0.83, 4.8); storeDecor.add(ice);
const propane = new THREE.Group(); propane.position.set(6.5, 0, 4.75);
const cageMat = std(0x73777b, { roughness: 0.65, metalness: 0.7 });
[-0.8, 0.8].forEach(x => [-0.38, 0.38].forEach(z => propane.add(at(box(0.045, 1.45, 0.045, cageMat), x, 0.75, z))));
[-0.65, 0, 0.65].forEach(y => propane.add(at(box(1.68, 0.045, 0.82, cageMat), 0, 0.75 + y, 0)));
[-0.52, 0, 0.52].forEach(x => propane.add(at(cyl(0.15, 0.18, 0.62, M.white, 12), x, 0.36, 0)));
storeDecor.add(propane);
const dumpster = new THREE.Group(); dumpster.position.set(-7.3, 0, -4.9);
dumpster.add(at(box(2.4, 1.25, 1.25, std(0x235a3b, { roughness: 0.9 })), 0, 0.63, 0));
const lid = at(box(2.5, 0.12, 1.34, M.dark), 0, 1.3, 0); lid.rotation.x = -0.08; dumpster.add(lid); storeDecor.add(dumpster);
[-5.8, 5.8].forEach(x => storeDecor.add(at(cyl(0.11, 0.13, 0.85, M.yellow, 12), x, 0.43, 4.9)));
tag(storeDecor, 'decorative'); store.add(storeDecor);
env.add(shadow(store));
// road
const road = new THREE.Mesh(new THREE.PlaneGeometry(320, 9), std(0x2e3134, { roughness: 0.98 }));
road.rotation.x = -Math.PI / 2; road.position.set(0, 0.01, 32);
env.add(road);
for (let i = 0; i < 26; i++) {
  const dash = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.22), std(0xd8d8cf));
  dash.rotation.x = -Math.PI / 2; dash.rotation.z = Math.PI / 2;
  dash.position.set(-150 + i * 12, 0.02, 32);
  env.add(dash);
}
// cones
const conesG = new THREE.Group();
[[3.6, -1.2], [3.6, -7.5], [4.8, -4.2]].forEach(p => {
  const c = new THREE.Group();
  c.add(at(new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.5, 12), M.orange), 0, 0.25, 0));
  c.add(at(box(0.3, 0.03, 0.3, M.orange), 0, 0.015, 0));
  c.position.set(p[0], 0, p[1]);
  conesG.add(c);
});
tag(conesG, 'cones'); env.add(shadow(conesG));
// chocks (hidden until used)
const chocksG = new THREE.Group();
[[-0.95, -7.4], [0.95, -7.4]].forEach(p => {
  const c = at(box(0.3, 0.22, 0.3, M.yellow), p[0], 0.11, p[1]);
  c.rotation.x = 0.3;
  chocksG.add(c);
});
tag(chocksG, 'chocks');
chocksG.visible = false;
env.add(chocksG);

/* --- extra environment: light poles, parked cars, trees, stalls, curb --- */
const poleHeadMat = new THREE.MeshStandardMaterial({ color: 0xf4ecd8, emissive: 0xffe9b0, emissiveIntensity: 0 });
const POLE_POS = [[14, -14], [-14, 14], [22, 6], [-6, -22]];
POLE_POS.forEach(p => {
  const g = new THREE.Group();
  g.add(at(cyl(0.09, 0.12, 7.2, M.steel, 10), 0, 3.6, 0));
  g.add(at(box(1.5, 0.12, 0.4, M.steel), 0, 7.2, 0));
  [-0.5, 0.5].forEach(x => g.add(at(box(0.45, 0.1, 0.35, poleHeadMat), x, 7.15, 0)));
  g.position.set(p[0], 0, p[1]);
  env.add(shadow(g));
});
function makeCar(color, x, z, rot) {
  const g = new THREE.Group();
  const body = std(color, { roughness: 0.25, metalness: 0.5 });
  g.add(at(box(1.7, 0.5, 4.0, body), 0, 0.55, 0));
  g.add(at(box(1.5, 0.42, 2.1, body), 0, 0.98, -0.2));
  g.add(at(box(1.52, 0.34, 1.9, M.glass), 0, 0.98, -0.2));
  [[-0.78, 1.25], [0.78, 1.25], [-0.78, -1.25], [0.78, -1.25]].forEach(w => {
    const tGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.22, 16); tGeo.rotateZ(Math.PI / 2);
    g.add(at(new THREE.Mesh(tGeo, M.rubber), w[0], 0.32, w[1]));
  });
  g.position.set(x, 0, z); g.rotation.y = rot;
  env.add(shadow(g));
  return g;
}
makeCar(0x2a5ea8, -22, 2.5, Math.PI / 2);
makeCar(0xa8a29a, -19, 2.5, Math.PI / 2);
makeCar(0x3b3f45, -25, 2.5, Math.PI / 2);
const TREE_POS = [[24, 14, 1.2], [27, 10, 1.0], [-34, 4, 1.3], [-15, 18, 1.1], [30, -8, 1.0]];
TREE_POS.forEach(tp => {
  const g = new THREE.Group();
  g.add(at(cyl(0.09 * tp[2], 0.14 * tp[2], 1.4 * tp[2], std(0x6b4a2b, { roughness: 0.9 }), 8), 0, 0.7 * tp[2], 0));
  g.add(at(new THREE.Mesh(new THREE.ConeGeometry(0.9 * tp[2], 2.2 * tp[2], 10), M.green), 0, 2.4 * tp[2], 0));
  g.add(at(new THREE.Mesh(new THREE.ConeGeometry(0.7 * tp[2], 1.7 * tp[2], 10), std(0x2a8f42, { roughness: 0.7 })), 0, 3.3 * tp[2], 0));
  g.position.set(tp[0], 0, tp[1]);
  env.add(shadow(g));
});
for (let i = 0; i < 6; i++) { // parking stall lines by the store
  const line = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 5), std(0xd8d8cf));
  line.rotation.x = -Math.PI / 2;
  line.position.set(-28 + i * 3, 0.015, 1.5);
  env.add(line);
}
env.add(at(box(17, 0.16, 0.5, M.concrete), -26, 0.08, -4.9)); // storefront curb
/* store window glow at night */
const storeGlowMat = new THREE.MeshStandardMaterial({ color: 0xfff0c4, emissive: 0xffe9b0, emissiveIntensity: 0 });
const storeGlow = new THREE.Mesh(new THREE.PlaneGeometry(9.6, 1.8), storeGlowMat);
storeGlow.position.set(-26, 1.2, -5.52);
env.add(storeGlow);
/* waving Pilot flag */
const flagG = new THREE.Group();
flagG.position.set(-14, 0, -8);
flagG.add(at(cyl(0.05, 0.07, 6.4, M.steel, 8), 0, 3.2, 0));
flagG.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), M.yellow), 0, 6.45, 0));
const flagTex = canvasTex(128, 64, (x) => {
  x.fillStyle = '#b3121b'; x.fillRect(0, 0, 128, 64);
  x.save(); x.transform(1, 0, -0.2, 1, 6, 0);
  x.fillStyle = '#fff'; x.font = '900 28px "Arial Black", Arial'; x.textAlign = 'center';
  x.fillText('PILOT', 64, 38);
  x.restore();
  x.fillStyle = '#ffd23f'; x.fillRect(0, 50, 128, 6);
});
const flagGeo = new THREE.PlaneGeometry(1.6, 0.85, 10, 5);
const flagBase = Float32Array.from(flagGeo.attributes.position.array);
const flagMesh = new THREE.Mesh(flagGeo, new THREE.MeshStandardMaterial({ map: flagTex, side: THREE.DoubleSide, roughness: 0.8 }));
flagMesh.position.set(0.82, 5.95, 0);
flagG.add(flagMesh);
tag(flagG, 'flag');
env.add(shadow(flagG));
/* inflatable sky dancer at the store */
const dancer = new THREE.Group();
dancer.position.set(-19.5, 0, -4.6);
const danceMat = std(0xffd23f, { roughness: 0.7 });
const dSeg1 = new THREE.Group();
dSeg1.add(at(cyl(0.16, 0.19, 1.5, danceMat, 10), 0, 0.75, 0));
dancer.add(dSeg1);
const dSeg2 = new THREE.Group();
dSeg2.position.y = 1.5;
dSeg2.add(at(cyl(0.13, 0.16, 1.3, danceMat, 10), 0, 0.65, 0));
dSeg1.add(dSeg2);
const dSeg3 = new THREE.Group();
dSeg3.position.y = 1.3;
dSeg3.add(at(cyl(0.1, 0.13, 1.1, danceMat, 10), 0, 0.55, 0));
[-1, 1].forEach(sd => {
  const arm = at(cyl(0.05, 0.07, 0.9, danceMat, 8), sd * 0.45, 0.75, 0);
  arm.rotation.z = sd * 1.2;
  dSeg3.add(arm);
});
dSeg2.add(dSeg3);
tag(dancer, 'dancer');
env.add(shadow(dancer));
/* ambient highway traffic */
const traffic = [
  { g: makeCar(0x8899aa, -60, 30.6, -Math.PI / 2), dir: 1, sp: 7 },
  { g: makeCar(0x775544, 60, 33.6, Math.PI / 2), dir: -1, sp: 6 },
];
/* birds circling the lot */
const birdTex = canvasTex(64, 32, (x) => {
  x.strokeStyle = '#222'; x.lineWidth = 5; x.lineCap = 'round';
  x.beginPath(); x.moveTo(6, 22); x.quadraticCurveTo(20, 8, 32, 20); x.quadraticCurveTo(44, 8, 58, 22); x.stroke();
});
const birds = [];
for (let i = 0; i < 4; i++) {
  const b = new THREE.Sprite(new THREE.SpriteMaterial({ map: birdTex, transparent: true }));
  b.scale.set(1.6, 0.8, 1);
  scene.add(b);
  birds.push({ b, ph: i * 1.7, r: 20 + i * 6, h: 17 + i * 2.5, sp: 0.12 + i * 0.03 });
}

/* --- drive collisions --- */
const OBSTACLES = [
  { x1: -13.8, z1: -2.9, x2: -4.2, z2: 0.9 },    // fuel island
  { x1: -34.3, z1: -14.8, x2: -17.7, z2: -5.2 }, // store
  { x1: 15.3, z1: 21.3, x2: 16.7, z2: 22.7 },    // high sign
  { x1: -26.5, z1: 0.4, x2: -17.5, z2: 4.6 },    // parked cars
];
OBSTACLES.push({ x1: -14.5, z1: -8.5, x2: -13.5, z2: -7.5 }); // flag pole
OBSTACLES.push({ x1: -20.1, z1: -5.2, x2: -18.9, z2: -4.0 }); // sky dancer
POLE_POS.forEach(p => OBSTACLES.push({ x1: p[0] - 0.4, z1: p[1] - 0.4, x2: p[0] + 0.4, z2: p[1] + 0.4 }));
TREE_POS.forEach(p => OBSTACLES.push({ x1: p[0] - 0.6, z1: p[1] - 0.6, x2: p[0] + 0.6, z2: p[1] + 0.6 }));
function hitsObstacle(p, pad) {
  for (const o of OBSTACLES) {
    if (p.x > o.x1 - pad && p.x < o.x2 + pad && p.z > o.z1 - pad && p.z < o.z2 + pad) return true;
  }
  return false;
}
const knockCones = conesG.children.map(c => ({ obj: c, home: c.position.clone(), down: false }));
function knockCone(kc, dir) {
  kc.down = true;
  const fr = kc.obj.rotation.x, fp = kc.obj.position.clone();
  tween(0.4, f => {
    kc.obj.rotation.x = fr + f * 1.45;
    kc.obj.position.copy(fp).addScaledVector(dir, f * 0.7);
  });
  audio.clunk();
}

/* --- mission drop zone marker --- */
const dropRing = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.09, 8, 40),
  new THREE.MeshBasicMaterial({ color: 0xffd23f }));
dropRing.rotation.x = -Math.PI / 2; dropRing.position.set(0, 0.08, 0);
dropRing.visible = false;
scene.add(dropRing);

/* --- rain --- */
const RAIN_N = 900;
const rainGeo = new THREE.BufferGeometry();
const rainPos = new Float32Array(RAIN_N * 6);
for (let i = 0; i < RAIN_N; i++) {
  const rx = (Math.random() - 0.5) * 110, ry = Math.random() * 26, rz = (Math.random() - 0.5) * 110;
  rainPos.set([rx, ry, rz, rx + 0.1, ry + 0.45, rz], i * 6);
}
rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
const rainLines = new THREE.LineSegments(rainGeo,
  new THREE.LineBasicMaterial({ color: 0xa8bfd2, transparent: true, opacity: 0.5 }));
rainLines.visible = false;
scene.add(rainLines);

/* ================= camera controls ================= */
const ctrl = {
  theta: 0.9, phi: 1.25, radius: 22,
  target: V3(2.5, 1.8, 0),
  gTheta: 0.9, gPhi: 1.25, gRadius: 22, gTarget: V3(2.5, 1.8, 0),
};
function ctrlUpdate(dt) {
  const k = Math.min(1, dt * 8);
  ctrl.theta += (ctrl.gTheta - ctrl.theta) * k;
  ctrl.phi += (ctrl.gPhi - ctrl.phi) * k;
  ctrl.radius += (ctrl.gRadius - ctrl.radius) * k;
  ctrl.target.lerp(ctrl.gTarget, k);
  ctrl.gPhi = Math.max(0.15, Math.min(1.52, ctrl.gPhi));
  ctrl.gRadius = Math.max(3, Math.min(90, ctrl.gRadius));
  camera.position.set(
    ctrl.target.x + ctrl.radius * Math.sin(ctrl.phi) * Math.sin(ctrl.theta),
    ctrl.target.y + ctrl.radius * Math.cos(ctrl.phi),
    ctrl.target.z + ctrl.radius * Math.sin(ctrl.phi) * Math.cos(ctrl.theta)
  );
  camera.lookAt(ctrl.target);
}
const pointers = new Map();
let downPos = null, moved = false, pinchDist = 0;
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, button: e.button });
  if (pointers.size === 1) { downPos = { x: e.clientX, y: e.clientY }; moved = false; }
  if (pointers.size === 2) {
    const p = [...pointers.values()];
    pinchDist = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
  }
  state.showcase = false;
  intro = false;
});
canvas.addEventListener('pointermove', (e) => {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  const dx = e.clientX - p.x, dy = e.clientY - p.y;
  p.x = e.clientX; p.y = e.clientY;
  if (downPos && Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y) > 7) moved = true;
  if (pointers.size === 1) {
    if (state.mode === 'walk') {
      walk.yaw -= dx * 0.0045;
      walk.pitch = Math.max(-1.2, Math.min(1.2, walk.pitch - dy * 0.0045));
    } else if (p.button === 2) { // right-drag pan
      panBy(dx, dy);
    } else {
      ctrl.gTheta -= dx * 0.006;
      ctrl.gPhi -= dy * 0.006;
    }
  } else if (pointers.size === 2) {
    const pts = [...pointers.values()];
    const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    if (pinchDist > 0) ctrl.gRadius *= pinchDist / d;
    pinchDist = d;
    panBy(dx * 0.5, dy * 0.5);
  }
});
function panBy(dx, dy) {
  const right = V3(Math.cos(ctrl.theta), 0, -Math.sin(ctrl.theta));
  const fwd = V3(-Math.sin(ctrl.theta), 0, -Math.cos(ctrl.theta));
  const s = ctrl.radius * 0.0015;
  ctrl.gTarget.addScaledVector(right, -dx * s).addScaledVector(fwd, -dy * s);
  ctrl.gTarget.x = Math.max(-60, Math.min(60, ctrl.gTarget.x));
  ctrl.gTarget.z = Math.max(-60, Math.min(60, ctrl.gTarget.z));
  ctrl.gTarget.y = Math.max(0.3, Math.min(16, ctrl.gTarget.y));
}
function endPointer(e) {
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinchDist = 0;
  if (pointers.size === 0 && downPos && !moved && e.type === 'pointerup') pick(e.clientX, e.clientY);
  if (pointers.size === 0) downPos = null;
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  ctrl.gRadius *= (1 + Math.sign(e.deltaY) * 0.1);
  state.showcase = false;
  intro = false;
}, { passive: false });
canvas.addEventListener('contextmenu', e => e.preventDefault());

/* ================= picking ================= */
const raycaster = new THREE.Raycaster();
let highlightBox = null;
let selectedId = null;
function clearHighlight() {
  if (highlightBox) { scene.remove(highlightBox); highlightBox = null; }
  selectedId = null;
}
function highlightObj(obj) {
  if (highlightBox) scene.remove(highlightBox);
  const b = new THREE.Box3().setFromObject(obj);
  highlightBox = new THREE.Box3Helper(b, 0xffd23f);
  scene.add(highlightBox);
}
function findPartId(obj) {
  let o = obj;
  while (o) { if (o.userData.partId) return { id: o.userData.partId, root: o }; o = o.parent; }
  return null;
}
function visibleInScene(object) {
  for (let current = object; current; current = current.parent) if (!current.visible) return false;
  return true;
}
function pick(cx, cy) {
  if (document.body.classList.contains('photo')) { setPhoto(false); return; }
  const r = canvas.getBoundingClientRect();
  const m = new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(m, camera);
  const hits = raycaster.intersectObjects(pickables, true);
  for (const h of hits) {
    if (!visibleInScene(h.object)) continue;
    if (h.object.isMesh && h.object.userData.ghostMat && h.object.material === h.object.userData.ghostMat) continue; // click through x-ray shells
    const f = findPartId(h.object);
    if (f && INFO[f.id]) { selectPart(f.id, f.root); return; }
  }
  closeInfo();
}
function selectPart(id, root) {
  root = root || (partRoots[id] && partRoots[id][0]);
  if (!root) return;
  selectedId = id;
  if (id === 'steeringWheel' || id === 'airHorns') audio.horn();
  highlightObj(root);
  const el = document.getElementById('infoPanel');
  document.getElementById('infoTitle').textContent = INFO[id][0];
  let extra = '';
  if (id === 'placard') extra = '<p><span class="lbl">Current mode:</span> ' + cargoLabel() + '</p>';
  document.getElementById('infoBody').innerHTML = infoHTML(id) + extra;
  el.classList.remove('hidden');
  hideHint();
  postToTrainer('part', { id: id, title: INFO[id][0] });
}
function closeInfo() {
  document.getElementById('infoPanel').classList.add('hidden');
  clearHighlight();
}
function focusPart(id) {
  const root = partRoots[id] && partRoots[id][0];
  if (!root) return;
  const b = new THREE.Box3().setFromObject(root);
  const c = b.getCenter(new THREE.Vector3());
  const size = b.getSize(new THREE.Vector3()).length();
  ctrl.gTarget.copy(c);
  ctrl.gRadius = Math.max(3.2, size * 1.7);
}

/* ================= tween engine ================= */
const tweens = [];
function tween(dur, onU, onDone) {
  tweens.push({ t: 0, dur, onU, onDone });
}
function ease(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
function stepTweens(dt) {
  for (let i = tweens.length - 1; i >= 0; i--) {
    const tw = tweens[i];
    tw.t += dt;
    const f = Math.min(1, tw.t / tw.dur);
    tw.onU(ease(f));
    if (f >= 1) { tweens.splice(i, 1); if (tw.onDone) tw.onDone(); }
  }
}

/* ================= state & actions ================= */
const state = {
  engine: false, head: false, marker: false, brake: false, hazard: false,
  hood: false, doorL: false, doorR: false,
  gearDown: false, valve: false, hose: 'stored', cargo: 'gasoline',
  exploded: false, xray: false, night: false,
  mode: 'explore', showcase: false, flow: false, chocks: false,
  driveInput: { fwd: false, back: false, left: false, right: false },
  speed: 0, busy: false,
  wipers: false, rain: false, hatches: false,
  quality: SAVE.quality || 'med',
  view: 'normal', fluid: 'none', cargoGlow: false, dropGal: 0,
  missions: SAVE.missions || 0,
  bestTime: (typeof SAVE.bestTime === 'number' ? SAVE.bestTime : null),
  missionPhase: 0, missionT0: 0,
};
const walk = { yaw: Math.PI + 0.5, pitch: -0.05, pos: V3(6, 1.7, 10) };
function persist() {
  try { localStorage.setItem('tankerSave', JSON.stringify({ quality: state.quality, missions: state.missions, bestTime: state.bestTime })); } catch (e) { }
}
function cargoLabel() {
  return state.cargo === 'gasoline' ? 'GASOLINE (UN 1203)' :
         state.cargo === 'diesel' ? 'DIESEL (UN 1993)' : 'EMPTY / CLEANED';
}
function toast(msg, ms) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toast._h);
  toast._h = setTimeout(() => t.classList.add('hidden'), ms || 2600);
}
function hideHint() {
  const h = document.getElementById('tapHint');
  if (h) h.style.opacity = '0';
}

/* --- animated actions --- */
function setHood(open, silent) {
  state.hood = open;
  const from = hoodG.rotation.x, to = open ? 1.15 : 0;
  tween(0.9, f => { hoodG.rotation.x = from + (to - from) * f; });
  if (!silent) toast(open ? 'Hood tilted forward — engine bay exposed' : 'Hood closed and latched');
  refreshUI();
}
function setDoor(which, open) {
  state[which] = open;
  const piv = which === 'doorL' ? doorLPiv : doorRPiv;
  const sign = which === 'doorL' ? 1 : -1;
  const from = piv.rotation.y, to = open ? sign * 1.15 : 0;
  tween(0.6, f => { piv.rotation.y = from + (to - from) * f; });
  refreshUI();
}
function setEngine(on) {
  state.engine = on;
  gaugeMat.map = makeGaugeTexture(on);
  gaugeMat.map.needsUpdate = true;
  audio.engine(on);
  toast(on ? 'Engine running — watch the fan and gauges' : 'Engine shut down');
  refreshUI();
}
function setGear(down) {
  if ((state.mode === 'drive' || state.mode === 'mission') && down) { toast('Raise impossible in drive… gear must stay UP while driving'); return; }
  state.gearDown = down;
  const from = gearFeet[0].position.y, to = down ? -0.72 : -0.35;
  tween(1.4, f => {
    gearFeet.forEach(g => { g.position.y = from + (to - from) * f; });
    crank.rotation.x += 0.3;
  });
  toast(down ? 'Landing gear cranked DOWN (supports the trailer when uncoupled)' : 'Landing gear cranked UP — always up before driving!');
  refreshUI();
}
function setValve(open) {
  if (open && state.hose !== 'connected' && state.mode !== 'unload') {
    toast('Tip: connect the hose first — opening a product valve with no hose means a spill!');
  }
  state.valve = open;
  audio.clunk();
  const from = valveWheel.rotation.x, to = open ? Math.PI * 1.5 : 0;
  tween(1.0, f => { valveWheel.rotation.x = from + (to - from) * f; });
  updateFlow();
  refreshUI();
}
function updateFlow() {
  state.flow = state.valve && state.hose === 'connected' && state.cargo !== 'empty';
  flowG.visible = state.flow;
  if (!state.flow && !state.cargoGlow) compMeshes.forEach(m => { m.material.opacity = 0.95; });
}
function hoseDeploy(done) {
  if (state.hose !== 'stored') return;
  if (rig.position.lengthSq() > 4 || Math.abs(rig.rotation.y) > 0.25) {
    toast('Park back at the fill port first — hit Reset to bring the rig home');
    return;
  }
  state.busy = true; refreshUI();
  const end = hoseEndFor(0);
  tween(1.2, f => setHose(end, f), () => {
    state.hose = 'out'; state.busy = false;
    toast('Hose pulled from the tube and laid out to the fill port');
    refreshUI(); if (done) done();
  });
}
function hoseConnect(done) {
  if (state.hose !== 'out') return;
  state.busy = true; refreshUI();
  const from = hoseEndFor(0), to = hoseEndFor(1);
  tween(0.8, f => setHose(from.clone().lerp(to, f), 1), () => {
    state.hose = 'connected'; state.busy = false;
    audio.clunk();
    toast('Cam-lock coupler seated on the underground tank port');
    updateFlow(); refreshUI(); if (done) done();
  });
}
function hoseDisconnect(done) {
  if (state.hose !== 'connected') return;
  if (state.valve) { toast('Close the valve before disconnecting!'); if (!done) return; }
  state.busy = true; refreshUI();
  const from = hoseEndFor(1), to = hoseEndFor(0);
  tween(0.8, f => setHose(from.clone().lerp(to, f), 1), () => {
    state.hose = 'out'; state.busy = false;
    updateFlow(); refreshUI(); if (done) done();
  });
}
function hoseStore(done) {
  if (state.hose !== 'out') return;
  state.busy = true; refreshUI();
  const end = hoseEndFor(0);
  tween(1.0, f => setHose(end, 1 - f), () => {
    if (hoseMesh) { hoseGroup.remove(hoseMesh); hoseMesh.geometry.dispose(); hoseMesh = null; }
    coupler.visible = false;
    state.hose = 'stored'; state.busy = false;
    resetDrop();
    toast('Hose drained and stored in the tube, end cap latched');
    refreshUI(); if (done) done();
  });
}
function cycleCargo() {
  state.cargo = state.cargo === 'gasoline' ? 'diesel' : state.cargo === 'diesel' ? 'empty' : 'gasoline';
  placardMeshes.forEach(m => { m.material.map = placardTex[state.cargo]; m.material.needsUpdate = true; });
  toast('Cargo mode: ' + cargoLabel() + ' — the cargo determines the placard');
  updateFlow(); refreshUI();
  if (selectedId === 'placard') selectPart('placard');
}
/* exploded view */
const EXPLODE = [];
function reg(obj, off) { EXPLODE.push({ obj, base: obj.position.clone(), off }); }
reg(hoodG, V3(0, 1.6, 2.2));
reg(cabG, V3(0, 2.0, 0.6));
reg(bay, V3(0, 1.0, 0.8));
reg(fwG, V3(0, 1.2, 0));
reg(tankG, V3(0, 2.6, 0));
reg(catwalkG, V3(0, 4.2, 0));
reg(hatchG, V3(0, 3.6, 0));
reg(manifoldG, V3(1.8, -0.2, 0));
reg(valveWheel, V3(1.8, -0.2, 0));
reg(hoseTubeG, V3(2.6, 0, 0));
reg(gearG, V3(0, -0.6, 1.2));
reg(ladderG, V3(0, 0.6, -2.2));
reg(bumperG, V3(0, -0.4, -1.6));
reg(vaporG, V3(0.8, 2.6, 0));
function setExploded(on) {
  if (on && (state.mode === 'drive' || state.mode === 'mission' || state.mode === 'walk')) exitMode();
  state.exploded = on;
  compG.visible = on || state.xray;
  shellMat.transparent = capMatF.transparent = true;
  shellMat.needsUpdate = capMatF.needsUpdate = true;
  const from = on ? 0 : 1, to = on ? 1 : 0;
  tween(1.2, f => {
    const k = from + (to - from) * f;
    EXPLODE.forEach(e => e.obj.position.copy(e.base).addScaledVector(e.off, k));
    shellMat.opacity = 1 - k * 0.8;
    capMatF.opacity = 1 - k * 0.7;
    compG.position.set(0, TANK_Y + 2.6 * k, -3.75);
  }, () => {
    if (!on) {
      shellMat.opacity = state.xray ? 0.22 : 1;
      capMatF.opacity = state.xray ? 0.3 : 1;
      shellMat.transparent = capMatF.transparent = state.xray;
      shellMat.needsUpdate = capMatF.needsUpdate = true;
      compG.visible = state.xray;
    }
  });
  toast(on ? 'Exploded view — every major system separated' : 'Systems reassembled');
  refreshUI();
}
function setXray(on, silent) {
  state.xray = on;
  if (!state.exploded) {
    compG.visible = on;
    shellMat.transparent = capMatF.transparent = true;
    shellMat.needsUpdate = capMatF.needsUpdate = true; // transparent toggle needs a shader recompile
    const from = shellMat.opacity, to = on ? 0.22 : 1;
    tween(0.6, f => {
      const v = from + (to - from) * f;
      shellMat.opacity = v;
      capMatF.opacity = Math.min(1, v + 0.08);
    }, () => {
      // settle to whatever the CURRENT state wants (rapid toggles queue stale tweens)
      if (state.exploded) return;
      if (state.xray) { shellMat.opacity = 0.22; capMatF.opacity = 0.3; shellMat.transparent = capMatF.transparent = true; compG.visible = true; }
      else { shellMat.opacity = 1; capMatF.opacity = 1; shellMat.transparent = capMatF.transparent = false; compG.visible = false; }
      shellMat.needsUpdate = capMatF.needsUpdate = true;
    });
  }
  if (!silent) toast(on ? 'X-Ray: 4 internal compartments — different grades ride in separate tanks' : 'Shell view restored');
  refreshUI();
}
/* --- multi-view x-ray / cutaway system --- */
function ghostMesh(m, on) {
  if (on) {
    if (!m.userData.solidMat) {
      m.userData.solidMat = m.material;
      const src = Array.isArray(m.material) ? m.material[0] : m.material;
      const g = src.clone();
      g.transparent = true; g.opacity = 0.12; g.depthWrite = false;
      m.userData.ghostMat = g;
    }
    m.material = m.userData.ghostMat;
    m.castShadow = false;
  } else if (m.userData.solidMat && m.material === m.userData.ghostMat) {
    m.material = m.userData.solidMat;
    m.castShadow = true;
  }
}
function ghostSet(root, on) { root.traverse(n => { if (n.isMesh) ghostMesh(n, on); }); }
function setView(v, silent) {
  state.view = v;
  const tankOn = v === 'tank' || v === 'cutaway';
  if (tankOn !== state.xray) setXray(tankOn, true);
  const engOn = v === 'engine' || v === 'cutaway';
  ghostSet(hoodShell, engOn);
  ghostMesh(engBlock, engOn);
  engineInternals.visible = engOn;
  const cabOn = v === 'cab' || v === 'cutaway';
  cabShellParts.forEach(p => ghostSet(p, cabOn));
  labelSprites.forEach(s => { s.visible = v === 'cutaway'; });
  if (!silent) toast({
    normal: 'Normal view',
    tank: 'X-Ray Tank: compartments, baffles, and cargo volumes',
    engine: 'X-Ray Engine: block, pistons, oil, cooling — try the fluid overlays',
    cab: 'X-Ray Cab: structure, seats, controls, and safety gear',
    cutaway: 'Full cutaway — every major system, labeled. Tap anything.',
  }[v]);
  refreshUI();
}
/* --- fluid overlays --- */
function setFluid(kind) {
  state.fluid = kind;
  const on = k => kind === 'all' || kind === k;
  dieselG.visible = on('diesel');
  oilG.visible = on('oil');
  coolG.visible = on('coolant');
  defG.visible = on('def');
  state.cargoGlow = on('cargo');
  if (state.cargoGlow && state.view === 'normal' && !state.exploded) setView('tank', true);
  if (!state.cargoGlow && !state.flow) compMeshes.forEach(m => { m.material.opacity = 0.95; });
  if (kind !== 'none') toast('Fluid overlay (schematic): educational visualization only — not operational training', 3000);
  refreshUI();
}
function applyAtmosphere() {
  const n = state.night, r = state.rain;
  const skyC = n ? NIGHT_SKY : (r ? 0x808b94 : DAY_SKY);
  skyMat.map = n ? skyTexNight : (r ? skyTexRain : skyTexDay);
  scene.background.set(skyC);
  scene.fog.color.set(skyC);
  scene.fog.near = r ? 45 : 90;
  scene.fog.far = r ? 150 : 240;
  hemi.intensity = n ? 0.18 : (r ? 0.45 : 0.85);
  sun.intensity = n ? 0.06 : (r ? 0.6 : 2.0);
  nightLight.intensity = n ? 1.6 : 0;
  poleHeadMat.emissiveIntensity = n ? 1.4 : 0;
  groundMat.color.set(r ? 0x7d8288 : 0xffffff); // wet asphalt darkens
  groundMat.roughness = r ? 0.55 : 0.97;
  rainLines.visible = r;
  storeGlowMat.emissiveIntensity = n ? 1.1 : 0;
  canopyLights.forEach(l => { l.intensity = n && state.quality === 'high' ? 1.35 : 0; });
  sunFlare.visible = !n && !r && state.quality !== 'low';
  birds.forEach(bd => { bd.b.visible = !n && !r; });
  env.traverse(nn => {
    if (nn.isMesh && nn.material.emissiveMap) nn.material.emissiveIntensity = n ? 0.9 : 0;
  });
  applyLightMats();
}
function setNight(on) {
  state.night = on;
  applyAtmosphere();
  refreshUI();
}
function setRain(on) {
  state.rain = on;
  if (on && !state.wipers) setWipers(true);
  audio.rain(on);
  applyAtmosphere();
  toast(on ? 'Rain — wipers on, longer stopping distances, extra care at the rack' : 'Weather cleared');
  refreshUI();
}
function setWipers(on) {
  state.wipers = on;
  if (!on) wiperPivots.forEach(p => { p.rotation.z = 0.5; });
  refreshUI();
}
function setHatches(open) {
  state.hatches = open;
  hatchLids.forEach((p, i) => {
    const from = p.rotation.z, to = open ? 2.1 : 0;
    tween(0.5 + i * 0.12, f => { p.rotation.z = from + (to - from) * f; });
  });
  audio.clunk();
  toast(open ? 'Manhole covers open — inspection only, never in transit!' : 'Manhole covers latched shut');
  refreshUI();
}
function applyQuality(q) {
  state.quality = q;
  const px = q === 'low' ? 1 : Math.min(window.devicePixelRatio || 1, q === 'med' ? 1.5 : 2);
  renderer.setPixelRatio(px);
  const s = q === 'low' ? 512 : q === 'med' ? 1024 : 2048;
  sun.shadow.mapSize.set(s, s);
  if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
  const usePhysical = q !== 'low';
  scene.traverse(n => {
    if (!n.isMesh) return;
    if (n.material === M.red || n.material === M.redLow) n.material = usePhysical ? M.red : M.redLow;
    if (n.userData.solidMat === M.red || n.userData.solidMat === M.redLow) n.userData.solidMat = usePhysical ? M.red : M.redLow;
    if (n.userData.qualityHigh) {
      const target = usePhysical ? n.userData.qualityHigh : n.userData.qualityLow;
      if (n.material !== n.userData.ghostMat) n.material = target;
      if (n.userData.solidMat) n.userData.solidMat = target;
    }
    if (n.userData.qualityDetail) n.visible = q !== 'low';
  });
  applyAtmosphere();
  persist();
}
function cycleQuality() {
  applyQuality(state.quality === 'low' ? 'med' : state.quality === 'med' ? 'high' : 'low');
  toast('Quality: ' + state.quality.toUpperCase() + (state.quality === 'high' ? ' — sharper shadows & resolution' : state.quality === 'low' ? ' — best for older phones' : ''));
  refreshUI();
}
function setPhoto(on) {
  document.body.classList.toggle('photo', on);
  if (on) toast('Photo mode — tap anywhere to bring the UI back', 3500);
}
function setShowcase(on) {
  state.showcase = on;
  if (on) { ctrl.gTarget.set(0, 2.0, -1); ctrl.gRadius = 24; ctrl.gPhi = 1.2; toast('Showcase camera — sit back and admire the rig'); }
  refreshUI();
}

/* lights */
function applyLightMats() {
  LM.head.emissiveIntensity = state.head ? 2.2 : 0;
  LM.amber.emissiveIntensity = state.marker ? 1.6 : 0;
  headSpots.forEach(s => { s.intensity = state.head ? (state.night ? 60 : 12) : 0; });
  beamCones.forEach(b => { b.visible = state.head && state.night; });
}

/* ================= modes: pre-trip / unload ================= */
const PRETRIP = [
  ['engine', 'Engine bay', 'Hood tilted. Look for oil, coolant, or fuel leaks; check wiring and mounts. A fuel hauler starts every day with a clean, dry engine bay.'],
  ['coolant', 'Fluids', 'Oil level on the dipstick, coolant between MIN/MAX, power steering full. Never open a hot radiator.'],
  ['belts', 'Belts & hoses', 'Press the belt — about 1/2" to 3/4" of give. No cracks, fraying, or soft/bulging coolant hoses.'],
  ['radiator', 'Radiator & fan', 'Core clear of debris, no leaks, fan blades intact.'],
  ['batteries', 'Batteries', 'Hold-downs tight, terminals clean, box cover secure.'],
  ['headlights', 'Lights — front', 'Headlights high/low, turn signals, and 4-way flashers all work.'],
  ['mirrors', 'Mirrors & glass', 'Mirrors clean, tight, adjusted. Windshield free of cracks in the wiper sweep.'],
  ['windshield', 'Wipers', 'Blades not torn, arms have tension, washers spray.'],
  ['wheelsTractor', 'Steer tires & wheels', 'Min 4/32" tread, even wear, proper inflation, no sidewall cuts. Lug nuts tight — look for rust trails or shiny threads.'],
  ['fuelTanks', 'Tractor fuel tanks', 'Caps tight, straps secure, no leaks. This diesel runs the truck — the cargo tank is separate.'],
  ['airLines', 'Air lines & pigtail', 'Red/blue gladhands sealed, no audible leaks, electric line firmly seated, lines not chafing.'],
  ['fifthWheel', 'Fifth wheel', 'Greased plate, mounting bolts tight, no cracks. Release arm fully in.'],
  ['kingpin', 'Kingpin & jaws', 'Locking jaws fully closed AROUND the kingpin (not in front/behind). No gap between fifth wheel and trailer apron. Tug test done.'],
  ['dash', 'In-cab', 'Gauges working, air pressure builds to ~120 psi, low-air warning works, horn, seat belt.'],
  ['extinguisher', 'Safety equipment', 'Fire extinguisher charged and secured, three reflective triangles, spare fuses.'],
  ['tankShell', 'Tank shell', 'Walk the tank: dents, gouges, cracks, weeping welds, or anything dripping. ANY leak on a loaded gasoline trailer = do not move.'],
  ['tankFrame', 'Frame & saddles', 'Welds where saddle meets shell are a known crack point — look closely.'],
  ['catwalk', 'Catwalk', 'Grip surface intact and clear. Use fall protection at the rack in real life.'],
  ['hatch', 'Manholes & vents', 'Covers latched, gaskets sound, vents clear, no product around the rims.'],
  ['valves', 'Valves & manifold', 'Internal valves closed, dust caps on the API adapters, no drips, handles move freely.'],
  ['hose', 'Hoses & tubes', 'Hoses free of cuts and soft spots, couplers undamaged, tube end caps latched.'],
  ['placard', 'Placards', 'Correct UN number for the cargo on ALL FOUR sides, legible and secure.'],
  ['reflectiveTape', 'Conspicuity tape', 'Red/white tape continuous along sides and rear, not peeling.'],
  ['rearLights', 'Rear lights', 'Tail, brake, turn, and marker lights all work — have a helper or use reflections.'],
  ['wheelsTrailer', 'Trailer tires & suspension', 'Duals not touching, nothing wedged between them, min 2/32" tread, airbags not leaking, hubs not slinging oil.'],
  ['landingGear', 'Landing gear', 'Fully raised, crank stowed. Legs bent or dragging will destroy them at speed.'],
  ['rearBumper', 'Rear bumper & ladder', 'Underride guard solid, ladder rungs tight.'],
  ['mudflapsTrailer', 'Final walkaround', 'Mud flaps on, nothing hanging, no fresh drips beneath the trailer. You’re ready to roll.'],
];
let stepIdx = 0;
let UNLOAD = [];
function buildUnload() {
  UNLOAD = [
    ['port', 'Park & secure', 'Truck positioned at the fill ports, parking brakes set, engine per site policy. Four-ways on.', () => { state.hazard = true; refreshUI(); }],
    ['chocks', 'Chock the wheels', 'Chocks go against the trailer tires — the rig must not move an inch during the drop.', () => { chocksG.visible = true; state.chocks = true; }],
    ['placard', 'Verify cargo & paperwork', 'Match the bill of lading to the placards and to the compartment contents: ' + cargoLabel() + '.', null],
    ['port', 'Identify the right fill port', 'Regular, premium, and diesel each have their own underground tank. Wrong port = contaminated station tanks.', null],
    ['emergencyShutoff', 'Locate emergency shutoff', 'BEFORE anything flows, know where the remote shutoff is. It closes every internal valve instantly.', null],
    ['valves', 'Inspect manifold', 'Dust caps off, adapters clean, internal valves confirmed closed.', null],
    ['hose', 'Pull the hose', 'Drop hose comes out of the tube and gets walked to the port — no kinks.', () => hoseDeploy()],
    ['port', 'Connect to the port', 'Cam-locks seated and latched on the underground tank fitting.', () => {
      if (state.hose === 'stored') hoseDeploy(() => hoseConnect()); // self-heal if the user raced past the pull step
      else hoseConnect();
    }],
    ['vaporRecovery', 'Vapor recovery', 'The vapor hose (orange fittings) returns gasoline vapor from the station tank back into the trailer instead of the air.', null],
    ['valves', 'Open valve — product flows', 'Internal valve open, product gravity-drops. Watch the flow through the hose and the gallons counter at the port. The driver stays at the truck the entire time.', () => {
      if (state.hose === 'out') hoseConnect(() => setValve(true)); // self-heal ordering
      else setValve(true);
    }],
    ['compartments', 'Monitor the drop', 'One compartment at a time. Watch the sight glass, listen, and never walk away from a flowing hose.', () => { if (!state.xray && !state.exploded) setView('tank', true); }],
    ['valves', 'Close valve — transfer done', 'Compartment empty. Valve closed, hose drains down toward the port.', () => { setValve(false); if (state.xray) setView('normal', true); }],
    ['hose', 'Disconnect & drain', 'Coupler cracked open slowly to relieve pressure, hose drained fully.', () => hoseDisconnect()],
    ['hoseTubes', 'Store the hose', 'Hose back in the tube, end caps latched.', () => hoseStore()],
    ['chocks', 'Pick up & roll', 'Chocks and cones collected, caps back on the ports, paperwork signed. Ready for the next stop.', () => { chocksG.visible = false; state.chocks = false; state.hazard = false; refreshUI(); }],
  ];
}
function enterMode(mode) {
  if (state.busy) { toast('Wait for the hose animation to finish.'); return; }
  exitMode(true);
  state.mode = mode;
  stepIdx = 0;
  if (mode === 'pretrip') {
    hotspots.forEach(s => { s.visible = true; });
    toast('Pre-trip inspection — the walkaround every driver does before every run', 3200);
    showStep();
  } else if (mode === 'unload') {
    buildUnload();
    toast('Educational animation only. Real fuel delivery must follow company, DOT, site, and hazmat procedures.', 4200);
    showStep();
  } else if (mode === 'drive') {
    secureRigForDriving();
    document.getElementById('drivePad').classList.remove('hidden');
    toast('Drive demo — arrows / WASD or the pad. Easy on the throttle, it’s 80,000 lbs.', 3500);
  } else if (mode === 'mission') {
    secureRigForDriving();
    if (state.xray) setXray(false);
    placeRig(34, -30, 0);
    state.missionPhase = 1;
    state.missionT0 = performance.now();
    dropRing.visible = true;
    document.getElementById('drivePad').classList.remove('hidden');
    const panel = document.getElementById('stepPanel');
    panel.classList.remove('hidden');
    document.getElementById('stepTitle').textContent = '🏁 Fuel Delivery Mission';
    document.getElementById('stepProgress').textContent = '🚚';
    document.getElementById('stepBody').innerHTML =
      '<p>Drive to the glowing yellow ring by the fill ports and stop inside it, pointed the same way you started (toward the road). Then run the full drop. The clock is running!</p>';
    document.getElementById('stepPrev').disabled = true;
    document.getElementById('stepNext').disabled = true;
    ctrl.gTarget.set(34, 2.5, -31);
    ctrl.gTheta = Math.PI;
    ctrl.gPhi = 1.15;
    ctrl.gRadius = 26;
    toast('Mission: deliver the load! Drive to the drop zone — watch the poles and trees.', 4000);
  } else if (mode === 'walk') {
    walk.pos.set(6, 1.7, 10); walk.yaw = Math.PI + 0.5; walk.pitch = -0.05;
    document.getElementById('drivePad').classList.remove('hidden');
    toast('Walk mode — W/S or ▲▼ to walk, A/D or ◀▶ to turn, drag to look, tap parts up close', 4200);
  }
  refreshUI();
}
function secureRigForDriving() {
  if (state.hose !== 'stored') { if (state.valve) setValve(false); hoseDisconnect(() => hoseStore()); if (state.hose === 'out') hoseStore(); }
  if (state.gearDown) setGear(false);
  if (state.hood) setHood(false, true);
  if (state.doorL) setDoor('doorL', false);
  if (state.doorR) setDoor('doorR', false);
  if (state.exploded) setExploded(false);
  if (state.hatches) setHatches(false);
  if (!state.engine) setEngine(true);
  chocksG.visible = false;
}
function checkMissionParked() {
  const d = Math.hypot(rig.position.x, rig.position.z);
  let yaw = rig.rotation.y % (Math.PI * 2);
  if (yaw > Math.PI) yaw -= Math.PI * 2;
  if (yaw < -Math.PI) yaw += Math.PI * 2;
  if (d < 2.8 && Math.abs(state.speed) < 0.15 && Math.abs(yaw) < 0.45) {
    state.missionPhase = 2;
    dropRing.visible = false;
    document.getElementById('drivePad').classList.add('hidden');
    const di = state.driveInput;
    di.fwd = di.back = di.left = di.right = false;
    state.speed = 0;
    const fx = rig.position.x, fz = rig.position.z, fy = yaw;
    tween(0.9, f => {
      rig.position.x = fx * (1 - f); rig.position.z = fz * (1 - f); rig.rotation.y = fy * (1 - f);
      updateTrailer();
    }, () => {
      placeRig(0, 0, 0);
      audio.hiss();
      toast('Parked on the mark! Air brakes set — now run the drop.', 2800);
      buildUnload();
      stepIdx = 0;
      document.getElementById('stepPrev').disabled = false;
      document.getElementById('stepNext').disabled = false;
      showStep();
    });
  }
}
function exitMode(silent) {
  if (state.busy) { toast('Wait for the hose animation to finish.'); return; }
  if (state.mode === 'drive' || state.mode === 'mission' || state.mode === 'walk') {
    document.getElementById('drivePad').classList.add('hidden');
    state.speed = 0;
  }
  dropRing.visible = false;
  state.missionPhase = 0;
  hotspots.forEach(s => { s.visible = false; });
  document.getElementById('stepPrev').disabled = false;
  document.getElementById('stepNext').disabled = false;
  document.getElementById('stepPanel').classList.add('hidden');
  state.mode = 'explore';
  clearHighlight();
  if (!silent) refreshUI();
}
function showStep() {
  const steps = state.mode === 'pretrip' ? PRETRIP : UNLOAD;
  const s = steps[stepIdx];
  if (!s) return;
  const panel = document.getElementById('stepPanel');
  panel.classList.remove('hidden');
  document.getElementById('stepTitle').textContent =
    (state.mode === 'pretrip' ? '🔍 ' : '⛽ ') + s[1];
  document.getElementById('stepProgress').textContent = (stepIdx + 1) + '/' + steps.length;
  document.getElementById('stepBody').innerHTML = '<p>' + s[2] + '</p>' +
    (state.mode === 'unload' ? '<p style="color:#9aa1ab;font-size:11px;margin-top:6px">Educational animation only — not real hazmat training.</p>' : '');
  document.getElementById('stepPrev').disabled = stepIdx === 0 || state.mode !== 'pretrip';
  document.getElementById('stepNext').textContent = stepIdx === steps.length - 1 ? 'Finish ✓' : 'Next ▶';
  // engine-bay steps need the hood tilted
  const bayIds = ['engine', 'coolant', 'belts', 'radiator', 'fan', 'oilCheck', 'airfilter'];
  if (state.mode === 'pretrip') {
    if (bayIds.includes(s[0]) && !state.hood) setHood(true, true);
    else if (!bayIds.includes(s[0]) && state.hood) setHood(false, true);
  }
  const root = partRoots[s[0]] && partRoots[s[0]][0];
  if (root) { highlightObj(root); focusPart(s[0]); }
  if ((state.mode === 'unload' || (state.mode === 'mission' && state.missionPhase === 2)) && s[3]) s[3]();
  refreshUI();
}
function stepNav(dir) {
  if (state.busy) return;
  if (!['pretrip', 'unload', 'mission'].includes(state.mode)) return;
  if (state.mode === 'mission' && state.missionPhase !== 2) return;
  if (dir < 0 && state.mode !== 'pretrip') return;
  if (state.mode !== 'pretrip' && stepIdx === UNLOAD.length - 1 &&
      (state.hose !== 'stored' || state.valve || state.flow || state.chocks)) {
    toast('Secure the hose, close the valve, and collect the chocks before finishing.'); return;
  }
  const steps = state.mode === 'pretrip' ? PRETRIP : UNLOAD;
  stepIdx += dir;
  if (stepIdx >= steps.length) {
    if (state.mode === 'mission') {
      const secs = Math.round((performance.now() - state.missionT0) / 1000);
      state.missions++;
      const best = state.bestTime === null || secs < state.bestTime;
      if (best) state.bestTime = secs;
      persist();
      exitMode();
      toast('🏁 Mission complete in ' + secs + 's' + (best ? ' — NEW BEST TIME!' : ' (best: ' + state.bestTime + 's)') +
        ' • Career deliveries: ' + state.missions, 5200);
      return;
    }
    const done = state.mode === 'pretrip' ?
      'Pre-trip complete! A real inspection takes 15–30 minutes and can save lives.' :
      'Delivery complete! That’s the shape of a real gasoline drop — minus about 40 pages of procedures.';
    exitMode(); toast(done, 4000); return;
  }
  if (stepIdx < 0) stepIdx = 0;
  showStep();
}

/* ================= reset ================= */
function resetAll() {
  if (state.busy) { toast('Wait for the hose animation to finish.'); return; }
  exitMode(true);
  if (state.hood) setHood(false, true);
  if (state.doorL) setDoor('doorL', false);
  if (state.doorR) setDoor('doorR', false);
  if (state.engine) setEngine(false);
  if (state.valve) setValve(false);
  if (state.gearDown) setGear(false);
  if (state.exploded) setExploded(false);
  if (state.view !== 'normal' || state.xray) setView('normal', true);
  if (state.fluid !== 'none') setFluid('none');
  state.head = state.marker = state.brake = state.hazard = false;
  if (state.hose === 'connected') hoseDisconnect(() => hoseStore());
  else if (state.hose === 'out') hoseStore();
  if (state.cargo !== 'gasoline') { state.cargo = 'empty'; cycleCargo(); }
  if (state.wipers) setWipers(false);
  if (state.hatches) setHatches(false);
  if (state.rain) setRain(false);
  knockCones.forEach(kc => { kc.down = false; kc.obj.rotation.set(0, 0, 0); kc.obj.position.copy(kc.home); });
  resetDrop();
  chocksG.visible = false; state.chocks = false;
  placeRig(0, 0, 0);
  state.speed = 0;
  ctrl.gTarget.set(2.5, 1.8, 0); ctrl.gRadius = 22; ctrl.gTheta = 0.9; ctrl.gPhi = 1.25;
  closeInfo();
  applyLightMats();
  refreshUI();
  toast('Everything reset — fresh rig, ready to explore');
}

/* ================= audio (tiny, procedural) ================= */
const audio = (function () {
  let ac = null, engOsc = null, engOsc2 = null, engGain = null, engFilt = null, noiseBuf = null;
  function ctx() {
    if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { } }
    if (ac && ac.state === 'suspended') ac.resume();
    return ac;
  }
  function noise(a) {
    if (!noiseBuf) {
      const b = a.createBuffer(1, a.sampleRate, a.sampleRate);
      const d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      noiseBuf = b;
    }
    return noiseBuf;
  }
  function burst(freq, dur, vol, type) {
    const a = ctx(); if (!a) return;
    const s = a.createBufferSource(); s.buffer = noise(a);
    const f = a.createBiquadFilter(); f.type = type || 'lowpass'; f.frequency.value = freq;
    const g = a.createGain();
    g.gain.setValueAtTime(vol, a.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + dur);
    s.connect(f); f.connect(g); g.connect(a.destination);
    s.start(); s.stop(a.currentTime + dur + 0.05);
  }
  return {
    engine(on) {
      const a = ctx(); if (!a) return;
      if (on && !engOsc) {
        engOsc = a.createOscillator(); engOsc.type = 'sawtooth'; engOsc.frequency.value = 42;
        engOsc2 = a.createOscillator(); engOsc2.type = 'square'; engOsc2.frequency.value = 21;
        const lfo = a.createOscillator(); lfo.frequency.value = 11;
        const lfoG = a.createGain(); lfoG.gain.value = 6;
        lfo.connect(lfoG); lfoG.connect(engOsc.frequency);
        engFilt = a.createBiquadFilter(); engFilt.type = 'lowpass'; engFilt.frequency.value = 130;
        engGain = a.createGain(); engGain.gain.value = 0;
        const sub = a.createGain(); sub.gain.value = 0.4;
        engOsc.connect(engFilt); engOsc2.connect(sub); sub.connect(engFilt);
        engFilt.connect(engGain); engGain.connect(a.destination);
        engOsc.start(); engOsc2.start(); lfo.start();
        engGain.gain.linearRampToValueAtTime(0.06, a.currentTime + 0.8);
        engOsc._lfo = lfo;
        burst(320, 0.55, 0.18); // starter chuff
      } else if (!on && engOsc) {
        engGain.gain.linearRampToValueAtTime(0, a.currentTime + 0.5);
        const o = engOsc, o2 = engOsc2, l = engOsc._lfo;
        setTimeout(() => { try { o.stop(); o2.stop(); l.stop(); } catch (e) { } }, 600);
        engOsc = null; engOsc2 = null;
        burst(1400, 0.5, 0.12, 'bandpass'); // air release
      }
    },
    setRPM(f) {
      if (!engOsc || !ac) return;
      const fr = 42 + f * 78;
      engOsc.frequency.setTargetAtTime(fr, ac.currentTime, 0.09);
      engOsc2.frequency.setTargetAtTime(fr / 2, ac.currentTime, 0.09);
      engFilt.frequency.setTargetAtTime(130 + f * 480, ac.currentTime, 0.12);
      engGain.gain.setTargetAtTime(0.05 + f * 0.055, ac.currentTime, 0.15);
    },
    beep() {
      const a = ctx(); if (!a) return;
      const o = a.createOscillator(); o.type = 'square'; o.frequency.value = 950;
      const g = a.createGain(); g.gain.value = 0.04;
      o.connect(g); g.connect(a.destination);
      o.start();
      g.gain.setValueAtTime(0.04, a.currentTime + 0.14);
      g.gain.linearRampToValueAtTime(0, a.currentTime + 0.18);
      o.stop(a.currentTime + 0.2);
    },
    hiss() { burst(1600, 0.7, 0.22, 'bandpass'); },
    clunk() { burst(180, 0.16, 0.5); },
    tick() {
      const a = ctx(); if (!a) return;
      const o = a.createOscillator(); o.type = 'square'; o.frequency.value = 1600;
      const g = a.createGain(); g.gain.value = 0.02;
      o.connect(g); g.connect(a.destination);
      o.start();
      g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + 0.03);
      o.stop(a.currentTime + 0.05);
    },
    rain(on) {
      const a = ctx(); if (!a) return;
      if (on && !this._rainSrc) {
        const s = a.createBufferSource(); s.buffer = noise(a); s.loop = true;
        const f = a.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 950; f.Q.value = 0.4;
        const g = a.createGain(); g.gain.value = 0;
        s.connect(f); f.connect(g); g.connect(a.destination);
        s.start();
        g.gain.linearRampToValueAtTime(0.035, a.currentTime + 1.2);
        this._rainSrc = s; this._rainGain = g;
      } else if (!on && this._rainSrc) {
        const s = this._rainSrc, g = this._rainGain;
        g.gain.linearRampToValueAtTime(0, a.currentTime + 0.8);
        setTimeout(() => { try { s.stop(); } catch (e) { } }, 900);
        this._rainSrc = null;
      }
    },
    horn() {
      const a = ctx(); if (!a) return;
      [310, 372].forEach(f => {
        const o = a.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
        const g = a.createGain(); g.gain.value = 0.09;
        o.connect(g); g.connect(a.destination);
        o.start();
        g.gain.setValueAtTime(0.09, a.currentTime + 0.55);
        g.gain.linearRampToValueAtTime(0, a.currentTime + 0.75);
        o.stop(a.currentTime + 0.8);
      });
    }
  };
})();

/* ================= UI ================= */
const controlsEl = document.getElementById('controls');
const BTN = {};
const UI_GROUPS = [
  ['Tractor', [
    ['engine', () => (state.engine ? '🔴 Stop Engine' : '🟢 Start Engine'), () => setEngine(!state.engine)],
    ['horn', () => '📢 Horn', () => { audio.horn(); toast('HOOOONK!', 900); }],
    ['hood', () => (state.hood ? 'Close Hood' : 'Open Hood'), () => setHood(!state.hood)],
    ['doorL', () => (state.doorL ? 'Close Driver Door' : 'Driver Door'), () => setDoor('doorL', !state.doorL)],
    ['doorR', () => (state.doorR ? 'Close Pass. Door' : 'Passenger Door'), () => setDoor('doorR', !state.doorR)],
    ['wipers', () => (state.wipers ? 'Wipers Off' : 'Wipers On'), () => setWipers(!state.wipers)],
  ]],
  ['Lights', [
    ['head', () => 'Headlights', () => { state.head = !state.head; applyLightMats(); refreshUI(); }],
    ['marker', () => 'Markers', () => { state.marker = !state.marker; applyLightMats(); refreshUI(); }],
    ['brake', () => 'Brake Lights', () => { state.brake = !state.brake; applyLightMats(); refreshUI(); }],
    ['hazard', () => 'Hazards', () => { state.hazard = !state.hazard; refreshUI(); }],
  ]],
  ['Tanker', [
    ['gear', () => (state.gearDown ? 'Raise Landing Gear' : 'Lower Landing Gear'), () => setGear(!state.gearDown)],
    ['valve', () => (state.valve ? 'Close Valve' : 'Open Valve'), () => setValve(!state.valve)],
    ['hosePull', () => (state.hose === 'stored' ? 'Pull Out Hose' : 'Store Hose'), () => {
      if (state.busy) return;
      if (state.hose === 'stored') hoseDeploy();
      else if (state.hose === 'out') hoseStore();
      else toast('Disconnect the hose first');
    }],
    ['hoseConn', () => (state.hose === 'connected' ? 'Disconnect Hose' : 'Connect Hose'), () => {
      if (state.busy) return;
      if (state.hose === 'out') hoseConnect();
      else if (state.hose === 'connected') { if (state.valve) { toast('Close the valve before disconnecting!'); } else hoseDisconnect(); }
      else toast('Pull the hose out first');
    }],
    ['cargo', () => '🛢 Cargo: ' + (state.cargo === 'gasoline' ? 'Gasoline' : state.cargo === 'diesel' ? 'Diesel' : 'Empty'), cycleCargo],
    ['hatch', () => (state.hatches ? 'Close Hatches' : 'Open Hatches'), () => setHatches(!state.hatches)],
  ]],
  ['X-Ray Views', [
    ['vNormal', () => 'Normal', () => setView('normal')],
    ['vTank', () => 'X-Ray Tank', () => setView('tank')],
    ['vEngine', () => 'X-Ray Engine', () => setView('engine')],
    ['vCab', () => 'X-Ray Cab', () => setView('cab')],
    ['vCut', () => '🔬 Full Cutaway', () => setView('cutaway')],
  ]],
  ['Fluids (schematic)', [
    ['fDiesel', () => 'Diesel', () => setFluid(state.fluid === 'diesel' ? 'none' : 'diesel')],
    ['fCargo', () => 'Gasoline Cargo', () => setFluid(state.fluid === 'cargo' ? 'none' : 'cargo')],
    ['fOil', () => 'Engine Oil', () => setFluid(state.fluid === 'oil' ? 'none' : 'oil')],
    ['fCool', () => 'Coolant', () => setFluid(state.fluid === 'coolant' ? 'none' : 'coolant')],
    ['fDef', () => 'DEF', () => setFluid(state.fluid === 'def' ? 'none' : 'def')],
    ['fAll', () => 'Show All Fluids', () => setFluid('all')],
    ['fNone', () => 'Hide Fluids', () => setFluid('none')],
  ]],
  ['Modes & Views', [
    ['pretrip', () => '🔍 Pre-Trip Inspection', () => enterMode('pretrip')],
    ['unload', () => '⛽ Unloading Demo', () => enterMode('unload')],
    ['mission', () => '🏁 Delivery Mission', () => enterMode('mission')],
    ['drive', () => (state.mode === 'drive' ? '🅿 Stop Driving' : '🚚 Drive Demo'), () => state.mode === 'drive' ? exitMode() : enterMode('drive')],
    ['walkm', () => (state.mode === 'walk' ? '🚶 Stop Walking' : '🚶 Walk Around'), () => state.mode === 'walk' ? exitMode() : enterMode('walk')],
    ['explode', () => (state.exploded ? 'Assemble' : '💥 Exploded View'), () => setExploded(!state.exploded)],
    ['night', () => (state.night ? '☀️ Day' : '🌙 Night'), () => setNight(!state.night)],
    ['rain', () => (state.rain ? '🌤 Clear Skies' : '🌧 Rain'), () => setRain(!state.rain)],
    ['quality', () => '🎚 Quality: ' + state.quality.toUpperCase(), cycleQuality],
    ['showcase', () => '🎥 Showcase Cam', () => setShowcase(!state.showcase)],
    ['cam', () => '🎯 Reset Camera', () => { ctrl.gTarget.set(2.5, 1.8, 0); ctrl.gRadius = 22; ctrl.gTheta = 0.9; ctrl.gPhi = 1.25; }],
    ['photo', () => '📸 Photo Mode', () => setPhoto(true)],
    ['manual', () => '📘 Field Manual', () => document.getElementById('manualModal').classList.remove('hidden')],
    ['reset', () => '↺ Reset All', resetAll],
  ]],
];
UI_GROUPS.forEach(([title, btns]) => {
  const h = document.createElement('h3'); h.textContent = title; controlsEl.appendChild(h);
  const grp = document.createElement('div'); grp.className = 'grp'; controlsEl.appendChild(grp);
  btns.forEach(([id, label, fn]) => {
    const b = document.createElement('button');
    b.id = 'btn_' + id;
    b.addEventListener('click', () => { fn(); refreshUI(); });
    grp.appendChild(b);
    BTN[id] = { el: b, label };
  });
});
function refreshUI() {
  const guided = state.mode === 'pretrip' || state.mode === 'unload' || (state.mode === 'mission' && state.missionPhase === 2);
  if (guided) {
    document.getElementById('stepNext').disabled = state.busy;
    document.getElementById('stepPrev').disabled = state.busy || state.mode !== 'pretrip' || stepIdx === 0;
  }
  Object.values(BTN).forEach(b => { b.el.textContent = b.label(); });
  BTN.head.el.classList.toggle('active', state.head);
  BTN.marker.el.classList.toggle('active', state.marker);
  BTN.brake.el.classList.toggle('active', state.brake);
  BTN.hazard.el.classList.toggle('active', state.hazard);
  BTN.engine.el.classList.toggle('active', state.engine);
  BTN.wipers.el.classList.toggle('active', state.wipers);
  BTN.rain.el.classList.toggle('active', state.rain);
  BTN.hatch.el.classList.toggle('active', state.hatches);
  const viewMap = { vNormal: 'normal', vTank: 'tank', vEngine: 'engine', vCab: 'cab', vCut: 'cutaway' };
  Object.keys(viewMap).forEach(k => BTN[k].el.classList.toggle('active', state.view === viewMap[k]));
  const fluidMap = { fDiesel: 'diesel', fCargo: 'cargo', fOil: 'oil', fCool: 'coolant', fDef: 'def', fAll: 'all' };
  Object.keys(fluidMap).forEach(k => BTN[k].el.classList.toggle('active', state.fluid === fluidMap[k]));
  BTN.explode.el.classList.toggle('active', state.exploded);
  BTN.showcase.el.classList.toggle('active', state.showcase);
  const chip = (id, txt, on, warn) => {
    const el = document.getElementById(id);
    el.textContent = txt;
    el.classList.toggle('on', !!on);
    el.classList.toggle('warn', !!warn);
  };
  chip('stEngine', 'Engine: ' + (state.engine ? 'RUNNING' : 'OFF'), state.engine);
  const lights = [state.head && 'head', state.marker && 'marker', state.brake && 'brake', state.hazard && 'hazard'].filter(Boolean);
  chip('stLights', 'Lights: ' + (lights.length ? lights.join('+') : 'off'), lights.length);
  const doors = [state.hood && 'hood', state.doorL && 'L', state.doorR && 'R'].filter(Boolean);
  chip('stDoors', doors.length ? 'Open: ' + doors.join('+') : 'Doors: closed', doors.length);
  chip('stGear', 'Landing gear: ' + (state.gearDown ? 'DOWN' : 'UP'), false, state.gearDown);
  const hoseStatus = state.hose === 'stored' ? 'SECURED' : state.hose === 'out' ? 'READY' : (state.flow ? 'FLOWING' : 'CONNECTED');
  chip('stHose', 'Hose: ' + hoseStatus, state.hose !== 'stored', state.flow);
  chip('stValve', 'Valve: ' + (state.valve ? 'OPEN' : 'closed'), false, state.valve);
  chip('stCargo', 'Cargo: ' + cargoLabel(), false, false);
  chip('stMode', 'Mode: ' + ({ explore: 'Explore', pretrip: 'Pre-Trip', unload: 'Unloading Demo', drive: 'Drive', mission: 'Mission 🏁', walk: 'Walk' })[state.mode], state.mode !== 'explore');
}
document.getElementById('menuToggle').addEventListener('click', () => {
  controlsEl.classList.toggle('open');
  hideHint();
});
document.getElementById('infoClose').addEventListener('click', closeInfo);
document.getElementById('infoFocus').addEventListener('click', () => { if (selectedId) focusPart(selectedId); });
document.getElementById('stepNext').addEventListener('click', () => stepNav(1));
document.getElementById('stepPrev').addEventListener('click', () => stepNav(-1));
document.getElementById('stepExit').addEventListener('click', () => { exitMode(); });
document.getElementById('manualClose').addEventListener('click', () => document.getElementById('manualModal').classList.add('hidden'));
document.getElementById('manualModal').addEventListener('click', (e) => {
  if (e.target.id === 'manualModal') e.target.classList.add('hidden');
});
/* manual content */
(function buildManual() {
  const body = document.getElementById('manualBody');
  let html = '<p style="color:#ffd23f;font-weight:600">Everything on this rig, in one place. Tap any part in the 3D view for the same info in context.</p>' +
    '<p style="color:#9aa1ab;font-size:11px">Educational visualization only. This is not company, DOT, hazmat, fueling, or vehicle-operation training.</p>';
  html += '<h4>Keyboard Shortcuts</h4><p>W/S or ↑/↓ — drive / walk &nbsp;•&nbsp; A/D or ←/→ — steer / turn &nbsp;•&nbsp; E — engine &nbsp;•&nbsp; L — headlights &nbsp;•&nbsp; H — horn &nbsp;•&nbsp; type “DAD” — ??? ❤️</p>';
  const ids = Object.keys(INFO).filter(k => INFO[k]);
  ids.sort((a, b) => INFO[a][0].localeCompare(INFO[b][0]));
  ids.forEach(id => {
    const e = INFO[id];
    html += '<h4>' + e[0] + '</h4><p>' + e[1] + ' ' + e[2] + '<br><i>Check: ' + e[3] + '</i></p>';
  });
  body.innerHTML = html;
})();
/* drive pad + keyboard */
const padMap = { fwd: 'fwd', back: 'back', left: 'left', right: 'right' };
document.querySelectorAll('#drivePad button').forEach(b => {
  const k = padMap[b.dataset.k];
  const set = (v) => (e) => { e.preventDefault(); state.driveInput[k] = v; };
  b.addEventListener('pointerdown', set(true));
  b.addEventListener('pointerup', set(false));
  b.addEventListener('pointerleave', set(false));
  b.addEventListener('pointercancel', set(false));
});
const KEYMAP = { ArrowUp: 'fwd', KeyW: 'fwd', ArrowDown: 'back', KeyS: 'back', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' };
window.addEventListener('keydown', (e) => {
  if (KEYMAP[e.code]) {
    state.driveInput[KEYMAP[e.code]] = true;
    if (state.mode === 'drive' || state.mode === 'walk' || state.mode === 'mission') e.preventDefault();
  }
  if (e.code === 'KeyH') { audio.horn(); }
  if (e.code === 'KeyL') { state.head = !state.head; applyLightMats(); refreshUI(); }
  if (e.code === 'KeyE') { setEngine(!state.engine); }
  if (/^Key[A-Z]$/.test(e.code)) {
    dadBuf = (dadBuf + e.code[3]).slice(-3);
    if (dadBuf === 'DAD') { dadBuf = ''; throwConfetti(); }
  }
});
let dadBuf = '';
document.getElementById('madeFor').style.cursor = 'pointer';
document.getElementById('madeFor').addEventListener('click', throwConfetti);
window.addEventListener('keyup', (e) => { if (KEYMAP[e.code]) state.driveInput[KEYMAP[e.code]] = false; });

/* ================= main loop ================= */
let last = performance.now();
let hazardPhase = 0;
let wasFast = false, lastBeep = 0, lastBlinkOn = false;
let cabPitch = 0, cabRoll = 0, cabPitchT = 0, cabRollT = 0;
function resize() {
  const w = canvas.clientWidth || window.innerWidth;
  const h = canvas.clientHeight || window.innerHeight;
  if (canvas.width !== Math.floor(w * renderer.getPixelRatio()) || canvas.height !== Math.floor(h * renderer.getPixelRatio())) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
}
window.addEventListener('resize', resize);

function advanceFrame(now) {
  const elapsed = Math.max(0, (now - last) / 1000);
  last = now;
  // UI/hose transitions use wall time even on a slow GPU. Only physics is capped.
  stepTweens(elapsed);
  return Math.min(0.05, elapsed);
}
function animate(now) {
  requestAnimationFrame(animate);
  resize();
  const dt = advanceFrame(now);
  ctrlUpdate(dt);
  const t = now / 1000;

  // showcase auto orbit
  if (state.showcase) ctrl.gTheta += dt * 0.16;

  // engine effects (jitter on tractor root so it can't fight the exploded-view offsets)
  if (state.engine) {
    fan.rotation.z += dt * 18;
    tractor.position.y = Math.sin(t * 42) * 0.0045;
  } else tractor.position.y = 0;

  hazardPhase += dt;

  // flow indicator
  if (state.flow && hoseCurve) {
    flowG.visible = true;
    flowG.children.forEach((s, i) => {
      const f = (t * 0.35 + i / 8) % 1;
      s.position.copy(hoseCurve.getPoint(f));
    });
  } else flowG.visible = false;

  // wipers sweep
  if (state.wipers) {
    const wa = 0.5 + Math.sin(t * 5.2) * 0.62;
    wiperPivots.forEach(p => { p.rotation.z = wa; });
  }

  // rain falls around the camera
  if (state.rain) {
    rainLines.position.set(ctrl.target.x, 0, ctrl.target.z);
    const arr = rainGeo.attributes.position.array;
    const fall = 26 * dt;
    for (let i = 0; i < RAIN_N; i++) {
      arr[i * 6 + 1] -= fall; arr[i * 6 + 4] -= fall;
      if (arr[i * 6 + 1] < 0) { arr[i * 6 + 1] += 26; arr[i * 6 + 4] += 26; }
    }
    rainGeo.attributes.position.needsUpdate = true;
  }

  // mission drop-zone ring pulse
  if (dropRing.visible) {
    const rs = 1 + Math.sin(t * 4) * 0.08;
    dropRing.scale.set(rs, rs, 1);
  }

  // drive physics (drive demo + mission driving phase)
  const driving = state.mode === 'drive' || (state.mode === 'mission' && state.missionPhase === 1);
  if (driving) {
    const di = state.driveInput;
    let acc = 0;
    if (di.fwd) acc = state.speed < 0 ? 6.0 : 3.0;           // throttle (or brake out of reverse)
    else if (di.back) acc = state.speed > 0.25 ? -6.5 : -1.6; // service brake, then reverse
    state.speed += acc * dt;
    state.speed -= state.speed * dt * (di.fwd || di.back ? 0.12 : 1.1); // rolling drag / engine brake
    const maxF = state.rain ? 7 : 9;
    state.speed = Math.max(-2.4, Math.min(maxF, state.speed));
    if (Math.abs(state.speed) < 0.02 && !di.fwd && !di.back) state.speed = 0;
    if (di.back && wasFast && state.speed < 0.4 && state.speed >= 0) { audio.hiss(); wasFast = false; }
    if (Math.abs(state.speed) > 2.5) wasFast = true;
    if (state.speed < -0.15 && t - lastBeep > 0.85) { audio.beep(); lastBeep = t; } // reverse beeper
    const steer = (di.left ? 1 : 0) - (di.right ? 1 : 0);
    steerPivots.forEach(p => { p.rotation.y += ((steer * 0.45) - p.rotation.y) * Math.min(1, dt * 6); });
    cabPitchT = -acc * 0.006;
    cabRollT = steer * state.speed * 0.0045;
    if (Math.abs(state.speed) > 0.02) {
      rig.rotation.y += steer * state.speed * dt * 0.12;
      const fwd = V3(Math.sin(rig.rotation.y), 0, Math.cos(rig.rotation.y));
      const next = rig.position.clone().addScaledVector(fwd, state.speed * dt);
      const probe = state.speed > 0 ? next.clone().addScaledVector(fwd, 9.4) : trailerAxle.clone().addScaledVector(fwd, -2.2);
      const probe2 = next.clone().addScaledVector(fwd, 5);
      if (hitsObstacle(probe, 1.0) || hitsObstacle(probe2, 1.0)) {
        if (Math.abs(state.speed) > 1.2) { audio.clunk(); toast('Easy! You bumped something — back up and steer around it.'); }
        state.speed = 0;
      } else {
        rig.position.copy(next);
      }
      rig.position.x = Math.max(-65, Math.min(65, rig.position.x));
      rig.position.z = Math.max(-65, Math.min(65, rig.position.z));
      knockCones.forEach(kc => {
        if (kc.down) return;
        const cw = kc.obj.position;
        const near = Math.hypot(probe2.x - cw.x, probe2.z - cw.z) < 1.4 ||
                     Math.hypot(rig.position.x - cw.x, rig.position.z - cw.z) < 1.4;
        if (near && Math.abs(state.speed) > 0.6) knockCone(kc, fwd.clone());
      });
      spinWheels.forEach(w => { w.userData.spin.rotation.x += state.speed * dt / 0.52; });
      // camera follows
      const behind = rig.position.clone().addScaledVector(fwd, -1).add(V3(0, 2.5, 0));
      ctrl.gTarget.lerp(behind, Math.min(1, dt * 2));
    }
    if (state.mode === 'mission' && state.missionPhase === 1) checkMissionParked();
  }

  // trailer articulation — always follows the fifth wheel
  updateTrailer();

  // walk mode (first-person)
  if (state.mode === 'walk') {
    const di = state.driveInput;
    walk.yaw += ((di.left ? 1 : 0) - (di.right ? 1 : 0)) * dt * 1.8;
    const mv = (di.fwd ? 1 : 0) - (di.back ? 1 : 0);
    if (mv) {
      walk.pos.x += Math.sin(walk.yaw) * mv * dt * 3.4;
      walk.pos.z += Math.cos(walk.yaw) * mv * dt * 3.4;
    }
    // keep the walker out of the rig
    [{ root: rig, yaw: rig.rotation.y, hw: 1.9, z1: 0.4, z2: 10 },
     { root: trailer, yaw: trailerYaw, hw: 1.7, z1: -10.8, z2: 3.2 }].forEach(bb => {
      const lp = walk.pos.clone().sub(bb.root.position).applyAxisAngle(V3(0, 1, 0), -bb.yaw);
      if (lp.x > -bb.hw && lp.x < bb.hw && lp.z > bb.z1 && lp.z < bb.z2) {
        lp.x = lp.x > 0 ? bb.hw : -bb.hw;
        walk.pos.copy(lp.applyAxisAngle(V3(0, 1, 0), bb.yaw).add(bb.root.position));
      }
    });
    walk.pos.x = Math.max(-70, Math.min(70, walk.pos.x));
    walk.pos.z = Math.max(-70, Math.min(70, walk.pos.z));
    walk.pos.y = 1.7;
    camera.position.copy(walk.pos);
    camera.lookAt(walk.pos.clone().add(V3(
      Math.sin(walk.yaw) * Math.cos(walk.pitch),
      Math.sin(walk.pitch),
      Math.cos(walk.yaw) * Math.cos(walk.pitch))));
  }

  // live gauges + engine note follows RPM
  const spd = Math.abs(state.speed);
  if (state.engine) audio.setRPM(Math.min(1, spd / 9));
  setNeedle(rpmNeedle, state.engine ? 0.15 + Math.min(1, spd / 9) * 0.75 : 0);
  setNeedle(mphNeedle, Math.min(1, spd / 10));

  // fluid overlay pulse (flows when engine runs)
  if (state.fluid !== 'none') {
    const fp = state.engine ? 0.55 + Math.sin(t * 6) * 0.3 : 0.75;
    fluidPulseMats.forEach(m => { m.opacity = fp; });
  }
  if (state.cargoGlow || state.flow) {
    const cp = 0.7 + Math.sin(t * (state.flow ? 8 : 4)) * 0.25;
    compMeshes.forEach(m => { m.material.opacity = cp; });
  }
  // pre-trip hotspot pulse
  if (state.mode === 'pretrip') {
    const hs = 0.3 + Math.sin(t * 5) * 0.07;
    hotspots.forEach(s => s.scale.set(hs, hs, 1));
  }

  // signal, brake & reverse lights
  const di2 = state.driveInput;
  const braking = state.brake || (driving && di2.back && state.speed > 0.05);
  LM.tail.emissiveIntensity = braking ? 2.2 : (state.marker ? 0.7 : 0);
  LM.rev.emissiveIntensity = state.speed < -0.05 ? 2.0 : 0;
  const blinkOn = (hazardPhase % 1.0) < 0.5;
  const sigL = state.hazard || (driving && di2.left);
  const sigR = state.hazard || (driving && di2.right);
  LM.turnL.emissiveIntensity = sigL && blinkOn ? 2.4 : 0;
  LM.turnR.emissiveIntensity = sigR && blinkOn ? 2.4 : 0;
  if ((sigL || sigR) && blinkOn !== lastBlinkOn) audio.tick();
  lastBlinkOn = blinkOn;

  // cab lean under throttle/brake/cornering
  if (!driving) { cabPitchT = 0; cabRollT = 0; }
  cabPitch += (cabPitchT - cabPitch) * Math.min(1, dt * 5);
  cabRoll += (cabRollT - cabRoll) * Math.min(1, dt * 5);
  cabG.rotation.x = cabPitch;
  cabG.rotation.z = cabRoll;

  // CB antennas whip back with speed
  antennas.forEach((a, i) => {
    a.rotation.x = -Math.min(0.35, spd * 0.03) + Math.sin(t * 7 + i * 2) * 0.02 * Math.min(1, spd);
  });

  // exhaust smoke
  if (state.engine) {
    smokeTimer -= dt;
    const rpmF = Math.min(1, spd / 9);
    if (smokeTimer <= 0) {
      smokeTimer = 0.22 - rpmF * 0.14;
      const p = smokePuffs.find(pp => pp.life <= 0);
      if (p) {
        p.life = 1;
        p.s.visible = true;
        p.s.position.set(1.15 + (Math.random() - 0.5) * 0.06, 3.85, 4.45 + (Math.random() - 0.5) * 0.06);
        p.s.scale.set(0.12, 0.12, 1);
        p.s.material.opacity = 0.26 + rpmF * 0.3;
      }
    }
  }
  smokePuffs.forEach(p => {
    if (p.life <= 0) return;
    p.life -= dt * 0.6;
    p.s.position.y += dt * 1.1;
    p.s.position.x += dt * 0.15;
    const sc = 0.12 + (1 - p.life) * 0.55;
    p.s.scale.set(sc, sc, 1);
    p.s.material.opacity *= (1 - dt * 1.1);
    if (p.life <= 0) p.s.visible = false;
  });

  // gallons counter + compartment 2 drains during the drop
  if (state.flow) {
    state.dropGal = Math.min(2500, state.dropGal + dt * 130);
    const level = Math.max(0.12, 1 - state.dropGal / 2500);
    const c2 = compMeshes[1];
    c2.scale.y = level;
    c2.position.y = -(1 - level) * 0.88;
    galSpr.visible = true;
    galTimer -= dt;
    if (galTimer <= 0) { galTimer = 0.15; drawGal(); }
    if (state.dropGal >= 2500 && !dropToastDone) {
      dropToastDone = true;
      toast('Compartment 2 empty — close the valve and drain the hose');
    }
  }
  if (prevFlow !== state.flow) { prevFlow = state.flow; if (galSpr.visible) drawGal(); }

  // living world: sky drift, flag wave, sky dancer, traffic, birds
  sky.rotation.y += dt * 0.0025;
  {
    const pos = flagGeo.attributes.position;
    const wind = state.rain ? 1.8 : 1;
    for (let i = 0; i < pos.count; i++) {
      const bx = flagBase[i * 3];
      const k = (bx + 0.8) / 1.6;
      pos.setZ(i, (Math.sin(bx * 5 + t * 5.5) * 0.1 + Math.sin(t * 2.1) * 0.04) * k * wind);
    }
    pos.needsUpdate = true;
  }
  dSeg1.rotation.z = Math.sin(t * 3.3) * 0.22;
  dSeg1.rotation.x = Math.sin(t * 2.1) * 0.12;
  dSeg2.rotation.z = Math.sin(t * 3.3 + 1.3) * 0.45;
  dSeg3.rotation.z = Math.sin(t * 4.4 + 2.1) * 0.6;
  dSeg3.rotation.x = Math.sin(t * 3.7 + 0.7) * 0.3;
  traffic.forEach(tr => {
    tr.g.position.x += tr.dir * tr.sp * dt;
    if (tr.g.position.x > 150) tr.g.position.x = -150;
    if (tr.g.position.x < -150) tr.g.position.x = 150;
  });
  birds.forEach(bd => {
    if (!bd.b.visible) return;
    const a = t * bd.sp + bd.ph;
    bd.b.position.set(Math.cos(a) * bd.r - 5, bd.h + Math.sin(t * 1.3 + bd.ph) * 0.8, Math.sin(a) * bd.r - 10);
  });

  // confetti for Dad
  confetti.forEach(c => {
    if (c.life <= 0) return;
    c.life -= dt;
    c.s.position.x += c.vx * dt;
    c.s.position.y += c.vy * dt;
    c.s.position.z += c.vz * dt;
    c.vx += Math.sin(t * 8 + c.rot * 10) * dt * 0.8;
    c.s.material.rotation += c.rot * dt;
    if (c.life < 1) c.s.material.opacity = Math.max(0, c.life);
    if (c.s.position.y < 0.05 || c.life <= 0) { c.life = 0; c.s.visible = false; }
  });

  renderer.render(scene, camera);
}
setHose(hoseEndFor(0), 0); // init hose plumbing (hidden)
if (hoseMesh) { hoseGroup.remove(hoseMesh); hoseMesh.geometry.dispose(); hoseMesh = null; coupler.visible = false; }
applyLightMats();
applyQuality(state.quality);
applyAtmosphere();
refreshUI();
resize();
/* opening showcase pan (interrupted by any input) */
let intro = true;
ctrl.theta = ctrl.gTheta = -1.7; ctrl.radius = ctrl.gRadius = 72; ctrl.phi = ctrl.gPhi = 1.38;
tween(4.5, f => {
  if (!intro) return;
  const th = -1.7 + (0.9 + 1.7) * f, r = 72 - (72 - 22) * f, ph = 1.38 - (1.38 - 1.25) * f;
  ctrl.theta = ctrl.gTheta = th;
  ctrl.radius = ctrl.gRadius = r;
  ctrl.phi = ctrl.gPhi = ph;
}, () => { intro = false; });
requestAnimationFrame(animate);

/* fade the tap hint after a while */
setTimeout(hideHint, 12000);

/* ================= training-shell integration ================= */
const embedded = (function () { try { return window.parent && window.parent !== window; } catch (e) { return false; } })();
function postToTrainer(type, data) {
  if (!embedded) return;
  try { window.parent.postMessage(Object.assign({ source: 'tanker', type: type }, data || {}), '*'); } catch (e) { }
}
function runAction(action, arg) {
  if (!action) return;
  switch (action) {
    case 'normal': case 'tank': case 'engine': case 'cab': case 'cutaway': setView(action); break;
    case 'exploded': setExploded(true); break;
    case 'fluid-diesel': setFluid('diesel'); break;
    case 'fluid-cargo': setFluid('cargo'); break;
    case 'fluid-oil': setFluid('oil'); break;
    case 'fluid-coolant': setFluid('coolant'); break;
    case 'fluid-def': setFluid('def'); break;
    case 'fluid-all': setFluid('all'); break;
    case 'fluid-none': setFluid('none'); break;
    case 'pretrip': case 'unload': case 'mission': case 'drive': case 'walk': enterMode(action); break;
    case 'explore': exitMode(); break;
    case 'night': setNight(true); break;
    case 'day': setNight(false); break;
    case 'rain': setRain(true); break;
    case 'clear': setRain(false); break;
    case 'reset': resetAll(); break;
    case 'part': if (arg && INFO[arg]) { selectPart(arg); focusPart(arg); } break;
    default: break;
  }
}
/* expose a clean API for same-origin parents */
window.tankerAPI = {
  run: runAction,
  view: setView, fluid: setFluid, mode: enterMode, exit: exitMode,
  night: setNight, rain: setRain, reset: resetAll,
  part: function (id) { if (INFO[id]) { selectPart(id); focusPart(id); } },
  state: state,
};
/* parse the launch hash: #action=tank&part=fifthWheel&chrome=embed&motion=off */
function parseHash() {
  const h = (location.hash || '').replace(/^#/, '');
  const q = {};
  h.split('&').forEach(kv => { const i = kv.indexOf('='); if (i > 0) q[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1)); });
  return q;
}
function prefersReducedMotion() {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; }
}
function applyHash() {
  const q = parseHash();
  if (q.motion === 'off' || prefersReducedMotion()) { intro = false; if (state.showcase) setShowcase(false); }
  if (q.action) runAction(q.action);
  if (q.part && INFO[q.part]) { selectPart(q.part); focusPart(q.part); }
}
window.addEventListener('hashchange', applyHash);
/* accept commands from the training shell without reloading the iframe */
window.addEventListener('message', function (e) {
  const d = e.data;
  if (!d || d.source !== 'trainer') return;
  if (d.cmd === 'action') runAction(d.action, d.arg);
  else if (d.cmd === 'reset') resetAll();
  else if (d.cmd === 'ping') postToTrainer('pong', {});
});
/* when embedded, add a Back-to-Training pill and announce readiness */
if (embedded) {
  document.body.classList.add('embedded');
  const back = document.createElement('button');
  back.id = 'backToTraining';
  back.textContent = '‹ Back to Training';
  back.addEventListener('click', function () { postToTrainer('back', {}); });
  document.body.appendChild(back);
}
applyHash();
postToTrainer('ready', {});

/* debug/test hook (harmless in production) */
window.__tanker = { scene, state, shellMat, ctrl, rig, trailer, api: window.tankerAPI, runAction: runAction };
})();
