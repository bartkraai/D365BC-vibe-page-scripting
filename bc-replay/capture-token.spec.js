/**
 * capture-token.spec.js
 *
 * Validates Option A: capture the Entra ID Bearer token that the BC web client
 * obtains during a Playwright browser session, then reuse it to call the BC
 * OData REST API directly — without registering a new Entra app.
 *
 * Strategy:
 *   - Custom login function that handles: email → password → KMSI → (TOTP if shown)
 *   - Network interception captures Authorization: Bearer headers on BC requests
 *   - Fallback: MSAL browser storage scan
 *   - Validate captured token against:
 *       Step A – GET api.businesscentral.dynamics.com  (standard BC API)
 *       Step B – GET 4psconstruct.api.bc.dynamics.com  (4PS custom API)
 *
 * Run:
 *   npx playwright test --config=capture.config.js
 *   (or use Run-CaptureToken.ps1 which loads credentials from users.json)
 */

'use strict';

const { test } = require('@playwright/test');
const { authenticator } = require('otplib');
const path     = require('path');
const fs       = require('fs');

// ── Load credentials from users.json ─────────────────────────────────────────
const usersPath = path.join(__dirname, '..', 'page-scripting', 'PO Approval Workflow', 'users.json');
const users     = JSON.parse(fs.readFileSync(usersPath, 'utf-8'));
const userRole  = process.env.BC_ROLE || 'purchaser';
const user      = users[userRole];

if (!user) throw new Error(`Role "${userRole}" not found in users.json`);

