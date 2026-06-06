
const fs = require('fs');
const path = require('path');
const DATA = path.join(__dirname, '..', 'data');
const OUT = path.join(__dirname, '..', 'backup-' + new Date().toISOString().slice(0,10));
fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync(DATA)) {
  if (f.endsWith('.json')) fs.copyFileSync(path.join(DATA, f), path.join(OUT, f));
}
console.log('Backup criado em:', OUT);
