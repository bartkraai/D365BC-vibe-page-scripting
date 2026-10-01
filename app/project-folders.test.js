'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { duplicateProjectFolder, safeProjectName } = require('./project-folders');

test('duplicateProjectFolder copies the complete project into a unique sibling folder', () => {
  const projectsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bc-project-folders-'));
  const sourceDir = path.join(projectsRoot, 'Approval Flow');
  fs.mkdirSync(path.join(sourceDir, 'scripts'), { recursive: true });
  fs.writeFileSync(path.join(sourceDir, 'workflow.json'), '{"name":"Approval","catalog":{"process_flow":"OLD"}}');
  fs.writeFileSync(path.join(sourceDir, 'scripts', 'approve.yml'), 'name: Approve');
  fs.mkdirSync(path.join(projectsRoot, 'Approval Flow (Copy)'));

  try {
    const result = duplicateProjectFolder(projectsRoot, 'Approval Flow', {
      name: 'Approval (Copy)',
      catalog: { type: 'PRJ', value_chain: 'VC', process_flow: 'PF-COPY' },
    });

    assert.equal(result.targetName, 'Approval Flow (Copy 2)');
    assert.deepEqual(
      JSON.parse(fs.readFileSync(path.join(result.targetDir, 'workflow.json'), 'utf8')),
      {
        name: 'Approval (Copy)',
        catalog: { type: 'PRJ', value_chain: 'VC', process_flow: 'PF-COPY' },
      },
    );
    assert.equal(fs.readFileSync(path.join(result.targetDir, 'scripts', 'approve.yml'), 'utf8'), 'name: Approve');
  } finally {
    fs.rmSync(projectsRoot, { recursive: true, force: true });
  }
});

test('duplicateProjectFolder rejects missing and unsafe project names', () => {
  const projectsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bc-project-folders-'));

  try {
    assert.throws(() => duplicateProjectFolder(projectsRoot, 'Missing'), /was not found/);
    assert.throws(() => duplicateProjectFolder(projectsRoot, '../Outside'), /Invalid project name/);
    assert.throws(() => safeProjectName('Invalid/Name'), /Invalid project name/);
  } finally {
    fs.rmSync(projectsRoot, { recursive: true, force: true });
  }
});

test('duplicateProjectFolder removes a partial copy when workflow metadata is invalid', () => {
  const projectsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bc-project-folders-'));
  const sourceDir = path.join(projectsRoot, 'Invalid Workflow');
  fs.mkdirSync(sourceDir);
  fs.writeFileSync(path.join(sourceDir, 'workflow.json'), '{invalid');

  try {
    assert.throws(
      () => duplicateProjectFolder(projectsRoot, 'Invalid Workflow', { name: 'Copy' }),
      /JSON/,
    );
    assert.equal(fs.existsSync(path.join(projectsRoot, 'Invalid Workflow (Copy)')), false);
  } finally {
    fs.rmSync(projectsRoot, { recursive: true, force: true });
  }
});
