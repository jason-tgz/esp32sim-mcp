// Copies package.json's version into the other manifests that carry it.
// Runs from the npm `version` lifecycle, so `npm version x.y.z` keeps them in step.
import { readFileSync, writeFileSync } from 'fs';

const { version } = JSON.parse(readFileSync('package.json', 'utf-8'));

function update(file, apply) {
  const json = JSON.parse(readFileSync(file, 'utf-8'));
  apply(json);
  writeFileSync(file, JSON.stringify(json, null, 2) + '\n');
}

update('server.json', (s) => {
  s.version = version;
  for (const p of s.packages) p.version = version;
});
update('.claude-plugin/plugin.json', (p) => {
  p.version = version;
});
