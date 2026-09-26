const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
try {
  const root = __dirname;
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'bundle-manifest.json'), 'utf8'));
  for (const [name, expected] of Object.entries(manifest.files)) {
    const full = path.resolve(root, name);
    if (!full.startsWith(root + path.sep)) throw new Error('Invalid manifest path');
    if (!fs.existsSync(full)) throw new Error('Missing file: ' + name);
    const actual = crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex');
    if (actual !== expected) throw new Error('Damaged file: ' + name + '. Please reinstall Camera Watch.');
  }
  if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('Bundled Node runtime is too old');
  console.log(JSON.stringify({ ok: true, version: manifest.version, files: Object.keys(manifest.files).length }));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
