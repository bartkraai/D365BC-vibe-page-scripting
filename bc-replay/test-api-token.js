/**
 * test-api-token.js
 *
 * Validates Option A: reuse the Entra ID Bearer token that the BC web client
 * obtains during a Playwright browser session to call the BC / 4PS OData API.
 *
 * Reads credentials from environment variables (same pattern as npx-run.ps1):
 *   BC_USERNAME  – Entra ID UPN
 *   BC_PASSWORD  – account password
 *   BC_URL       – BC environment URL (e.g. https://4psconstruct.bc.dynamics.com/<tenant>/<env>)
 *
 * Token capture mechanisms (tried in order):
 *   1. MSAL browser storage  – inspects localStorage / sessionStorage for cached access tokens
 *   2. Network interception  – catches Authorization: Bearer headers on BC/API requests
 *
 * Graduated API validation:
 *   Step A – GET standard BC v2.0 companies  (confirms token accepted by API)
 *   Step B – GET 4PS custom customers        (confirms extension API works)
 *
 * Usage:
 *   node test-api-token.js
 *   node test-api-token.js --headed   (show browser window)
 *   node test-api-token.js --create   (also POST a minimal test customer after GET validates)
 */

const { chromium } = require('@playwright/test');
const https = require('https');
const url = require('url');
const { authenticator } = require('otplib');

// ── Config ────────────────────────────────────────────────────────────────────
const BC_USERNAME = process.env.BC_USERNAME;
const BC_PASSWORD = process.env.BC_PASSWORD;
const BC_URL      = process.env.BC_URL;
const BC_MFA_SEED = process.env.BC_MFA_SEED || null;

const HEADED      = process.argv.includes('--headed');
const CREATE_TEST = process.argv.includes('--create');

// Derive tenant/env from BC_URL for the API base
// BC_URL format: https://<tenant>.bc.dynamics.com/<tenantId>/<envName>
//            or: https://businesscentral.dynamics.com/<tenantId>/<envName>
function parseApiBase(bcUrl) {
    const parsed = new URL(bcUrl);
    // e.g. /34b93528-e939-4e0b-a370-e6b753ae2514/latestrelease
    const parts = parsed.pathname.replace(/^\//, '').split('/');
    const tenantId = parts[0];
    const envName  = parts[1] || 'Production';

    // 4PS uses 4psconstruct.api.bc.dynamics.com  (replace web host with api host)
    const webHost  = parsed.hostname; // e.g. 4psconstruct.bc.dynamics.com
    const apiHost  = webHost.replace('.bc.dynamics.com', '.api.bc.dynamics.com');

    return {
        tenantId,
        envName,
        bcApiBase:  `https://${apiHost}/v2.0/${tenantId}/${envName}`,
        stdApiBase: `https://api.businesscentral.dynamics.com/v2.0/${tenantId}/${envName}`,
    };
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function log(tag, msg) {
    const ts = new Date().toISOString().replace('T', ' ').substring(0, 19);
    console.log(`[${ts}] [${tag}] ${msg}`);
}

function decodeJwtPayload(token) {
    try {
        const parts = token.split('.');
        if (parts.length < 2) return null;
        const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const json = Buffer.from(b64, 'base64').toString('utf8');
        return JSON.parse(json);
    } catch {
        return null;
    }
}

function httpsGet(requestUrl, bearerToken) {
    return new Promise((resolve, reject) => {
        const opts = url.parse(requestUrl);
        opts.headers = { Authorization: `Bearer ${bearerToken}`, Accept: 'application/json' };
        const req = https.get(opts, (res) => {
            let body = '';
            res.on('data', (chunk) => (body += chunk));
            res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
        });
        req.on('error', reject);
        req.setTimeout(15000, () => { req.destroy(); reject(new Error('Request timed out')); });
    });
}

function httpsPost(requestUrl, bearerToken, payload) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify(payload);
        const opts = url.parse(requestUrl);
        opts.method  = 'POST';
        opts.headers = {
            Authorization:  `Bearer ${bearerToken}`,
            'Content-Type': 'application/json',
            Accept:         'application/json',
            'Content-Length': Buffer.byteLength(body),
        };
        const req = https.request(opts, (res) => {
            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
        });
        req.on('error', reject);
        req.setTimeout(15000, () => { req.destroy(); reject(new Error('Request timed out')); });
        req.write(body);
        req.end();
    });
}

