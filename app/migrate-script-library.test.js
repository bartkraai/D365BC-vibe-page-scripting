'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildMigrationPlan, migrate } = require('./migrate-script-library');

function writeJson(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value, null, 2)); }

test('migration moves workflows, rewrites refs, deduplicates scripts, preserves backup', () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'script-library-project-'));
  const backupRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'script-library-backup-'));
  const pageScripting = path.join(project, 'page-scripting');
  const content = 'name: Recorded script\nsteps: []\n';
  try {
    for (const name of ['Source', 'Consumer']) {
      fs.mkdirSync(path.join(pageScripting, name, 'scripts'), { recursive: true });
      writeJson(path.join(pageScripting, name, 'workflow.json'), {
        name,
        steps: [{ id: 'step-1', name: 'Record', user: 'Tester', script: './scripts/Recorded.yml' }],
      });
    }
    fs.writeFileSync(path.join(pageScripting, 'Source', 'scripts', 'Recorded.yml'), content);
    writeJson(path.join(pageScripting, 'catalog.json'), { types: [] });
    fs.mkdirSync(path.join(pageScripting, 'workflows', 'Already migrated'), { recursive: true });
    writeJson(path.join(pageScripting, 'workflows', 'Already migrated', 'workflow.json'), { steps: [] });
    fs.writeFileSync(path.join(pageScripting, 'workflows', 'Already migrated', 'preserved.txt'), 'keep');

    const plan = buildMigrationPlan(pageScripting);
    assert.equal(plan.workflows.length, 2);
    assert.equal(plan.sources.length, 1);
    assert.equal(plan.refFallbacks.length, 1);

    const backupDir = path.join(backupRoot, 'backup');
    const result = migrate(pageScripting, backupDir);
    assert.equal(result.workflowCount, 3);
    assert.equal(result.importedCount, 1);
    assert.equal(result.reusedCount, 0);
    assert.equal(fs.existsSync(path.join(pageScripting, 'Source')), false);
    assert.equal(fs.existsSync(path.join(backupDir, 'legacy-workflows', 'Source', 'scripts', 'Recorded.yml')), true);
    assert.equal(fs.readFileSync(path.join(pageScripting, 'workflows', 'Already migrated', 'preserved.txt'), 'utf8'), 'keep');
    assert.equal(fs.existsSync(path.join(backupDir, 'existing-workflows', 'Already migrated', 'workflow.json')), true);

    const sourceWorkflow = JSON.parse(fs.readFileSync(path.join(pageScripting, 'workflows', 'Source', 'workflow.json'), 'utf8'));
    const consumerWorkflow = JSON.parse(fs.readFileSync(path.join(pageScripting, 'workflows', 'Consumer', 'workflow.json'), 'utf8'));
    assert.deepEqual(sourceWorkflow.steps[0].scriptIds, consumerWorkflow.steps[0].scriptIds);
    assert.equal('script' in sourceWorkflow.steps[0], false);
    assert.equal('scripts' in sourceWorkflow.steps[0], false);
    const index = JSON.parse(fs.readFileSync(path.join(pageScripting, 'script-library', 'library.json'), 'utf8'));
    assert.equal(index.scripts.length, 1);
    assert.equal(fs.readFileSync(path.join(pageScripting, 'script-library', 'scripts', index.scripts[0].id, 'v1.yml'), 'utf8'), content);
    assert.equal(fs.existsSync(path.join(pageScripting, 'workflows', 'Source', 'scripts')), false);
  } finally {
    fs.rmSync(project, { recursive: true, force: true });
    fs.rmSync(backupRoot, { recursive: true, force: true });
  }
});

test('migration rejects ambiguous missing script names without a canonical source', () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'script-library-ambiguous-'));
  const pageScripting = path.join(project, 'page-scripting');
  try {
    for (const [name, content] of [['A', 'name: A\n'], ['B', 'name: B\n']]) {
      fs.mkdirSync(path.join(pageScripting, name, 'scripts'), { recursive: true });
      fs.writeFileSync(path.join(pageScripting, name, 'scripts', 'Common.yml'), content);
      writeJson(path.join(pageScripting, name, 'workflow.json'), { steps: [{ id: 'step-1', user: 'Tester', script: './scripts/Common.yml' }] });
    }
    fs.mkdirSync(path.join(pageScripting, 'Missing'), { recursive: true });
    writeJson(path.join(pageScripting, 'Missing', 'workflow.json'), {
      steps: [{ id: 'step-1', user: 'Tester', script: './scripts/Common.yml' }],
    });
    writeJson(path.join(pageScripting, 'catalog.json'), { types: [] });
    assert.throws(() => buildMigrationPlan(pageScripting), /Ambiguous script reference/);
  } finally {
    fs.rmSync(project, { recursive: true, force: true });
  }
});