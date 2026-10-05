async original => {
  const base = original.url().split('/').slice(0, 3).join('/');
  const browser = original.context().browser();
  const results = [];
  const sessionKey = 'emotional:l1:server:v1';
  const pendingKey = 'emotional:l1:pending:v1';
  const fixture = JSON.stringify({
    id: 'cover-fixture', token: 'cover-uat-only', version: 0, rules_version: 'l1-rules-v1',
    state: { scene: 'river', wood: false, woodPlaced: false, repaired: false, bridgeInspected: false,
      ropeClicks: 0, oar: false, bushClicks: 0, rowing: false, strokes: 0, route: null,
      greeted: false, greetedWoman: false, lampTaken: false, lampLit: false, events: [] },
    positions: {},
  }, null, 2);
  const pendingFixture = '{ "sessionId": "cover-fixture", "action_id": "preserve-raw-record" }';
  const check = (ok, message) => { if (!ok) throw Error(message); };
  const cover = page => page.locator('[data-game-cover]');
  const stage = (page, value) => page.locator(`[data-game-cover][data-stage="${value}"]`).waitFor({ timeout: 15000 });
  const screenshot = (page, name) => page.screenshot({ path: `output/playwright/cover/${name}.png` });
  const overflow = page => page.evaluate(() => ({
    horizontal: document.documentElement.scrollWidth > innerWidth + 1,
    vertical: document.documentElement.scrollHeight > innerHeight + 1,
    width: innerWidth, height: innerHeight,
  }));

  async function run(name, options, verify) {
    const context = await browser.newContext({
      viewport: options.viewport || { width: 1440, height: 900 },
      hasTouch: !!options.mobile, isMobile: !!options.mobile,
      reducedMotion: options.reducedMotion ? 'reduce' : 'no-preference',
    });
    const page = await context.newPage();
    const errors = [], apiRequests = [], mockedWrites = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {
      if (new URL(request.url()).pathname.startsWith('/api/v1/')) {
        apiRequests.push({ method: request.method(), path: new URL(request.url()).pathname });
      }
    });
    // Every API request stays local to this context. Even an accidental restart
    // can never create a real journey or depend on the API being available.
    await context.route('**/api/v1/**', async route => {
      const request = route.request(), path = new URL(request.url()).pathname;
      if (request.method() !== 'GET') {
        mockedWrites.push({ method: request.method(), path });
        await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ detail: 'COVER_UAT_WRITE_BLOCKED' }) });
        return;
      }
      if (path.endsWith('/scoring')) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
          source: 'server_database', session_id: 'cover-fixture', status: 'cover_uat',
          levels: {}, ledger: [], actions: [], final: null,
        }) });
        return;
      }
      await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ detail: 'COVER_UAT_READ_NOT_EXPECTED' }) });
    });
    await context.addInitScript(({ storage, sessionKey, pendingKey, fixture, pendingFixture }) => {
      if (storage) {
        localStorage.setItem(sessionKey, fixture);
        localStorage.setItem(pendingKey, pendingFixture);
      }
      const trace = window.__coverUat = { stages: [], coverApiRequests: [], violations: [] };
      const observe = () => {
        const node = document.querySelector('[data-game-cover]');
        if (!node) return;
        const current = Number(node.getAttribute('data-stage'));
        if (trace.stages.at(-1)?.stage !== current) trace.stages.push({ stage: current, at: performance.now() });
        if (document.querySelector('[aria-label="第一幕游戏舞台"]')) trace.violations.push('L1 mounted behind cover');
        if (document.querySelector('[aria-label="服务端计分测试"]')) trace.violations.push('inspector mounted behind cover');
      };
      new MutationObserver(observe).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-stage'] });
      const originalFetch = window.fetch;
      window.fetch = function (input, init) {
        const url = input instanceof Request ? input.url : String(input);
        if (new URL(url, location.href).pathname.startsWith('/api/v1/') && document.querySelector('[data-game-cover]')) {
          trace.coverApiRequests.push({ url, method: init?.method || (input instanceof Request ? input.method : 'GET') });
        }
        return originalFetch.call(this, input, init);
      };
    }, { storage: !!options.storage, sessionKey, pendingKey, fixture, pendingFixture });
    try {
      await page.goto(base + (options.path || '/'), { waitUntil: 'domcontentloaded' });
      const details = await verify({ page, apiRequests, mockedWrites });
      const trace = await page.evaluate(() => window.__coverUat);
      check(trace.coverApiRequests.length === 0, `${name}: API fetch while cover was present: ${JSON.stringify(trace.coverApiRequests)}`);
      check(trace.violations.length === 0, `${name}: ${trace.violations.join(', ')}`);
      check(mockedWrites.length === 0, `${name}: unexpected API write: ${JSON.stringify(mockedWrites)}`);
      check(errors.length === 0, `${name}: browser errors: ${errors.join('; ')}`);
      const fit = await overflow(page);
      check(!fit.horizontal && !fit.vertical, `${name}: viewport overflow: ${JSON.stringify(fit)}`);
      results.push({ name, status: 'PASS', stages: trace.stages.map(value => value.stage), apiRequests, ...details });
    } finally { await context.close(); }
  }

  async function isolation(page, apiRequests) {
    check(await cover(page).count() === 1, 'cover missing');
    check(await page.getByRole('region', { name: '第一幕游戏舞台' }).count() === 0, 'L1 mounted during cover');
    check(await page.getByRole('complementary', { name: '服务端计分测试' }).count() === 0, 'inspector visible during cover');
    check(apiRequests.length === 0, `API request before leaving cover: ${JSON.stringify(apiRequests)}`);
    const fit = await overflow(page);
    check(!fit.horizontal && !fit.vertical, `cover overflow: ${JSON.stringify(fit)}`);
  }
  async function welcome(page, saved = false) {
    await cover(page).waitFor({ state: 'detached', timeout: 15000 });
    await page.getByRole('button', { name: saved ? '继续上次旅程' : '开始探索', exact: true }).waitFor({ timeout: 15000 });
  }
  async function sequence(page) {
    const values = await page.evaluate(() => window.__coverUat.stages);
    check(JSON.stringify(values.map(value => value.stage)) === '[0,1,2,3]', `incorrect intro order: ${JSON.stringify(values)}`);
    check(values[2].at - values[1].at >= 350 && values[3].at - values[2].at >= 700,
      `intro stages advanced too early: ${JSON.stringify(values)}`);
    return values.map(value => ({ stage: value.stage, sinceBlackMs: Math.round(value.at - values[0].at) }));
  }

  await run('desktop-1440x900', {}, async ({ page, apiRequests }) => {
    await stage(page, 3);
    await isolation(page, apiRequests);
    const timings = await sequence(page);
    check(await cover(page).getAttribute('data-mobile') === 'false', 'desktop classified as phone');
    await page.waitForTimeout(1200);
    await screenshot(page, 'desktop-1440x900');
    await page.getByRole('button', { name: '进入你的故事', exact: true }).click();
    await welcome(page);
    check(apiRequests.length === 0, 'entering L1 welcome created or resumed a session');
    await screenshot(page, 'desktop-l1-welcome');
    return { timings };
  });

  await run('narrow-fine-pointer-web-entry', { viewport: { width: 390, height: 844 } }, async ({ page, apiRequests }) => {
    await stage(page, 3);
    await isolation(page, apiRequests);
    check(await cover(page).getAttribute('data-mobile') === 'false', 'narrow desktop classified as phone');
    check(await cover(page).getAttribute('data-portrait') === 'false', 'narrow desktop blocked by rotation guidance');
    await page.getByRole('button', { name: '进入你的故事', exact: true }).waitFor();
    await page.waitForTimeout(1200);
    await screenshot(page, 'narrow-fine-pointer');
    await page.getByRole('button', { name: '进入你的故事', exact: true }).click();
    await welcome(page);
    return {};
  });

  await run('mobile-portrait-sequence-and-rotation', { mobile: true, viewport: { width: 390, height: 844 } }, async ({ page, apiRequests }) => {
    await cover(page).waitFor();
    if (await cover(page).getAttribute('data-stage') === '0') await screenshot(page, 'mobile-00-black');
    await stage(page, 1);
    await page.waitForTimeout(200);
    await screenshot(page, 'mobile-01-light');
    await stage(page, 2);
    await page.waitForTimeout(600);
    await screenshot(page, 'mobile-02-logo');
    await stage(page, 3);
    const timings = await sequence(page);
    await page.getByText('为了保证用户体验请翻转手机为横屏', { exact: true }).waitFor();
    await page.waitForTimeout(2300);
    await isolation(page, apiRequests);
    check(await cover(page).getAttribute('data-exiting') === 'false', 'portrait started exiting');
    await screenshot(page, 'mobile-03-rotate-prompt');
    await page.setViewportSize({ width: 844, height: 390 });
    await page.locator('[data-game-cover][data-portrait="false"]').waitFor();
    await page.waitForTimeout(500);
    check(await cover(page).getAttribute('data-exiting') === 'false', 'landscape skipped its logo hold');
    await isolation(page, apiRequests);
    await screenshot(page, 'mobile-04-landscape-cover');
    await page.locator('[data-game-cover][data-exiting="true"]').waitFor({ timeout: 5000 });
    await welcome(page);
    check(apiRequests.length === 0, 'rotation into L1 welcome created or resumed a session');
    await screenshot(page, 'mobile-05-l1-welcome');
    return { timings };
  });

  await run('small-phone-320x568-and-667x375-fit', { mobile: true, viewport: { width: 320, height: 568 } }, async ({ page, apiRequests }) => {
    await stage(page, 3);
    await page.waitForTimeout(1200);
    await isolation(page, apiRequests);
    check(await cover(page).getAttribute('data-portrait') === 'true', 'small portrait phone bypassed rotation guidance');
    await screenshot(page, 'mobile-small-320x568');
    await page.setViewportSize({ width: 667, height: 375 });
    await page.locator('[data-game-cover][data-portrait="false"]').waitFor();
    await page.waitForTimeout(500);
    await isolation(page, apiRequests);
    await screenshot(page, 'mobile-small-667x375');
    await welcome(page);
    check(apiRequests.length === 0, 'small-phone welcome created or resumed a session');
    await screenshot(page, 'mobile-small-l1-welcome');
    return {};
  });

  await run('rotation-back-cancels-active-fade', { mobile: true, viewport: { width: 390, height: 844 } }, async ({ page, apiRequests }) => {
    await stage(page, 3);
    await page.setViewportSize({ width: 844, height: 390 });
    await page.locator('[data-game-cover][data-exiting="true"]').waitFor({ timeout: 5000 });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('[data-game-cover][data-portrait="true"][data-exiting="false"]').waitFor();
    await page.waitForTimeout(2300);
    await isolation(page, apiRequests);
    await screenshot(page, 'mobile-rotation-cancelled');
    await page.setViewportSize({ width: 844, height: 390 });
    await welcome(page);
    return {};
  });

  await run('initial-wide-phone-landscape', { mobile: true, viewport: { width: 956, height: 440 } }, async ({ page, apiRequests }) => {
    await stage(page, 3);
    await isolation(page, apiRequests);
    check(await cover(page).getAttribute('data-mobile') === 'true', 'wide landscape phone classified as desktop');
    check(await cover(page).getAttribute('data-portrait') === 'false', 'landscape phone asked to rotate');
    const timings = await sequence(page);
    await screenshot(page, 'mobile-wide-landscape-cover');
    await welcome(page);
    return { timings };
  });

  await run('reduced-motion-portrait-and-landscape', { mobile: true, reducedMotion: true, viewport: { width: 390, height: 844 } }, async ({ page, apiRequests }) => {
    await stage(page, 3);
    await page.waitForTimeout(450);
    await isolation(page, apiRequests);
    check(await cover(page).getAttribute('data-exiting') === 'false', 'reduced motion bypassed portrait gate');
    const animation = await page.locator('[data-game-cover] svg g').first().evaluate(node => getComputedStyle(node).animationName);
    check(animation === 'none', `reduced motion retained phone animation: ${animation}`);
    await screenshot(page, 'mobile-reduced-motion');
    const startedAt = Date.now();
    await page.setViewportSize({ width: 844, height: 390 });
    await welcome(page);
    check(Date.now() - startedAt < 2500, 'reduced-motion exit stalled');
    return { exitMs: Date.now() - startedAt };
  });

  await run('saved-journey-raw-values-preserved', { storage: true }, async ({ page, apiRequests }) => {
    await stage(page, 3);
    await isolation(page, apiRequests);
    const before = await page.evaluate(({ sessionKey, pendingKey }) => [localStorage.getItem(sessionKey), localStorage.getItem(pendingKey)], { sessionKey, pendingKey });
    check(before[0] === fixture && before[1] === pendingFixture, 'cover rewrote raw saved journey or pending record');
    await page.getByRole('button', { name: '进入你的故事', exact: true }).click();
    await welcome(page, true);
    const after = await page.evaluate(({ sessionKey, pendingKey }) => [localStorage.getItem(sessionKey), localStorage.getItem(pendingKey)], { sessionKey, pendingKey });
    check(after[0] === fixture && after[1] === pendingFixture, 'L1 welcome rewrote saved journey or pending record');
    check(apiRequests.every(request => request.method === 'GET' && request.path.endsWith('/scoring')), 'welcome resumed a saved journey without clicking continue');
    await screenshot(page, 'saved-journey-welcome');
    return { storagePreserved: true };
  });

  await run('l2-direct-entry-has-no-cover', { path: '/l2' }, async ({ page }) => {
    await page.getByRole('alert').filter({ hasText: '请先完成第一幕' }).waitFor({ timeout: 15000 });
    check(await cover(page).count() === 0, 'cover displayed on /l2');
    await screenshot(page, 'l2-direct-entry');
    return {};
  });

  await run('restart-query-waits-behind-cover', { path: '/?restart=1', storage: true }, async ({ page, apiRequests }) => {
    await stage(page, 3);
    await page.waitForTimeout(2300);
    await isolation(page, apiRequests);
    check(new URL(page.url()).searchParams.get('restart') === '1', 'cover consumed restart query prematurely');
    const stored = await page.evaluate(key => localStorage.getItem(key), sessionKey);
    check(stored === fixture, 'restart query replaced save while cover remained');
    await screenshot(page, 'restart-query-cover');
    return { writesDuringCover: 0 };
  });

  return {
    status: 'PASS', cases: results,
    environment: 'Chromium desktop and touch emulation; mocked API; no real journeys created; not physical-device UAT',
    screenshots: 'output/playwright/cover/',
  };
}