// ── MSAL storage scanner ──────────────────────────────────────────────────────
async function extractMsalTokenFromStorage(page) {
    const token = await page.evaluate(() => {
        const stores = [window.localStorage, window.sessionStorage];
        const SCOPES_TO_TRY = [
            'https://api.businesscentral.dynamics.com',
            'https://4psconstruct.api.bc.dynamics.com',
            'api.businesscentral.dynamics.com',
        ];

        for (const store of stores) {
            for (let i = 0; i < store.length; i++) {
                const key = store.key(i);
                if (!key || !key.includes('accesstoken')) continue;
                try {
                    const entry = JSON.parse(store.getItem(key));
                    if (entry && entry.secret && entry.expiresOn) {
                        // Any access token – return earliest expiry last (we'll log the audience)
                        return entry.secret;
                    }
                } catch {}
            }
        }
        return null;
    });
    return token;
}

// ── Network interception ──────────────────────────────────────────────────────
function setupNetworkCapture(page) {
    const captured = { token: null };
    page.on('request', (request) => {
        if (captured.token) return; // already have one
        const auth = request.headers()['authorization'];
        if (auth && auth.startsWith('Bearer ')) {
            const reqUrl = request.url();
            if (
                reqUrl.includes('bc.dynamics.com') ||
                reqUrl.includes('businesscentral.dynamics.com') ||
                reqUrl.includes('graph.microsoft.com')
            ) {
                captured.token = auth.split(' ')[1];
                log('NET', `Bearer token captured from: ${reqUrl.substring(0, 80)}...`);
            }
        }
    });
    return captured;
}