// ── BC environment constants ──────────────────────────────────────────────────
const BC_URL    = process.env.BC_URL || 'https://4psconstruct.bc.dynamics.com/34b93528-e939-4e0b-a370-e6b753ae2514/latestrelease';
const URL_PARTS = new URL(BC_URL);
const PATH_SEGS = URL_PARTS.pathname.replace(/^\//, '').split('/');
const TENANT_ID = PATH_SEGS[0];
const ENV_NAME  = PATH_SEGS[1] || 'Production';

// ── Login helper ──────────────────────────────────────────────────────────────
// Handles the full Entra ID login flow including KMSI ("Stay signed in?") and
// optional TOTP MFA. Mirrors bc-replay's aadAuthenticate but with proper KMSI
// support for HTML <button> elements (Entra's current UI).
async function loginToBC(page) {
    const { username, password, mfa_seed } = user;
    const NAV_TIMEOUT = 90_000;

    console.log(`[LOGIN] Navigating to BC: ${BC_URL.substring(0, 70)}...`);
    await page.goto(BC_URL);

    // ── Email ─────────────────────────────────────────────────────────────────
    await page.waitForSelector('input[type="email"]', { timeout: 30_000 });
    await page.fill('input[type="email"]', username);
    await Promise.all([
        page.waitForNavigation({ timeout: NAV_TIMEOUT }),
        page.click('input[type="submit"]'),
    ]);
    console.log('[LOGIN] Email submitted');

    // ── Password ──────────────────────────────────────────────────────────────
    // bc-replay waits for tabIndex !== -1 before filling (ensures field is active)
    await page.waitForFunction(
        sel => { const el = document.querySelector(sel); return el && el.tabIndex !== -1; },
        'input[type="password"]',
        { timeout: 30_000 }
    );
    await page.fill('input[type="password"]', password);
    await Promise.all([
        page.waitForNavigation({ timeout: NAV_TIMEOUT }),
        page.click('input[type="submit"]'),
    ]);
    console.log('[LOGIN] Password submitted');

    // ── Post-password: handle whatever Entra shows next ───────────────────────
    await handleEntraPostPassword(page, mfa_seed, NAV_TIMEOUT);
    console.log('[LOGIN] Login complete, current URL:', page.url().substring(0, 80));
}

// Handles any Entra page that may appear after password:
//   - "Stay signed in?" (KMSI) page   → click "No"
//   - "Sign in another way" link       → click it, then pick TOTP option
//   - "Use verification code" option   → click it
//   - TOTP input already visible       → fill code
//   - Already on BC URL                → nothing to do
async function handleEntraPostPassword(page, mfaSeed, NAV_TIMEOUT, depth = 0) {
    if (depth > 3) { console.warn('[LOGIN] Max depth reached in handleEntraPostPassword'); return; }

    // Detect what's on screen (1 second per check, in parallel)
    const detect = async (selector) =>
        page.locator(selector).waitFor({ state: 'visible', timeout: 2_000 })
            .then(() => true).catch(() => false);

    const [onBC, isKMSI, isSignInAnother, isUseCode, isTOTP] = await Promise.all([
        // Already on BC?
        new Promise(resolve => {
            const h = page.url();
            const isBC = /^https:\/\/[^/]+(bc\.dynamics\.com|businesscentral\.dynamics\.com)/.test(h)
                      && !h.includes('login.microsoftonline.com');
            resolve(isBC);
        }),
        detect('#idBtn_Back, button:text("No")'),          // KMSI "No" button
        detect('#signInAnotherWay'),                        // "Sign in another way"
        detect('[data-value*="PhoneAppOTP"]'),              // "Use verification code"
        detect('input[name="otc"]'),                        // TOTP input
    ]);

    if (onBC) { console.log('[LOGIN] Already on BC'); return; }

    if (isKMSI) {
        console.log('[LOGIN] Handling KMSI "Stay signed in?" → clicking No');
        const noBtn = page.locator('#idBtn_Back').or(page.locator('button:text("No")'));
        await Promise.all([
            page.waitForNavigation({ timeout: NAV_TIMEOUT }).catch(() => {}),
            noBtn.first().click(),
        ]);
        await handleEntraPostPassword(page, mfaSeed, NAV_TIMEOUT, depth + 1);
        return;
    }

    if (isSignInAnother) {
        console.log('[LOGIN] Clicking "Sign in another way"');
        await Promise.all([
            page.waitForNavigation({ timeout: NAV_TIMEOUT }),
            page.click('#signInAnotherWay'),
        ]);
        await handleEntraPostPassword(page, mfaSeed, NAV_TIMEOUT, depth + 1);
        return;
    }

    if (isUseCode) {
        console.log('[LOGIN] Clicking "Use verification code"');
        await Promise.all([
            page.waitForNavigation({ timeout: NAV_TIMEOUT }),
            page.click('[data-value*="PhoneAppOTP"]'),
        ]);
        await handleEntraPostPassword(page, mfaSeed, NAV_TIMEOUT, depth + 1);
        return;
    }

    if (isTOTP) {
        if (!mfaSeed) throw new Error('[LOGIN] TOTP input visible but no MFA seed provided');
        const code = authenticator.generate(mfaSeed.toUpperCase());
        console.log(`[LOGIN] Filling TOTP code: ${code}`);
        await page.fill('input[name="otc"]', code);
        await Promise.all([
            page.waitForNavigation({ timeout: NAV_TIMEOUT }),
            page.click('input[type="submit"]'),
        ]);
        await handleEntraPostPassword(page, mfaSeed, NAV_TIMEOUT, depth + 1);
        return;
    }

    // Nothing matched – wait a moment and check URL
    await page.waitForTimeout(2_000);
    const nowOnBC = /^https:\/\/[^/]+(bc\.dynamics\.com|businesscentral\.dynamics\.com)/.test(page.url())
                 && !page.url().includes('login.microsoftonline.com');
    if (!nowOnBC) {
        console.warn('[LOGIN] Unrecognised Entra page at:', page.url());
        console.warn('[LOGIN] Page title:', await page.title());
    }
}

// ── Test ──────────────────────────────────────────────────────────────────────
test.setTimeout(180_000); // 3 minutes – login + BC page load can be slow

test('capture BC Bearer token and validate API access', async ({ page }) => {

    // ── 1. Network interception – must be set up BEFORE navigation ────────────
    const captured = { token: null, sourceUrl: null };

    page.on('request', request => {
        if (captured.token) return;  // only need first one
        const auth = request.headers()['authorization'];
        if (!auth?.startsWith('Bearer ')) return;
        const host = (() => { try { return new URL(request.url()).hostname; } catch { return ''; } })();
        if (host.endsWith('bc.dynamics.com') || host.endsWith('businesscentral.dynamics.com')) {
            captured.token    = auth.slice(7);
            captured.sourceUrl = request.url();
            console.log(`\n[TOKEN] Captured from network: ${request.url().substring(0, 90)}`);
        }
    });

    // ── 2. Login (handles email → password → KMSI → optional TOTP) ────────────
    console.log(`\nLogging in as: ${user.username}`);
    await loginToBC(page);
    console.log('[LOGIN] Done');

    // ── 3. If no token captured yet, trigger BC API calls via navigation ──────
    if (!captured.token) {
        console.log('[TOKEN] No network token yet — navigating to trigger BC API requests...');
        await page.goto(`${BC_URL}?page=22`);
        await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
    }

    // ── 4. Fallback: scan MSAL browser storage ────────────────────────────────
    if (!captured.token) {
        console.log('[TOKEN] Checking MSAL browser storage...');
        captured.token = await page.evaluate(() => {
            for (const store of [window.localStorage, window.sessionStorage]) {
                for (const key of Object.keys(store)) {
                    if (!key.includes('accesstoken')) continue;
                    try {
                        const item = JSON.parse(store[key]);
                        if (item?.secret && item?.realm) return item.secret;
                    } catch { /* skip */ }
                }
            }
            return null;
        });
        if (captured.token) console.log('[TOKEN] Found in MSAL storage');
    }

    // ── 5. Fail early with diagnostic info if no token ────────────────────────
    if (!captured.token) {
        const storageKeys = await page.evaluate(() =>
            Object.keys({ ...window.localStorage, ...window.sessionStorage })
                .filter(k => /access|login|token|msal/i.test(k))
        );
        console.error('[TOKEN] Not found. Relevant storage keys:', storageKeys);
        throw new Error('Could not capture a Bearer token. Check login-debug/ screenshots.');
    }

    // ── 6. Decode JWT and print claims ───────────────────────────────────────
    let payload = {};
    try {
        payload = JSON.parse(Buffer.from(captured.token.split('.')[1], 'base64url').toString());
    } catch { /* non-JWT token */ }

    console.log('\n=== JWT CLAIMS ===');
    console.log('  aud :', payload.aud);
    console.log('  upn :', payload.upn);
    console.log('  scp :', payload.scp);
    console.log('  exp :', payload.exp ? new Date(payload.exp * 1000).toISOString() : 'n/a');

    // ── 7. Step A – GET standard BC companies ────────────────────────────────
    const companiesUrl = `https://api.businesscentral.dynamics.com/v2.0/${TENANT_ID}/${ENV_NAME}/api/v2.0/companies`;
    console.log(`\n=== STEP A: GET ${companiesUrl.substring(0, 80)} ===`);

    const companiesResp = await page.evaluate(async ([url, token]) => {
        const r = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
        return { status: r.status, body: await r.text() };
    }, [companiesUrl, captured.token]);

    console.log('  HTTP status:', companiesResp.status);

    let firstCompanyId = null;
    if (companiesResp.status === 200) {
        const data = JSON.parse(companiesResp.body);
        firstCompanyId = data.value?.[0]?.id;
        console.log('  Companies:', data.value?.map(c => `${c.id} (${c.name})`).join('\n             '));
    } else {
        console.error('  Error body:', companiesResp.body.substring(0, 400));
    }

    // ── 8. Step B – GET 4PS custom customers ─────────────────────────────────
    if (firstCompanyId) {
        const customersUrl = `https://4psconstruct.api.bc.dynamics.com/v2.0/${TENANT_ID}/${ENV_NAME}/api/4ps/custom/v1.0/companies(${firstCompanyId})/customers`;
        console.log(`\n=== STEP B: GET ${customersUrl.substring(0, 90)} ===`);

        const custResp = await page.evaluate(async ([url, token]) => {
            const r = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
            return { status: r.status, body: await r.text() };
        }, [customersUrl, captured.token]);

        console.log('  HTTP status:', custResp.status);
        if (custResp.status === 200) {
            const custData = JSON.parse(custResp.body);
            console.log('  Customer count:', custData.value?.length ?? 'n/a');
            if (custData.value?.[0]) {
                console.log('  First customer:', JSON.stringify(custData.value[0], null, 4));
            }
        } else {
            console.error('  Error body:', custResp.body.substring(0, 400));
        }
    }

    // ── 9. Persist results ───────────────────────────────────────────────────
    const results = {
        timestamp        : new Date().toISOString(),
        account          : user.username,
        tokenSource      : captured.sourceUrl ? 'network-intercept' : 'msal-storage',
        tokenAudience    : payload.aud,
        tokenExpiry      : payload.exp ? new Date(payload.exp * 1000).toISOString() : null,
        tenantId         : TENANT_ID,
        environment      : ENV_NAME,
        stepA_status     : companiesResp.status,
        firstCompanyId,
    };

    const outPath = path.join(__dirname, 'token-capture-results.json');
    fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
    console.log('\n=== RESULTS WRITTEN TO:', outPath, '===');
    console.log(JSON.stringify(results, null, 2));
});
