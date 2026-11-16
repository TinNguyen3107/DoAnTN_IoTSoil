import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const baseline = JSON.parse(await fs.readFile(path.join(root, 'backend-baseline.json'), 'utf8'));
const entries = Array.isArray(baseline) ? baseline : baseline.files || [];

let changed = 0;
let missing = 0;

for (const entry of entries) {
  const file = entry.path;
  let hash = null;
  try {
    hash = crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
  } catch {
    missing += 1;
    console.log('MISSING ' + file);
    continue;
  }
  if (hash !== (entry.sha256 || entry.hash)) {
    changed += 1;
    console.log('CHANGED ' + file);
  }
}

console.log(`checked=${entries.length} changed=${changed} missing=${missing}`);
