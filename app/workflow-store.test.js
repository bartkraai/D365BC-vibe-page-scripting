'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { validateWorkflow, validateCatalog, WorkflowStore } = require('./workflow-store');

test('workflow validation and rename update catalog', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-')), workflows = path.join(root, 'workflows'), catalog = path.join(root, 'catalog.json');
  fs.mkdirSync(path.join(workflows, 'Old'), { recursive: true });
  fs.writeFileSync(path.join(workflows, 'Old', 'workflow.json'), '{"steps":[]}');
  fs.writeFileSync(catalog, '{"types":[{"name":"Type","code":"TYPE","value_chains":[{"name":"Chain","code":"CHAIN","process_flows":[{"name":"Flow","code":"FLOW","workflow_path":"./Old"}]}]}]}');
  const library = { script: id => { if (id !== 's-a') throw new Error('missing'); } };
  try {
    assert.throws(() => validateWorkflow({ steps: [{ id: 'x', user: 'u', scriptIds: ['missing'] }] }, library), /unknown/);
    assert.throws(() => validateWorkflow({ steps: [{ id: 'x', user: 'u', scriptIds: ['s-a'], depends_on: 'none' }] }, library), /depends/);
    validateWorkflow({ steps: [{ id: 'x', user: 'u', scriptIds: ['s-a'] }] }, library);
    validateCatalog(JSON.parse(fs.readFileSync(catalog)), workflows);
    new WorkflowStore(workflows, catalog).renameWorkflow('Old', 'New');
    assert.equal(JSON.parse(fs.readFileSync(catalog)).types[0].value_chains[0].process_flows[0].workflow_path, './New');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('current catalog accepts punctuation in non-empty codes', () => {
  const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'page-scripting', 'catalog.json'), 'utf8'));
  assert.doesNotThrow(() => validateCatalog(catalog, path.join(__dirname, '..', 'page-scripting', 'workflows')));
});
