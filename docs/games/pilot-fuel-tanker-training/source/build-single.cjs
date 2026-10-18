/* Build a single self-contained HTML file (no server, no external files).
   Inlines: training.css/js/data + the 3D explorer (its CSS/JS + three.min.js)
   embedded as an iframe srcdoc. Run: node build-single.cjs */
const fs = require('fs');
const path = require('path');
const root = __dirname;
const R = (f) => fs.readFileSync(path.join(root, f), 'utf8');

/* ---- 1. build the self-contained explorer document (goes into iframe srcdoc) ---- */
let explorerDoc = R('fuel-tanker-explorer.html')
  .replace('<link rel="stylesheet" href="fuelTankerExplorer.css">', () => '<style>\n' + R('fuelTankerExplorer.css') + '\n</style>')
  .replace('<script src="vendor/three.min.js"></script>', () => '<script>\n' + R('vendor/three.min.js') + '\n</script>')
  .replace('<script src="fuelTankerExplorer.js"></script>', () => '<script>\n' + R('fuelTankerExplorer.js') + '\n</script>');

/* JS string literal that won't prematurely close the outer <script> */
const srcdocLiteral = JSON.stringify(explorerDoc).replace(/<\/script>/gi, '<\\/script>');

/* ---- 2. inline the shell (index.html + training.css/data/js) ---- */
let out = R('index.html')
  .replace('<link rel="stylesheet" href="training.css">', () => '<style>\n' + R('training.css') + '\n</style>')
  .replace('<script src="training-data.js"></script>', () =>
    '<script>\n' + R('training-data.js') + '\n</script>\n' +
    '<script>window.EXPLORER_SRCDOC=' + srcdocLiteral + ';</script>')
  .replace('<script src="training.js"></script>', () => '<script>\n' + R('training.js') + '\n</script>');

/* tiny banner comment */
out = out.replace('../../../shared/empire-sdk.js', '../../shared/empire-sdk.js');

out = '<!-- Pilot Fuel Tanker Training Prototype — single-file build. Double-click to run; no server needed.\n' +
      '     Educational prototype only. Not official Pilot/DOT/FMCSA/PHMSA/hazmat training. -->\n' + out;

const target = path.join(root, 'TankerTraining.html');
fs.writeFileSync(target, out, 'utf8');
console.log('Wrote ' + target);
console.log('Size: ' + (Buffer.byteLength(out) / 1024 / 1024).toFixed(2) + ' MB');
