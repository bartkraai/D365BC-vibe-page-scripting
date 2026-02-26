/**
 * capture.config.js
 *
 * Playwright configuration for the BC token capture test.
 * Only picks up capture-token.spec.js — does NOT interfere with the main
 * bc-replay player (player.spec.js / npx-run.ps1).
 *
 * Usage:
 *   npx playwright test --config=capture.config.js
 *   npx playwright test --config=capture.config.js --headed
 */

const { defineConfig, devices } = require('@playwright/test');

const headed = process.env.HEADED === '1' || process.argv.includes('--headed');

module.exports = defineConfig({
    testDir  : '.',
    testMatch: ['capture-token.spec.js'],

    timeout : 180_000,           // 3 min – allow time for BC load + MFA
    retries : 0,                  // no retries – failure output is diagnostic
    workers : 1,                  // single worker – one login at a time

    reporter: [
        ['line'],
        ['html', { open: 'never', outputFolder: './capture-report' }],
    ],

    use: {
        headless : !headed,
        viewport : { width: 1280, height: 720 },
        video    : 'on',
        trace    : 'on-first-retry',
    },

    projects: [
        {
            name: 'chromium',
            use : { ...devices['Desktop Chrome'] },
        },
    ],
});
