'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { mergeActionOutcomes, readActionOutcomes } = require('./action-outcomes');

test('mergeActionOutcomes reports passed, failed, and not-recorded actions', () => {
  const outcomes = mergeActionOutcomes(
    {
      name: 'Approval actions',
      steps: [
        { type: 'invoke', description: 'Open settings' },
        { type: 'input', description: 'Enter document number', value: 'PO-100' },
        { type: 'invoke', description: 'Submit approval' },
      ],
    },
    {
      steps: [
        { type: 'invoke', log: { start: '2026-09-22T10:00:00Z', duration: 48 } },
        { type: 'input', log: { start: '2026-09-22T10:00:01Z', duration: 12, error: { message: 'Field is not editable.' } } },
        { type: 'invoke' },
      ],
    },
  );

  assert.equal(outcomes.name, 'Approval actions');
  assert.deepEqual(outcomes.steps.map(step => step.status), ['passed', 'failed', 'not-recorded']);
  assert.equal(outcomes.steps[1].error_message, 'Field is not editable.');
  assert.equal(outcomes.steps[1].value, 'PO-100');
  assert.equal(outcomes.steps[2].duration_ms, null);
});

test('mergeActionOutcomes accepts logs with no definition and preserves log metadata', () => {
  const outcomes = mergeActionOutcomes(null, {
    telemetryId: 'telemetry-1',
    steps: [{ type: 'page-shown', description: 'Page displayed', log: { start: '2026-09-22T10:00:00Z' } }],
  });

  assert.equal(outcomes.telemetryId, 'telemetry-1');
  assert.deepEqual(outcomes.steps[0], {
    index: 1,
    type: 'page-shown',
    description: 'Page displayed',
    target: null,
    value: null,
    start: '2026-09-22T10:00:00Z',
    duration_ms: null,
    status: 'passed',
    error_message: null,
  });
});

test('readActionOutcomes detects an execution log when its first action was not recorded', () => {
  const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bc-action-outcomes-'));
  const dataDir = path.join(reportDir, 'playwright-report', 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'definition.yml'), `name: Test\nsteps:\n  - type: invoke\n    description: First action\n  - type: input\n    description: Second action\n`);
  fs.writeFileSync(path.join(dataDir, 'execution.yml'), `steps:\n  - type: invoke\n  - type: input\n    log:\n      start: 2026-09-22T10:00:00Z\n      duration: 10\n`);

  try {
    const outcomes = readActionOutcomes(reportDir);
    assert.deepEqual(outcomes.steps.map(step => step.status), ['not-recorded', 'passed']);
  } finally {
    fs.rmSync(reportDir, { recursive: true, force: true });
  }
});
