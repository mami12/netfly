const fs = require('fs');
const path = require('path');

const clientDir = path.join(__dirname, 'client');
const srcDir = path.join(clientDir, 'src');

const dirs = [
  clientDir,
  srcDir,
  path.join(srcDir, 'types'),
  path.join(srcDir, 'i18n'),
  path.join(srcDir, 'context'),
  path.join(srcDir, 'api'),
  path.join(srcDir, 'pages'),
  path.join(srcDir, 'components'),
  path.join(srcDir, 'components', 'Layout'),
  path.join(srcDir, 'components', 'Sports'),
  path.join(srcDir, 'components', 'Betslip'),
  path.join(srcDir, 'components', 'Tracker'),
  path.join(srcDir, 'components', 'Admin'),
];

dirs.forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

console.log("Directories created.");
