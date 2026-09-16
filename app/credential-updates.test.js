'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { syncOptionalCredential } = require('./credential-updates');

test('syncOptionalCredential saves a non-empty credential', async () => {
  const calls = [];

  const hasCredential = await syncOptionalCredential(
    'environment:role:mfa',
    '  MFA-SEED  ',
    async (account, value) => calls.push(['save', account, value]),
    async account => calls.push(['delete', account]),
  );

  assert.equal(hasCredential, true);
  assert.deepEqual(calls, [['save', 'environment:role:mfa', 'MFA-SEED']]);
});

for (const [label, value] of [['empty', ''], ['whitespace', '   '], ['missing', undefined]]) {
  test(`syncOptionalCredential deletes an ${label} credential`, async () => {
    const calls = [];

    const hasCredential = await syncOptionalCredential(
      'environment:role:mfa',
      value,
      async (account, credential) => calls.push(['save', account, credential]),
      async account => calls.push(['delete', account]),
    );

    assert.equal(hasCredential, false);
    assert.deepEqual(calls, [['delete', 'environment:role:mfa']]);
  });
}