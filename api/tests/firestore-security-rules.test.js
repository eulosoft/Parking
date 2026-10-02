import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

test('Firestore client rules explicitly deny every read and write', async () => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const rules = await readFile(path.join(root, 'firestore.rules'), 'utf8');
  assert.match(rules, /match\s+\/\{document=\*\*\}/);
  assert.match(rules, /allow\s+read,\s*write:\s*if\s+false\s*;/);
});
