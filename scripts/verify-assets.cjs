const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../docs');
const gamesDir = path.join(root, 'games');
const assetsDir = path.join(root, 'assets');
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const exists = (file) => fs.existsSync(file);
const failures = [];

const registry = readJson(path.join(gamesDir, 'registry.json'));
const assetManifest = readJson(path.join(gamesDir, 'asset-manifest.json'));
const curation = readJson(path.join(gamesDir, 'curation-manifest.json'));
const systems = readJson(path.join(gamesDir, 'gameplay-systems-manifest.json'));
const profiles = readJson(path.join(gamesDir, 'game-asset-profiles.json'));
const kitIndex = readJson(path.join(assetsDir, 'gameplay-kits', 'index.json'));
const titleIndex = readJson(path.join(assetsDir, 'catalog-title-cards', 'index.json'));
const blenderIndex = readJson(path.join(assetsDir, 'blender-kits', 'index.json'));

if (assetManifest.totalGames !== registry.games.length) failures.push('asset manifest game count does not match registry');
if (curation.totalGames !== registry.games.length) failures.push('curation manifest game count does not match registry');
if (systems.totalGames !== registry.games.length) failures.push('gameplay systems manifest game count does not match registry');
if (profiles.totalGames !== registry.games.length) failures.push('game asset profiles count does not match registry');
if (kitIndex.totalGames !== registry.games.length) failures.push('gameplay kit index game count does not match registry');
if (kitIndex.totalAssets !== registry.games.length * 5) failures.push('gameplay kit asset count is not five per game');
if (titleIndex.totalAssets !== registry.games.length) failures.push('title-card count does not match registry');
if (blenderIndex.totalGames !== registry.games.length) failures.push('Blender kit count does not match registry');

const assetById = new Map(assetManifest.entries.map((entry) => [entry.id, entry]));
const curationById = new Map(curation.entries.map((entry) => [entry.id, entry]));
const systemsById = new Map(systems.entries.map((entry) => [entry.id, entry]));
const profilesById = new Map(profiles.entries.map((entry) => [entry.id, entry]));
const kitById = new Map(kitIndex.assets.map((entry) => [entry.game, entry]));
const blenderById = new Map(blenderIndex.kits.map((entry) => [entry.id, entry]));

for (const id of registry.games) {
  const gameDir = path.join(gamesDir, id);
  const manifestFile = path.join(gameDir, 'manifest.json');
  if (!exists(manifestFile)) failures.push(`${id}: missing manifest`);
  const manifest = exists(manifestFile) ? readJson(manifestFile) : {};
  const asset = assetById.get(id);
  const curate = curationById.get(id);
  if (!asset) failures.push(`${id}: missing asset-manifest entry`);
  if (!curate) failures.push(`${id}: missing curation entry`);
  if (!systemsById.has(id)) failures.push(`${id}: missing gameplay systems entry`);
  const profile = profilesById.get(id);
  if (!profile) failures.push(`${id}: missing game asset profile`);
  else {
    for (const field of ['archetype', 'gameplayVerb', 'playerPrimitive', 'obstaclePrimitive', 'environmentSet', 'cameraMode', 'physicsShape']) {
      if (!profile[field]) failures.push(`${id}: asset profile missing ${field}`);
    }
  }
  if (!asset || asset.kitAssets !== 5) failures.push(`${id}: kitAssets is not 5`);
  if (!curate || !Array.isArray(curate.focusAreas) || curate.focusAreas.length < 3) failures.push(`${id}: curation focus is incomplete`);
  if (!curate || !curate.gameplayVerb || !curate.cameraMode || !curate.physicsShape || !Array.isArray(curate.animationStates) || !Array.isArray(curate.audioCues)) failures.push(`${id}: curation gameplay profile is incomplete`);
  if (asset?.runtime3dStatus === 'integrated-3d-runtime' && (!asset.runtimeEntry || !exists(path.join(root, asset.runtimeEntry)))) failures.push(`${id}: integrated 3D runtime entry missing`);
  if (!manifest.entry || !exists(path.join(root, manifest.entry))) failures.push(`${id}: launch entry missing`);
  if (!manifest.thumbnail || !exists(path.join(gameDir, manifest.thumbnail))) failures.push(`${id}: thumbnail missing`);

  const kitDir = path.join(assetsDir, 'gameplay-kits', id);
  for (const kind of ['player', 'obstacle', 'environment', 'effect', 'ui']) {
    const file = path.join(kitDir, `${kind}.svg`);
    if (!exists(file)) failures.push(`${id}: missing ${kind} kit asset`);
    else if (!fs.readFileSync(file, 'utf8').includes('<svg')) failures.push(`${id}: invalid ${kind} SVG`);
  }
  if (!kitById.has(id)) failures.push(`${id}: missing kit index entry`);
  const blenderKit = blenderById.get(id);
  if (!blenderKit) failures.push(`${id}: missing Blender kit entry`);
  else {
    if (!exists(path.join(root, blenderKit.glb))) failures.push(`${id}: missing Blender GLB`);
    if (!blenderKit.physics || !exists(path.join(root, blenderKit.physics))) failures.push(`${id}: missing Blender physics metadata`);
  }
  if (!exists(path.join(assetsDir, 'catalog-title-cards', `${id}.svg`))) failures.push(`${id}: title card missing`);
}

const result = {
  registered: registry.games.length,
  gameplayAssets: kitIndex.totalAssets,
  titleCards: titleIndex.totalAssets,
  failures,
  passed: failures.length === 0,
};
console.log(JSON.stringify(result, null, 2));
if (failures.length) process.exitCode = 1;
