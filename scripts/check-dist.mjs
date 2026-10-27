import { readFile, access } from 'node:fs/promises';
import { resolve, sep } from 'node:path';

const output = resolve('dist');
const html = await readFile(resolve(output, 'index.html'), 'utf8');
const references = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
  .map(match => match[1])
  .filter(url => !url.startsWith('data:'));
if (!references.length) throw new Error('dist/index.html does not reference any assets');
for (const reference of references) {
  if (!reference.startsWith('./')) {
    throw new Error(`Built assets must use relative paths: ${reference}`);
  }
  const assetPath = resolve(output, reference.split(/[?#]/)[0]);
  if (!assetPath.startsWith(output + sep)) throw new Error(`Asset escapes dist: ${reference}`);
  await access(assetPath);
}
console.log(`dist/index.html exists; ${references.length} relative asset references verified.`);
