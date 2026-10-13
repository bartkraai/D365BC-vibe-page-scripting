'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createPaths } = require('./paths');
const { writeJsonAtomic, readJson } = require('./json-store');
test('paths reject traversal and json writes atomically', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paths-')); fs.mkdirSync(path.join(root, 'page-scripting', 'workflows'), { recursive: true });
  try {
    const paths = createPaths(root);
    assert.throws(() => paths.resolveWorkflowDir('../escape'));
    const file = path.join(root, 'data.json'); writeJsonAtomic(file, { ok: true });
    assert.deepEqual(readJson(file), { ok: true });
    assert.equal(fs.readdirSync(root).some(name => name.endsWith('.tmp')), false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
