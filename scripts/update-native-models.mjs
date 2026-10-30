import { readFile, writeFile, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Refresh reviewed models from the public catalog; new protocols remain review candidates. */
const path = new URL('../src/native-models.json', import.meta.url);
const current = JSON.parse(await readFile(path, 'utf8'));
const response = await fetch('https://openrouter.ai/api/v1/models?output_modalities=decisions', { signal: AbortSignal.timeout(30000) });
if (!response.ok) throw new Error(`Model catalog HTTP ${response.status}`);
const { data } = await response.json();
if (!Array.isArray(data) || data.some(row => typeof row.id !== 'string' || typeof row.name !== 'string')) throw new Error('Invalid model catalog');
const byId = new Map(data.map(row => [row.id, row]));
const known = new Set(current.map(row => row.model));
const special = JSON.parse(await readFile(new URL('../docs/native-model-exceptions.json', import.meta.url), 'utf8'));
const exceptions = new Set(special.map(row => row.model));
const updated = current.map(row => {
  const remote = byId.get(row.model);
  return remote ? { ...row, name: remote.name } : row;
});
console.log(JSON.stringify({ catalogEntries: data.length, reviewed: current.length,
  missing: current.filter(row => !byId.has(row.model)).map(row => row.model),
  reviewCandidates: data.filter(row => !known.has(row.id) && !exceptions.has(row.id)).map(row => ({ model: row.id, name: row.name })),
  exceptions: special.map(row => ({ model: row.model, protocol: row.protocol })),
}, null, 2));
if (process.argv.includes('--write')) {
  const backup = join(tmpdir(), `dsh-native-models-${Date.now()}.json`);
  await copyFile(path, backup);
  const serialized = `${JSON.stringify(updated, null, 2)}\n`;
  await writeFile(path, serialized);
  if (await readFile(path, 'utf8') !== serialized) throw new Error(`Catalog verification failed; backup: ${backup}`);
  console.log(`Updated names; backup: ${backup}`);
}
