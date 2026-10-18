# Game collection status — 2026-10-18

- Public site: `docs/`; local play: `npm start`, http://127.0.0.1:4180.
- Catalog: 104 entries — 96 active entries, original Voxhaven prototype, Astral archive, six retired archives. Empire retains its existing 91-game registry and save formats.
- Four browser classics in `docs/classics/`; original Python projects preserved in `python/`. Browser editions use original procedural graphics, not the legacy music/art.
- Tanker low-FPS regression: animation uses wall time; physics retains its bounded step.
- Tanker: editable sources under `docs/games/pilot-fuel-tanker-training/source/`; rebuild with `node .../build-single.cjs`, then copy `TankerTraining.html` to the parent `index.html`.
- Heartwood: published build in `docs/heartwood/`; editable source and six simulation tests in `sources/heartwood-caravan/`.
- Imports/provenance: `sources/import-inventory.json`. Original PC projects were not relocated or deleted.
- Checks: `npm test` (19), `npm run verify`, `npm run audit`, `node scripts/verify-assets.cjs`; browser checks `node scripts/smoke.cjs` and `node scripts/smoke.cjs --catalog`. Install a browser with `npx playwright install chromium`; to use installed Chrome set `BROWSER_CHANNEL=chrome`.
- Verified 97 runnable import/classic/prototype pages loaded without page errors or missing local resources. Astral's missing main source is archived explicitly. Six retired projects are preserved, not certified playable.
- Remaining: detailed start-to-finish gameplay, progression, save/restart and mobile audits across the imported Empire games. Loading/static checks do not establish polished completion.
- Next coherent milestone: select one genre batch, reproduce real gameplay issues, fix and recheck critical paths before marking those games finished.
