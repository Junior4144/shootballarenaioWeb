import { test, expect, type Page } from '@playwright/test';
import { Client } from '@colyseus/sdk';
import { ROOM_NAME, VERSION, type Snapshot } from '@shootball/protocol';

const project = 'https://lkgxpgcmspxekggndzih.supabase.co';
const uid = '10000000-0000-4000-8000-000000000001';
const user = { id: uid, aud: 'authenticated', role: 'authenticated', email: 'fixture@example.test', app_metadata: { provider: 'email' }, user_metadata: {}, created_at: new Date().toISOString() };
function session() {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const token = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: uid, exp, role: 'authenticated' })).toString('base64url')}.fixture`;
  return { access_token: token, refresh_token: 'fixture-refresh', expires_in: 3600, expires_at: exp, token_type: 'bearer', user };
}
async function mockAuth(page: Page) {
  await page.route(`${project}/**`, async route => {
    const url = new URL(route.request().url());
    let body: unknown = {};
    if (url.pathname.endsWith('/token')) body = session();
    else if (url.pathname.endsWith('/user')) body = user;
    else if (url.pathname.endsWith('/signup')) body = session();
    else if (url.pathname.includes('/profiles')) body = { display_name: 'Pixel Ace' };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
}
test.beforeEach(async ({ page }) => { await mockAuth(page); });

for (const width of [1366, 390]) test(`pixel account entry waits for choice at ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 844 });
  const sockets: string[] = []; page.on('websocket', socket => { if (new URL(socket.url()).port === '2569') sockets.push(socket.url()); });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Play as Guest', exact: true })).toBeEnabled();
  expect(sockets).toEqual([]); await expect(page.locator('canvas')).toHaveCount(0);
  await expect(page.locator('#arena-app')).toBeHidden();
  expect(await page.locator('.entry-panel').evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  await page.screenshot({ path: info.outputPath('entry.png'), fullPage: true });
  await page.getByRole('tab', { name: 'Create account' }).click();
  await expect(page.locator('#confirm-password')).toBeVisible();
  await expect(page.locator('#google-login svg')).toBeVisible();
  await page.screenshot({ path: info.outputPath('signup.png'), fullPage: true });
  await page.getByRole('button', { name: 'Play as Guest', exact: true }).click(); await page.locator('#lobby-play').click();
  await expect(page.locator('#connection-status')).toContainText('Connected');
  await expect(page.locator('#playing-identity')).toContainText('GUEST');
});

test('segmented account modes support keyboard selection and reject mismatched passwords', async ({ page }) => {
  let signups = 0;
  page.on('request', request => { if (request.url().includes('/auth/v1/signup')) signups++; });
  await page.goto('/');
  const login = page.getByRole('tab', { name: 'Log in', exact: true });
  const signup = page.getByRole('tab', { name: 'Create account', exact: true });
  await expect(login).toHaveAttribute('aria-selected', 'true');
  await login.focus(); await page.keyboard.press('ArrowLeft');
  await expect(signup).toBeFocused(); await expect(signup).toHaveAttribute('aria-selected', 'true');
  await page.locator('#email').fill('fixture@example.test');
  await page.locator('#password').fill('Test-password-123');
  await page.locator('#confirm-password').fill('Different-password-123');
  await page.locator('#auth-submit').click();
  await expect(page.locator('#auth-message')).toContainText('Passwords do not match');
  expect(signups).toBe(0);
  await signup.focus(); await page.keyboard.press('End');
  await expect(login).toBeFocused(); await expect(login).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#confirm-password')).toBeHidden();
  await expect(page.locator('#email')).toHaveValue('fixture@example.test');
});

test('signup signs in immediately, reset request, login restoration, logout and identity isolation', async ({ page }) => {
  await page.goto('/');
  await page.locator('#signup-tab').click();
  await page.locator('#email').fill('fixture@example.test');
  await page.locator('#password').fill('Test-password-123');
  await page.locator('#confirm-password').fill('Test-password-123');
  await page.locator('#auth-submit').click();
  await expect(page.locator('#auth-message')).toContainText('Account created');
  await expect(page.locator('#account-play')).toBeEnabled();
  await expect(page.locator('canvas')).toHaveCount(0);
  await page.locator('#account-signout').click();
  await page.locator('#forgot-password').click();
  await page.locator('#auth-submit').click(); await expect(page.locator('#auth-message')).toContainText('password-reset link');
  await page.locator('#auth-back').click();
  await page.evaluate(() => sessionStorage.setItem('shootball:v7:fixture:guest', 'old-resume'));
  await page.locator('#password').fill('Test-password-123'); await page.locator('#auth-submit').click();
  await expect(page.locator('#account-identity')).toHaveText('ACCOUNT / Pixel Ace');
  await expect(page.locator('#account-play')).toBeEnabled();
  expect(await page.evaluate(() => sessionStorage.getItem('shootball:v7:fixture:guest'))).toBeNull();
  await page.reload(); await expect(page.locator('#account-play')).toBeEnabled();
  await expect(page.locator('canvas')).toHaveCount(0);
  await page.evaluate(() => sessionStorage.setItem('shootball:v7:fixture:account:a', 'account-resume'));
  await page.locator('#account-signout').click();
  await expect(page.locator('#guest-play')).toBeEnabled();
  expect(await page.evaluate(() => sessionStorage.getItem('shootball:v7:fixture:account:a'))).toBeNull();
  await page.reload(); await expect(page.locator('#signed-in')).toBeHidden();
});

test('Google cancellation and failed code exchange return to a usable entry screen', async ({ page }) => {
  await page.goto('/?error=access_denied&error_description=private-detail');
  await expect(page.locator('#auth-message')).toContainText('Sign-in cancelled');
  await expect(page).toHaveURL(/\/$/);
  await page.route(`${project}/auth/v1/token**`, route => route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'invalid_grant', error_description: 'bad code' }) }));
  await page.goto('/?code=invalid');
  await expect(page.locator('#auth-message')).toContainText('expired or was opened in a different browser');
  await expect(page.locator('#guest-play')).toBeEnabled();
});

test('cancelled in-flight login discards the resulting session', async ({ page }) => {
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route(`${project}/auth/v1/token**`, async route => { await pending; await route.fulfill({ contentType: 'application/json', body: JSON.stringify(session()) }); });
  await page.goto('/'); await page.locator('#email').fill('fixture@example.test'); await page.locator('#password').fill('Test-password-123');
  await page.locator('#auth-submit').click(); await expect(page.locator('#auth-cancel')).toBeVisible();
  await page.locator('#auth-cancel').click(); release();
  await expect(page.locator('#auth-message')).toHaveText('Cancelled.');
  await expect(page.locator('#guest-play')).toBeEnabled(); await expect(page.locator('#signed-in')).toBeHidden();
});

test('password recovery permits updating password without auto-playing', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(value => localStorage.setItem('sb-lkgxpgcmspxekggndzih-auth-token', JSON.stringify(value)), session());
  await page.goto('/?recovery=1');
  await expect(page.locator('#auth-submit')).toHaveText('Save new password');
  await page.locator('#password').fill('Updated-password-123'); await page.locator('#auth-submit').click();
  await expect(page.locator('#auth-message')).toContainText('Password updated');
  await expect(page.locator('#account-play')).toBeEnabled(); await expect(page.locator('canvas')).toHaveCount(0);
});

test('guest reload waits for choice then resumes the same temporary identity', async ({ page }) => {
  const observer = await new Client('ws://127.0.0.1:2569').joinOrCreate(ROOM_NAME, { version: VERSION, mode: 'guest' });
  observer.reconnection.enabled = false;
  let snapshot: Snapshot | undefined;
  observer.onMessage<Snapshot>('snapshot', value => { snapshot = value; });
  try {
    await page.goto('/'); await page.locator('#guest-play').click(); await page.locator('#lobby-play').click();
    await expect(page.locator('#connection-status')).toContainText('Connected');
    await expect.poll(() => snapshot?.players.filter(p => !p.bot && p.id !== observer.sessionId).length).toBe(1);
    const id = snapshot!.players.find(p => !p.bot && p.id !== observer.sessionId)!.id;
    await page.reload(); await expect(page.locator('#guest-play')).toBeEnabled();
    await expect(page.locator('canvas')).toHaveCount(0);
    await page.locator('#guest-play').click(); await page.locator('#lobby-play').click(); await expect(page.locator('#connection-status')).toContainText('Connected');
    await expect.poll(() => snapshot?.players.find(p => p.id === id)?.connected).toBe(true);
    await expect(page.locator('#playing-identity')).toContainText('GUEST');
    await page.locator('#account-toggle').click(); await page.locator('#return-accounts').click(); await page.locator('#guest-play').click(); await page.locator('#lobby-play').click();
    await expect(page.locator('#connection-status')).toContainText('Connected');
    await page.locator('#leave').click(); await page.locator('#join').click();
    await expect(page.locator('#connection-status')).toContainText('Connected');
    await expect.poll(() => snapshot?.players.filter(p => !p.bot).length).toBe(2);
  } finally { if (observer.connection.isOpen) await observer.leave(); }
});

test('login in another tab exits guest gameplay and discards guest resume tokens', async ({ page, context }) => {
  await page.goto('/'); await page.locator('#guest-play').click(); await page.locator('#lobby-play').click();
  await expect(page.locator('#connection-status')).toContainText('Connected');
  const other = await context.newPage(); await mockAuth(other);
  try {
    await other.goto('/'); await other.locator('#email').fill('fixture@example.test'); await other.locator('#password').fill('Test-password-123');
    await other.locator('#auth-submit').click();
    await expect(page.locator('#account-identity')).toHaveText('ACCOUNT / Pixel Ace');
    await expect(page.locator('#arena-app')).toBeHidden();
    expect(await page.evaluate(() => Object.keys(sessionStorage).filter(key => key.startsWith('shootball:v')))).toEqual([]);
    await other.locator('#account-signout').click(); await expect(page.locator('#guest-play')).toBeEnabled();
  } finally { await other.close(); }
});

for (const width of [1366, 390]) test(`gameplay account controls at ${width}px open the requested form`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 844 });
  await page.goto('/');
  await page.locator('#guest-play').click(); await page.locator('#lobby-play').click();
  await expect(page.locator('#connection-status')).toContainText('Connected');
  await expect(page.locator('#account-toggle')).toBeInViewport();
  await page.locator('#account-toggle').click();
  await expect(page.locator('#playing-identity')).toHaveText('GUEST / Temporary');
  await page.screenshot({ path: info.outputPath('gameplay-account.png'), fullPage: true });
  await page.locator('#gameplay-signup').click();
  await expect(page.locator('#signup-tab')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#signup-tab')).toBeFocused();
  await expect(page.locator('#confirm-password')).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(0);
  expect(await page.evaluate(() => Object.keys(sessionStorage).filter(key => key.startsWith('shootball:v')))).toEqual([]);
  await page.locator('#guest-play').click(); await page.locator('#lobby-play').click();
  await expect(page.locator('#connection-status')).toContainText('Connected');
  await page.locator('#account-toggle').click(); await page.locator('#return-accounts').click();
  await expect(page.locator('#login-tab')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#login-tab')).toBeFocused();
  await page.locator('#email').fill('fixture@example.test');
  await page.locator('#password').fill('Test-password-123');
  await page.locator('#auth-submit').click();
  await expect(page.locator('#account-play')).toBeEnabled();
  await page.locator('#account-play').click(); await page.locator('#lobby-play').click();
  // Auth is mocked here; the real server rejects the fixture token. The account UI still works.
  await expect(page.locator('#playing-identity')).toHaveText('ACCOUNT / Pixel Ace');
  await expect(page.locator('#gameplay-signup')).toBeHidden();
  await expect(page.locator('#return-accounts')).toHaveText('Manage account');
  await page.locator('#account-toggle').click(); await page.locator('#return-accounts').click();
  await expect(page.locator('#display-name')).toBeFocused();
  await page.locator('#account-signout').click();
  await expect(page.locator('#guest-play')).toBeEnabled();
});

test('hover audio produces real Web Audio tones, supports keyboard focus and respects mute', async ({ page }) => {
  await page.addInitScript(() => {
    const start = OscillatorNode.prototype.start;
    Object.defineProperty(window, 'uiTones', { value: [], configurable: true });
    OscillatorNode.prototype.start = function (...args) {
      if (this.type === 'triangle') {
        (window as unknown as { uiTones: string[] }).uiTones.push(this.context.state);
      }
      return start.apply(this, args);
    };
  });
  const count = () => page.evaluate(() => (window as unknown as { uiTones: string[] }).uiTones.length);
  await page.goto('/');
  await expect(page.locator('#guest-play')).toBeEnabled();
  await page.locator('#email').click(); // Browser user gesture unlocks audio.
  await page.locator('#google-login').hover();
  await expect.poll(count).toBeGreaterThan(0);
  expect(await page.evaluate(() => (window as unknown as { uiTones: string[] }).uiTones.every(state => state === 'running'))).toBe(true);
  const beforeKeyboard = await count();
  await page.waitForTimeout(100); // The short tone's debounce window.
  await page.locator('#password').focus();
  await page.keyboard.press('Tab');
  await expect(page.locator('#auth-submit')).toBeFocused();
  await expect.poll(count).toBeGreaterThan(beforeKeyboard);
  await page.locator('#guest-play').click(); await page.locator('#lobby-play').click();
  await expect(page.locator('#connection-status')).toContainText('Connected');
  await page.locator('#mute').click();
  await expect(page.locator('#mute')).toHaveAttribute('aria-pressed', 'true');
  const muted = await count();
  await page.waitForTimeout(100);
  await page.locator('#account-toggle').hover();
  expect(await count()).toBe(muted);
  await page.locator('#mute').click();
  await page.waitForTimeout(100);
  await page.locator('#account-toggle').hover();
  await expect.poll(count).toBeGreaterThan(muted);
});

for (const viewport of [{ width: 2560, height: 1440 }, { width: 1920, height: 1080 }, { width: 1366, height: 768 }, { width: 800, height: 600 }, { width: 390, height: 844 }, { width: 320, height: 568 }]) {
  test(`compact header fits long account names at ${viewport.width}x${viewport.height}`, async ({ page }, info) => {
    await page.setViewportSize(viewport);
    await page.route(`${project}/rest/v1/profiles**`, route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ display_name: 'ABCDEFGHIJKLMNOPQRST' }) }));
    await page.goto('/');
    await page.locator('#email').fill('fixture@example.test');
    await page.locator('#password').fill('Test-password-123');
    await page.locator('#auth-submit').click();
    await expect(page.locator('#account-play')).toBeEnabled();
    await page.locator('#account-play').click(); await page.locator('#lobby-play').click();
    await expect(page.locator('#account-toggle-name')).toHaveText('ABCDEFGHIJKLMNOPQRST');
    const geometry = await page.evaluate(() => {
      const box = (selector: string) => {
        const r = document.querySelector(selector)!.getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
      };
      return { header: box('.game-header'), brand: box('.game-brand'), match: box('.header-match'), actions: box('.header-actions'), account: box('#account-toggle'), settings: box('#settings-toggle'), width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight };
    });
    expect(geometry.width).toBeLessThanOrEqual(viewport.width);
    expect(geometry.height).toBeLessThanOrEqual(viewport.height);
    expect(geometry.header.height).toBe(112);
    expect(geometry.brand.right).toBeLessThanOrEqual(geometry.match.left);
    expect(geometry.match.right).toBeLessThanOrEqual(geometry.actions.left);
    expect(geometry.account.right).toBeLessThanOrEqual(geometry.settings.left);
    if (viewport.width > 700) expect(Math.abs((geometry.match.left + geometry.match.right) / 2 - (geometry.header.left + geometry.header.right) / 2)).toBeLessThan(1);
    await page.locator('.game-header').screenshot({ path: info.outputPath('header.png') });
    await page.locator('#account-toggle').click();
    await expect(page.locator('#playing-identity')).toHaveText('ACCOUNT / ABCDEFGHIJKLMNOPQRST');
    const menu = await page.locator('#account-menu').boundingBox();
    expect(menu!.x).toBeGreaterThanOrEqual(0);
    expect(menu!.x + menu!.width).toBeLessThanOrEqual(viewport.width);
    await page.screenshot({ path: info.outputPath('account-dropdown.png') });
    await page.keyboard.press('Escape');
    await expect(page.locator('#account-menu')).toBeHidden();
    await expect(page.locator('#account-toggle')).toBeFocused();
  });
}

test('header dropdowns support keyboard, outside dismissal and working settings', async ({ page }) => {
  await page.goto('/'); await page.locator('#guest-play').click(); await page.locator('#lobby-play').click();
  await expect(page.locator('#connection-status')).toContainText('Connected');
  await page.locator('#account-toggle').focus(); await page.keyboard.press('ArrowDown');
  await expect(page.locator('#return-accounts')).toBeFocused();
  await page.locator('#settings-toggle').click();
  await expect(page.locator('#account-menu')).toBeHidden();
  await page.locator('#settings-sound').click();
  await expect(page.locator('#mute')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#settings-sound')).toHaveText('Unmute sound');
  await page.locator('#settings-sound').click();
  await expect(page.locator('#mute')).toHaveAttribute('aria-pressed', 'false');
  await page.locator('#settings-guide').click();
  await expect(page.locator('#help-widget')).not.toHaveAttribute('open', '');
  await expect(page.locator('#settings-menu')).toBeHidden();
  await page.locator('#account-toggle').click();
  await page.locator('.game-brand').click();
  await expect(page.locator('#account-menu')).toBeHidden();
});

test('initial HTML stays styled and hides account forms until JavaScript is ready', async ({ page }) => {
  let release!: () => void;
  const blocked = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/src/main.ts', async route => { await blocked; await route.continue(); });
  await page.goto('/', { waitUntil: 'commit' });
  try {
    await expect(page.locator('#auth-loading')).toBeVisible();
    await expect(page.locator('#signed-out')).toBeHidden();
    await expect(page.locator('#signed-in')).toBeHidden();
    await expect(page.locator('#arena-app')).toBeHidden();
    await expect(page.locator('.entry-panel')).toHaveCSS('border-top-width', '2px');
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(11, 23, 32)');
  } finally { release(); }
  await expect(page.locator('#guest-play')).toBeEnabled();
});

test('restored session never flashes the signed-out form while the profile loads', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(value => localStorage.setItem('sb-lkgxpgcmspxekggndzih-auth-token', JSON.stringify(value)), session());
  let release!: () => void;
  const blocked = new Promise<void>(resolve => { release = resolve; });
  await page.route(`${project}/rest/v1/profiles**`, async route => {
    await blocked;
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ display_name: 'Pixel Ace' }) });
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  try {
    await expect(page.locator('#auth-loading')).toBeVisible();
    await expect(page.locator('#signed-out')).toBeHidden();
    await expect(page.locator('#signed-in')).toBeHidden();
  } finally { release(); }
  await expect(page.locator('#account-play')).toBeEnabled();
  await expect(page.locator('#auth-loading')).toBeHidden();
});

test('arena loading covers setup until a rendered snapshot and supports returning to accounts', async ({ page }) => {
  await page.goto('/'); await page.locator('#guest-play').click(); await page.locator('#lobby-play').click();
  await expect(page.locator('#game-loading')).toBeHidden();
  await expect(page.locator('#scoreboard tr.local')).toContainText('YOU');
  await page.locator('#account-toggle').click(); await page.locator('#return-accounts').click();
  await expect(page.locator('#account-screen')).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(0);
  await page.locator('#guest-play').click(); await page.locator('#lobby-play').click();
  await expect(page.locator('#game-loading')).toBeHidden();
  await expect(page.locator('#scoreboard tr.local')).toContainText('YOU');
});

test('slow arena entry shows a cancellable loading screen without flashing the match', async ({ page }) => {
  let release!: () => void;
  const blocked = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/matchmake/**', async route => { await blocked; await route.continue(); });
  await page.goto('/'); await page.locator('#guest-play').click(); await page.locator('#lobby-play').click();
  try {
    await expect(page.locator('#game-loading')).toBeVisible();
    await expect(page.locator('#game-loading')).toHaveCSS('background-color', 'rgb(11, 23, 32)');
    await page.locator('#cancel-game-loading').click();
    await expect(page.locator('#arena-app')).toBeHidden();
    await expect(page.locator('#guest-play')).toBeEnabled();
  } finally { release(); }
  await expect(page.locator('canvas')).toHaveCount(0);
});

for (const stale of ['disposed-room:old-token', 'malformed-token']) test(`guest automatically joins fresh after stale resume: ${stale}`, async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#guest-play')).toBeEnabled();
  const key = `shootball:v${VERSION}:ws://127.0.0.1:2569:guest`;
  await page.evaluate(({ key, stale }) => sessionStorage.setItem(key, stale), { key, stale });
  let freshJoins = 0;
  page.on('request', request => { if (request.url().includes('/joinOrCreate/')) freshJoins++; });
  await page.locator('#guest-play').click(); await page.locator('#lobby-play').click();
  await expect(page.locator('#game-loading')).toBeHidden();
  await expect(page.locator('#connection-status')).toContainText('Connected');
  await expect(page.locator('#scoreboard tr.local')).toContainText('YOU');
  expect(freshJoins).toBe(1);
  const next = await page.evaluate(key => sessionStorage.getItem(key), key);
  expect(next).toBeTruthy(); expect(next).not.toBe(stale);
});

test('expired guest reservation in a live room falls back to one fresh guest', async ({ page }) => {
  const observer = await new Client('ws://127.0.0.1:2569').joinOrCreate(ROOM_NAME, { version: VERSION, mode: 'guest' });
  observer.onMessage('snapshot', () => {});
  observer.reconnection.enabled = false;
  try {
    await page.goto('/'); await expect(page.locator('#guest-play')).toBeEnabled();
    await page.evaluate(({ version, token }) => sessionStorage.setItem(`shootball:v${version}:ws://127.0.0.1:2569:guest`, token), { version: VERSION, token: `${observer.roomId}:expired-token` });
    await page.locator('#guest-play').click(); await page.locator('#lobby-play').click();
    await expect(page.locator('#connection-status')).toContainText('Connected');
    await expect(page.locator('#scoreboard tr.local')).toContainText('YOU');
  } finally { await observer.leave(); }
});

test('cancelled stale guest reconnect cannot start a fallback join', async ({ page }) => {
  let release!: () => void;
  const blocked = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/matchmake/reconnect/**', async route => { await blocked; await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ code: 4212, error: 'Room disposed' }) }); });
  await page.goto('/'); await expect(page.locator('#guest-play')).toBeEnabled();
  await page.evaluate(version => sessionStorage.setItem(`shootball:v${version}:ws://127.0.0.1:2569:guest`, 'disposed-room:old-token'), VERSION);
  let freshJoins = 0;
  page.on('request', request => { if (request.url().includes('/joinOrCreate/')) freshJoins++; });
  await page.locator('#guest-play').click(); await page.locator('#lobby-play').click();
  await page.locator('#cancel-game-loading').click();
  release();
  await expect(page.locator('#guest-play')).toBeEnabled();
  await expect(page.locator('canvas')).toHaveCount(0);
  expect(freshJoins).toBe(0);
});

test('failed account resume never falls back to a fresh guest', async ({ page }) => {
  await page.goto('/');
  await page.locator('#email').fill('fixture@example.test'); await page.locator('#password').fill('Test-password-123');
  await page.locator('#auth-submit').click(); await expect(page.locator('#account-play')).toBeEnabled();
  await page.evaluate(({ version, uid }) => sessionStorage.setItem(`shootball:v${version}:ws://127.0.0.1:2569:account:${uid}`, 'disposed-room:old-token'), { version: VERSION, uid });
  let freshJoins = 0;
  page.on('request', request => { if (request.url().includes('/joinOrCreate/')) freshJoins++; });
  await page.locator('#account-play').click(); await page.locator('#lobby-play').click();
  await expect(page.locator('#connection-status')).toContainText('Account join failed');
  expect(freshJoins).toBe(0);
});

test('unavailable server stops after one guest fallback and keeps retry accessible', async ({ page }) => {
  await page.route('**/matchmake/**', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Server unavailable' }) }));
  await page.goto('/'); await expect(page.locator('#guest-play')).toBeEnabled();
  await page.evaluate(version => sessionStorage.setItem(`shootball:v${version}:ws://127.0.0.1:2569:guest`, 'disposed-room:old-token'), VERSION);
  let freshJoins = 0;
  page.on('request', request => { if (request.url().includes('/joinOrCreate/')) freshJoins++; });
  await page.locator('#guest-play').click(); await page.locator('#lobby-play').click();
  await expect(page.locator('#connection-status')).toContainText('Could not connect');
  await expect(page.locator('#join')).toBeVisible();
  await expect(page.locator('#game-loading')).toBeHidden();
  expect(freshJoins).toBe(1);
});

for (const width of [1920, 2560, 390]) test(`main menu waits for Play and exposes account actions at ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: width === 2560 ? 1440 : width === 390 ? 844 : 1080 });
  let sockets = 0;
  page.on('websocket', socket => { if (new URL(socket.url()).port === '2569') sockets++; });
  await page.goto('/'); await page.locator('#guest-play').click();
  await expect(page.locator('#lobby-screen')).toBeVisible();
  await expect(page.locator('#lobby-identity')).toHaveText('GUEST / Temporary');
  await expect(page.locator('canvas')).toHaveCount(0); expect(sockets).toBe(0);
  expect(await page.locator('.lobby-shell').evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('main-menu.png'), fullPage: true });
  await page.locator('#lobby-signup').click();
  await expect(page.locator('#signup-tab')).toHaveAttribute('aria-selected', 'true');
  await page.locator('#guest-play').click();
  await page.locator('#lobby-play').click();
  await expect(page.locator('#connection-status')).toContainText('Connected');
  await page.locator('#game-main-menu').click();
  await expect(page.locator('#lobby-screen')).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(0);
  expect(await page.evaluate(() => Object.keys(sessionStorage).filter(key => key.startsWith('shootball:v')))).toEqual([]);
  await page.locator('#lobby-play').click();
  await expect(page.locator('#connection-status')).toContainText('Connected');
});