// ── Entra ID login flow (mirrors bc-replay's authenticateWithTotp logic) ─────
async function loginToBC(page) {
    const fs = require('fs');
    const debugDir = 'login-debug';
    if (!fs.existsSync(debugDir)) fs.mkdirSync(debugDir);
    let step = 0;
    const screenshot = async (label) => {
        const file = `${debugDir}/${String(++step).padStart(2,'0')}-${label}.png`;
        await page.screenshot({ path: file }).catch(() => {});
        log('DEBUG', `Screenshot: ${file} | URL: ${page.url().substring(0, 100)}`);
    };

    log('LOGIN', `Navigating to BC: ${BC_URL}`);
    await page.goto(BC_URL, { timeout: 60000 });
    await page.waitForLoadState('domcontentloaded');
    await page.waitForURL(/login\.microsoftonline\.com/, { timeout: 30000 });
    await page.waitForLoadState('networkidle');
    await screenshot('01-login-page');

    // ── Step 1: fill email ───────────────────────────────────────────────────
    const emailInput = page.locator('input[name="loginfmt"]');
    await emailInput.waitFor({ state: 'visible', timeout: 20000 });
    log('LOGIN', 'Filling username...');
    await emailInput.fill(BC_USERNAME);
    await screenshot('02-after-email-fill');
    // Use Promise.all with waitForNavigation (same pattern as bc-replay)
    await Promise.all([
        page.waitForNavigation({ timeout: 60000 }),
        page.click('input[type="submit"]', { timeout: 60000 }),
    ]);
    await screenshot('03-after-email-submit');
    log('LOGIN', `After email: ${page.url().substring(0, 80)}...`);

    // ── Step 2: fill password ────────────────────────────────────────────────
    // Wait for password field to be interactive (bc-replay uses tabIndex check)
    await page.waitForFunction(
        (sel) => document.querySelector(sel) && document.querySelector(sel)?.tabIndex !== -1,
        'input[type="password"]',
        { timeout: 20000 }
    );
    log('LOGIN', 'Filling password...');
    await page.fill('input[type="password"]', BC_PASSWORD);
    await screenshot('04-after-password-fill');
    await Promise.all([
        page.waitForNavigation({ timeout: 60000 }),
        page.click('input[type="submit"]', { timeout: 60000 }),
    ]);
    await screenshot('05-after-password-submit');
    log('LOGIN', `After password: ${page.url().substring(0, 80)}...`);

    // ── Step 3: MFA / TOTP ───────────────────────────────────────────────────
    if (BC_MFA_SEED) {
        // Wait for one of the expected MFA elements to appear (race)
        log('LOGIN', 'Waiting for MFA prompt to appear...');
        await Promise.race([
            page.locator('#signInAnotherWay').waitFor({ state: 'visible', timeout: 25000 }).catch(() => null),
            page.locator('[data-value*="PhoneAppOTP"]').waitFor({ state: 'visible', timeout: 25000 }).catch(() => null),
            page.locator('input[name="otc"]').waitFor({ state: 'visible', timeout: 25000 }).catch(() => null),
        ]);
        await screenshot('06-mfa-prompt');
        log('LOGIN', `MFA page: ${page.url().substring(0, 80)}...`);

        // If "Sign in another way" is shown (Authenticator push), switch to TOTP
        if (await page.locator('#signInAnotherWay').isVisible() &&
            await page.locator('input[name="otc"]').isHidden()) {
            log('LOGIN', 'Clicking "Sign in another way"...');
            await Promise.all([
                page.waitForNavigation({ timeout: 60000 }),
                page.click('#signInAnotherWay', { timeout: 60000 }),
            ]);
            await screenshot('07-sign-in-another-way');
        }
        // If "Use verification code" option is shown, click it
        if (await page.locator('[data-value*="PhoneAppOTP"]').isVisible()) {
            log('LOGIN', 'Selecting "Use verification code" (PhoneAppOTP)...');
            await Promise.all([
                page.waitForNavigation({ timeout: 60000 }),
                page.click('[data-value*="PhoneAppOTP"]', { timeout: 60000 }),
            ]);
            await screenshot('08-use-verification-code');
        }
        if (await page.locator('input[name="otc"]').isHidden()) {
            await screenshot('09-totp-not-found');
            throw new Error('TOTP input (input[name="otc"]) not visible after MFA navigation');
        }
        const totp = authenticator.generate(BC_MFA_SEED.toUpperCase().replace(/\s/g, ''));
        log('LOGIN', `Entering TOTP code: ${totp}`);
        await page.fill('input[name="otc"]', totp);
        await screenshot('10-after-totp-fill');
        await Promise.all([
            page.waitForNavigation({ timeout: 60000 }),
            page.click('input[type="submit"]', { timeout: 60000 }),
        ]);
        await screenshot('11-after-totp-submit');
        log('LOGIN', `After TOTP: ${page.url().substring(0, 80)}...`);
    }

    // ── Step 4: "Stay signed in?" ────────────────────────────────────────────
    try {
        const kmsiBtn = page.locator('#idSIButton9');
        await kmsiBtn.waitFor({ state: 'visible', timeout: 8000 });
        log('LOGIN', 'Dismissing "Stay signed in" prompt...');
        await screenshot('11-kmsi-prompt');
        await Promise.all([
            page.waitForNavigation({ timeout: 60000 }),
            kmsiBtn.click(),
        ]);
    } catch { /* no KMSI prompt */ }

    // ── Wait for BC — match HOST only (avoid matching redirect_uri param) ────
    log('LOGIN', 'Waiting for BC shell to load...');
    await page.waitForURL(
        (url) => /^https:\/\/[^/]+(bc\.dynamics\.com|businesscentral\.dynamics\.com)/.test(url.toString()),
        { timeout: 90000 }
    );
    log('LOGIN', `BC URL reached: ${page.url().substring(0, 80)}...`);
    await page.waitForTimeout(6000);
    await screenshot('12-bc-loaded');
    log('LOGIN', 'BC loaded successfully');
}

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
    // Validate env vars
    if (!BC_USERNAME || !BC_PASSWORD || !BC_URL) {
        console.error('[ERROR] Missing required environment variables: BC_USERNAME, BC_PASSWORD, BC_URL');
        process.exit(1);
    }

    const { tenantId, envName, bcApiBase, stdApiBase } = parseApiBase(BC_URL);
    log('CONFIG', `Tenant: ${tenantId}`);
    log('CONFIG', `Environment: ${envName}`);
    log('CONFIG', `BC API base:  ${bcApiBase}`);
    log('CONFIG', `Std API base: ${stdApiBase}`);

    let browser;
    let token = null;
    let captureSource = null;

    try {
        browser = await chromium.launch({ headless: !HEADED });
        const context = await browser.newContext();
        const page    = await context.newPage();

        // Wire network capture BEFORE navigation
        const netCapture = setupNetworkCapture(page);

        // Log in to BC
        await loginToBC(page);

        // ── Mechanism 1: MSAL storage ────────────────────────────────────────
        log('TOKEN', 'Attempting MSAL storage extraction...');
        token = await extractMsalTokenFromStorage(page);
        if (token) {
            captureSource = 'MSAL storage';
            log('TOKEN', `Captured via ${captureSource} (length: ${token.length})`);
        }

        // ── Mechanism 2: network interception (fallback) ────────────────────
        if (!token) {
            log('TOKEN', 'MSAL storage empty — triggering a BC API request to capture via network...');
            // Navigate within BC to force an API call
            try {
                await page.goto(BC_URL + '?page=22', { timeout: 30000 }); // Customer List page
                await page.waitForTimeout(4000);
            } catch { /* best effort */ }

            token = netCapture.token;
            if (token) {
                captureSource = 'network interception';
                log('TOKEN', `Captured via ${captureSource} (length: ${token.length})`);
            }
        }

        // ── Re-scan MSAL after page navigation ──────────────────────────────
        if (!token) {
            log('TOKEN', 'Re-scanning MSAL storage after page navigation...');
            token = await extractMsalTokenFromStorage(page);
            if (token) {
                captureSource = 'MSAL storage (post-navigation)';
                log('TOKEN', `Captured via ${captureSource} (length: ${token.length})`);
            }
        }

        await browser.close();

        if (!token) {
            log('ERROR', 'No Bearer token captured via any mechanism. Option A is not viable for this session.');
            process.exit(2);
        }

        // ── Decode token info ─────────────────────────────────────────────────
        const payload = decodeJwtPayload(token);
        if (payload) {
            log('TOKEN', `Audience (aud): ${payload.aud}`);
            log('TOKEN', `Subject (upn):  ${payload.upn || payload.preferred_username || payload.sub}`);
            const exp = new Date(payload.exp * 1000);
            log('TOKEN', `Expires:        ${exp.toISOString()} (${Math.round((exp - Date.now()) / 60000)} min from now)`);
        }

        // ── Step A: GET companies (standard BC API) ───────────────────────────
        console.log('\n── STEP A: GET standard BC companies ───────────────────────────────');
        const companiesUrl = `${stdApiBase}/api/v2.0/companies`;
        log('GET', companiesUrl);
        const respA = await httpsGet(companiesUrl, token);
        log('HTTP', `Status: ${respA.status}`);

        let companyId = null;
        if (respA.status === 200) {
            const data = JSON.parse(respA.body);
            const companies = data.value || [];
            log('OK', `Found ${companies.length} company(ies)`);
            companies.forEach((c, i) => log('OK', `  [${i}] id=${c.id}  name=${c.name}`));
            if (companies.length > 0) companyId = companies[0].id;
        } else {
            log('FAIL', `Unexpected status. Response: ${respA.body.substring(0, 400)}`);
            // Try with bcApiBase fallback
            log('RETRY', `Retrying with bcApiBase: ${bcApiBase}`);
            const companiesUrl2 = `${bcApiBase}/api/v2.0/companies`;
            log('GET', companiesUrl2);
            const respA2 = await httpsGet(companiesUrl2, token);
            log('HTTP', `Status: ${respA2.status}`);
            if (respA2.status === 200) {
                const data2 = JSON.parse(respA2.body);
                const companies2 = data2.value || [];
                log('OK', `Found ${companies2.length} company(ies) via bcApiBase`);
                companies2.forEach((c, i) => log('OK', `  [${i}] id=${c.id}  name=${c.name}`));
                if (companies2.length > 0) companyId = companies2[0].id;
            } else {
                log('FAIL', `Both API base URLs rejected. Token audience mismatch — Option A likely not viable.`);
                log('FAIL', `Response: ${respA2.body.substring(0, 400)}`);
                process.exit(3);
            }
        }

        if (!companyId) {
            log('WARN', 'No companies found — cannot proceed to Step B');
            process.exit(0);
        }

        // ── Step B: GET 4PS customers ─────────────────────────────────────────
        console.log('\n── STEP B: GET 4PS custom customers ────────────────────────────────');
        // Try standard API base first, then bc-specific
        const customersUrls = [
            `${stdApiBase}/api/4ps/custom/v1.0/companies(${companyId})/customers`,
            `${bcApiBase}/api/4ps/custom/v1.0/companies(${companyId})/customers`,
        ];

        let customersOk = false;
        let firstCustomer = null;
        for (const custUrl of customersUrls) {
            log('GET', custUrl);
            const respB = await httpsGet(custUrl, token);
            log('HTTP', `Status: ${respB.status}`);
            if (respB.status === 200) {
                const dataB = JSON.parse(respB.body);
                const customers = dataB.value || [];
                log('OK', `Returned ${customers.length} customer(s)`);
                if (customers.length > 0) {
                    firstCustomer = customers[0];
                    log('OK', `First customer: ${JSON.stringify(firstCustomer).substring(0, 200)}`);
                }
                customersOk = true;
                break;
            } else {
                log('FAIL', `Status ${respB.status}: ${respB.body.substring(0, 300)}`);
            }
        }

        // ── Step C: POST test customer (only if --create flag and GETs succeeded) ──
        if (CREATE_TEST && customersOk) {
            console.log('\n── STEP C: POST minimal test customer ──────────────────────────────');
            // Build minimal body by inspecting first customer's keys (omit read-only fields)
            const readOnlyKeys = ['id', 'number', 'lastModifiedDateTime', 'etag', '@odata.etag'];
            const postBody = {};
            if (firstCustomer) {
                // Use existing customer as shape guide, substitute test values
                Object.keys(firstCustomer).forEach((k) => {
                    if (!readOnlyKeys.some(r => k.toLowerCase().includes(r.toLowerCase()))) {
                        postBody[k] = firstCustomer[k]; // copy existing value as template
                    }
                });
                // Override with test-specific values
                postBody.displayName = `TEST-TOKEN-VALIDATION-${Date.now()}`;
                if (postBody.name !== undefined) postBody.name = postBody.displayName;
            } else {
                // Minimal fallback body
                postBody.displayName = `TEST-TOKEN-VALIDATION-${Date.now()}`;
            }

            log('POST', `Body: ${JSON.stringify(postBody).substring(0, 300)}`);
            const postUrl = `${stdApiBase}/api/4ps/custom/v1.0/companies(${companyId})/customers`;
            log('POST', postUrl);
            const respC = await httpsPost(postUrl, token, postBody);
            log('HTTP', `Status: ${respC.status}`);
            if (respC.status === 201 || respC.status === 200) {
                const created = JSON.parse(respC.body);
                log('OK', `Customer created! id=${created.id}  number=${created.number}`);
                log('WARN', `Remember to delete test customer "${postBody.displayName}" from BC!`);
            } else {
                log('FAIL', `POST failed. Response: ${respC.body.substring(0, 500)}`);
            }
        }

        console.log('\n── SUMMARY ─────────────────────────────────────────────────────────');
        log('SUMMARY', `Token source:   ${captureSource}`);
        log('SUMMARY', `Token audience: ${payload?.aud || 'unknown'}`);
        log('SUMMARY', `Step A (companies): ${respA.status === 200 ? 'PASS' : 'FAIL (see above for retry)'}`);
        log('SUMMARY', `Step B (customers): ${customersOk ? 'PASS' : 'FAIL'}`);
        log('SUMMARY', `Option A verdict: ${customersOk ? 'VIABLE — token works for BC/4PS API calls' : 'NOT VIABLE — see errors above'}`);

    } catch (err) {
        if (browser) await browser.close().catch(() => {});
        console.error('[FATAL]', err.message);
        console.error(err.stack);
        process.exit(1);
    }
})();
