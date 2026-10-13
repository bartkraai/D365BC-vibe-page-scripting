'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { ScriptLibrary, LibraryError } = require('./script-library');

test('script library enforces names, cycles, versions, usage and latest content', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'library-')), workflows = path.join(root, 'workflows');
  fs.mkdirSync(workflows);
  const library = new ScriptLibrary(path.join(root, 'library'), workflows);
  try {
    const folder = library.createFolder({ name: 'Root' });
    assert.throws(() => library.createFolder({ name: 'root' }), LibraryError);
    const child = library.createFolder({ name: 'Child', parentId: folder.id });
    assert.throws(() => library.updateFolder(folder.id, { parentId: child.id }), /cycle/);
    const script = library.createScript({ name: 'Test', folderId: folder.id, fileName: 'test.yml', content: 'name: test' });
    assert.equal(library.addVersion(script.id, { fileName: 'copy.yml', content: 'name: test' }).unchanged, true);
    assert.equal(library.addVersion(script.id, { fileName: 'next.yml', content: 'name: next' }).version, 2);
    assert.equal(library.content(script.id, 'latest').content, 'name: next');
    fs.mkdirSync(path.join(workflows, 'one'));
    fs.writeFileSync(path.join(workflows, 'one', 'workflow.json'), JSON.stringify({ steps: [{ id: 'a', scriptIds: [script.id] }] }));
    assert.throws(() => library.deleteScript(script.id), error => error.status === 409 && error.usage.length === 1);
    assert.throws(() => library.deleteFolder(folder.id), /not empty/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
