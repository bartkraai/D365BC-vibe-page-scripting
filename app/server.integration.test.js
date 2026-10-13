'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

test('library and workflow HTTP contract', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'server-library-'));
  const pageScripting = path.join(root, 'page-scripting');
  fs.mkdirSync(path.join(pageScripting, 'workflows'), { recursive: true });
  fs.writeFileSync(path.join(pageScripting, 'catalog.json'), JSON.stringify({
    types: [{ code: 'T', name: 'Type', value_chains: [{ code: 'C', name: 'Chain', process_flows: [{ code: 'F', name: 'Flow', workflow_path: './Flow' }] }] }],
  }));
  const previousPageScripting = process.env.PAGE_SCRIPTING;
  const previousWatcher = process.env.DISABLE_FILE_WATCHER;
  process.env.PAGE_SCRIPTING = pageScripting;
  process.env.DISABLE_FILE_WATCHER = '1';
  for (const modulePath of ['./server', './paths']) delete require.cache[require.resolve(modulePath)];
  const { server } = require('./server');
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const request = async (url, options) => {
    const response = await fetch(origin + url, options);
    return { status: response.status, body: response.status === 204 ? null : await response.json() };
  };

  try {
    let result = await request('/api/library/folders', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Folder', parentId: null }) });
    assert.equal(result.status, 201);
    result = await request('/api/library/scripts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Script', folderId: result.body.id, fileName: 'script.yml', content: 'name: test' }) });
    assert.equal(result.status, 201);
    const scriptId = result.body.id;
    result = await request(`/api/library/scripts/${scriptId}/versions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ fileName: 'same.yml', content: 'name: test' }) });
    assert.deepEqual(result.body.unchanged, true);
    result = await request('/api/library');
    assert.equal(typeof result.body.scripts[0].latestVersion, 'number');
    assert.equal(typeof result.body.scripts[0].latestVersionDate, 'string');
    result = await request('/api/projects/scaffold', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ projectName: 'Flow', workflow: { steps: [{ id: 'step', name: 'Step', user: 'user', scriptIds: [scriptId] }] } }) });
    assert.equal(result.status, 200);
    result = await request(`/api/library/scripts/${scriptId}/usage`);
    assert.deepEqual(result.body, [{ workflow: 'Flow', steps: [{ id: 'step', name: 'Step' }] }]);
    result = await request(`/api/library/scripts/${scriptId}`, { method: 'DELETE' });
    assert.equal(result.status, 409);
    assert.equal(result.body.usage[0].workflow, 'Flow');
    result = await request('/api/projects/Flow', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ newName: 'Renamed' }) });
    assert.deepEqual(result.body, { oldName: 'Flow', newName: 'Renamed' });
    assert.equal(JSON.parse(fs.readFileSync(path.join(pageScripting, 'catalog.json'))).types[0].value_chains[0].process_flows[0].workflow_path, './Renamed');
    assert.equal((await request('/api/projects/bad%2Fname/workflow')).status, 400);
    assert.equal((await request('/api/not-a-route')).status, 404);
  } finally {
    await new Promise(resolve => server.close(resolve));
    if (previousPageScripting === undefined) delete process.env.PAGE_SCRIPTING; else process.env.PAGE_SCRIPTING = previousPageScripting;
    if (previousWatcher === undefined) delete process.env.DISABLE_FILE_WATCHER; else process.env.DISABLE_FILE_WATCHER = previousWatcher;
    fs.rmSync(root, { recursive: true, force: true });
  }
});
