# RVKKO Games & Engineering

[Play the collection](https://rvkko.github.io/Game-dev/) · [Empire hub](https://rvkko.github.io/Game-dev/hub/) · [Tanker training](https://rvkko.github.io/Game-dev/games/pilot-fuel-tanker-training/)

104 catalog entries gathered from the original Game-dev projects, Gaming Empire, Heartwood Caravan, and the independent Voxhaven edition. The catalog separates active games, prototypes, and retired archives. **Imported does not mean finished or fully playtested.**

## Organization

- `docs/` — hosted collection, searchable catalog, game hub and separate QA / future Identity & Security portfolio sections.
- `docs/classics/` — playable browser successors to the four Python games: Galactic Shooter, Color Clash, Tic-Tac-Toe and Number Hunt.
- `docs/games/` — 91-game Empire collection, including editable tanker sources and its generated standalone edition.
- `docs/heartwood/` and `sources/heartwood-caravan/` — playable Heartwood build and editable project.
- `docs/prototypes/` — independent earlier Voxhaven edition.
- `sources/retired/` — six retired projects preserved without claiming completion.
- `python/` — historical originals. Python UNO still requires its missing card assets; use the complete Color Clash browser edition instead.
- `tests/`, `scripts/` — deterministic regression checks and browser smoke tests.

## Play locally

Install Node.js 22 or newer, then double-click `PLAY GAMES.cmd`, or run:

```sh
npm ci
npm start
```

Open http://127.0.0.1:4180. For large 3D games use a desktop browser with WebGL. Saves stay in browser storage. Existing local-app saves are not automatically migrated; use the Empire hub's export/import controls when available.

## Verify

```sh
npm test
npm run verify
npm run audit
node scripts/verify-assets.cjs
npx playwright install chromium
node scripts/smoke.cjs
node scripts/smoke.cjs --catalog
```

Focused tests cover the classic rules and tanker regressions. The catalog sweep checks page loading/errors/resources, not complete gameplay. `CURRENT_STATUS.md` records actual coverage and remaining work.

The tanker is an educational prototype, not official Pilot/DOT/hazmat instruction. Minecraft/WeeklyCraft inspiration folders and installed commercial games are excluded from the authored collection.
