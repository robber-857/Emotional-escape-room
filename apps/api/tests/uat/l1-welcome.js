async original => {
  const base = original.url().split('/').slice(0, 3).join('/');
  const browser = original.context().browser();
  const results = [];
  const sessionKey = 'emotional:l1:server:v1';
  const pendingKey = 'emotional:l1:pending:v1';
  const check = (ok, message) => { if (!ok) throw Error(message); };
  const clone = value => JSON.parse(JSON.stringify(value));
  const initialState = () => ({
    scene: 'river', wood: false, woodPlaced: false, repaired: false, bridgeInspected: false,
    ropeClicks: 0, oar: false, bushClicks: 0, rowing: false, strokes: 0, route: null,
    greeted: false, greetedWoman: false, lampTaken: false, lampLit: false, events: [],
  });
  const session = () => ({
    id: '10101010-1010-4010-8010-101010101010', token: 'l1-welcome-mock-only',
    version: 0, rules_version: 'l1-rules-v5-wood-placement', state: initialState(), positions: {},
  });
  const event = (id, action) => ({ id, at: '2026-10-05T23:00:00.000Z', action });
  const refusalAction = { type: 'choose', choice: 'swim', yes: false };
  const refusalId = '20202020-2020-4020-8020-202020202020';
  const refused = { ...session(), version: 1,
    state: { ...initialState(), events: [event(refusalId, refusalAction)] } };
  const pending = { sessionId: session().id, action_id: refusalId, expected_version: 0,
    action: refusalAction, positions: {} };
  const completed = { ...session(), version: 2,
    state: { ...initialState(), scene: 'complete', route: 'swim', events: [
      event('30303030-3030-4030-8030-303030303030', { type: 'choose', choice: 'swim', yes: true }),
      event('40404040-4040-4040-8040-404040404040', { type: 'choose', choice: 'enter', yes: true }),
    ] } };
  const scenarios = [
    { name: 'first-visit', label: '开始探索', create: true, refresh: true },
    { name: 'empty-session', label: '开始探索', saved: session() },
    { name: 'legacy-empty-session', label: '开始探索', saved: { ...session(), rules_version: 'l1-rules-v1',
      state: { ...initialState(), ropeClicks: 5, bridgeInspected: true } } },
    { name: 'accepted-refusal', label: '继续上次旅程', saved: refused },
    { name: 'malformed-pending-preserves-journey', label: '继续上次旅程', saved: refused, rawPending: '{', blocked: true },
    { name: 'lost-response-pending', label: '继续上次旅程', saved: session(), pending, remote: refused },
    { name: 'nonzero-draft', label: '继续上次旅程', saved: session(), draft: { ring: { x: 0.07, y: -0.03 } } },
    { name: 'completed-l1', label: '继续上次旅程', saved: completed, complete: true },
  ];

  for (const mobile of [false, true]) {
    for (const scenario of scenarios) {
      const mode = mobile ? 'touch-landscape' : 'desktop';
      const name = `${mode}-${scenario.name}`;
      const context = await browser.newContext({
        viewport: mobile ? { width: 844, height: 390 } : { width: 1440, height: 900 },
        hasTouch: mobile, isMobile: mobile, serviceWorkers: 'block',
      });
      const page = await context.newPage();
      const errors = [], apiRequests = [], unexpected = [], actionBodies = [];
      let serverSession = clone(scenario.remote || scenario.saved || session());
      let clickedPrimary = false;
      const rawSaved = scenario.saved ? JSON.stringify(scenario.saved) : null;
      const rawPending = scenario.rawPending ?? (scenario.pending ? JSON.stringify(scenario.pending) : null);
      const rawDraft = scenario.draft ? JSON.stringify(scenario.draft) : null;
      const draftKey = `emotional:l1:draft:${serverSession.id}`;
      const snapshot = () => { const { token, ...value } = serverSession; return value; };
      const receipt = () => ({ action_id: refusalId, received_at: '2026-10-05T23:00:00.000Z',
        accepted: true, code: 'ACCEPTED', version: 1, duplicate: false, action: refusalAction });
      const activate = locator => mobile ? locator.tap() : locator.click();
      const screenshot = suffix => page.screenshot({ path: `output/playwright/l1-welcome/${name}-${suffix}.png` });
      const stored = () => page.evaluate(({ sessionKey, pendingKey, draftKey }) => ({
        session: localStorage.getItem(sessionKey), pending: localStorage.getItem(pendingKey), draft: localStorage.getItem(draftKey),
      }), { sessionKey, pendingKey, draftKey });
      const creates = () => apiRequests.filter(request => request.method === 'POST' && request.path === '/api/v1/sessions');
      const writes = () => apiRequests.filter(request => request.method !== 'GET');

      page.on('pageerror', error => errors.push(error.message));
      page.on('request', request => {
        const path = new URL(request.url()).pathname;
        if (path.startsWith('/api/v1/')) apiRequests.push({ method: request.method(), path });
      });
      // Intercept every API endpoint, including accidental writes. No scenario
      // reaches a real API or creates a real journey.
      await context.route('**/api/v1/**', async route => {
        const request = route.request(), path = new URL(request.url()).pathname;
        const respond = (status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
        if (request.method() === 'GET' && path === `/api/v1/sessions/${serverSession.id}/scoring`) {
          await respond(200, { source: 'server_database', session_id: serverSession.id,
            status: 'welcome_uat', levels: {}, ledger: [], actions: [], final: null });
          return;
        }
        if (request.method() === 'GET' && path === `/api/v1/sessions/${serverSession.id}` && clickedPrimary) {
          await respond(200, snapshot()); return;
        }
        if (request.method() === 'GET' && path === `/api/v1/sessions/${serverSession.id}/events` && clickedPrimary) {
          await respond(200, serverSession.state.events.map(value => ({
            ...receipt(), action_id: value.id, action: value.action, version: serverSession.version,
          }))); return;
        }
        if (request.method() === 'POST' && path === '/api/v1/sessions' && scenario.create && clickedPrimary) {
          check(JSON.stringify(request.postDataJSON()) === '{}', `${name}: invalid create payload`);
          await respond(201, serverSession); return;
        }
        if (request.method() === 'POST' && path === `/api/v1/sessions/${serverSession.id}/actions` && scenario.pending && clickedPrimary) {
          const body = request.postDataJSON(); actionBodies.push(body);
          // The server already accepted this exact request before the client
          // lost its response. Retry returns the existing receipt and snapshot.
          await respond(200, { ...receipt(), duplicate: true, session: snapshot() }); return;
        }
        unexpected.push({ method: request.method(), path, beforeClick: !clickedPrimary });
        await respond(503, { detail: 'L1_WELCOME_UAT_UNEXPECTED_REQUEST' });
      });
      await context.addInitScript(({ sessionKey, pendingKey, draftKey, rawSaved, rawPending, rawDraft }) => {
        // Seed once per isolated tab so reload can validate the session that
        // the page itself stored, rather than restoring the original fixture.
        if (sessionStorage.getItem('l1-welcome-uat-seeded')) return;
        if (rawSaved !== null) localStorage.setItem(sessionKey, rawSaved);
        if (rawPending !== null) localStorage.setItem(pendingKey, rawPending);
        if (rawDraft !== null) localStorage.setItem(draftKey, rawDraft);
        sessionStorage.setItem('l1-welcome-uat-seeded', '1');
      }, { sessionKey, pendingKey, draftKey, rawSaved, rawPending, rawDraft });

      async function welcome(label) {
        const cover = page.locator('[data-game-cover]');
        await page.waitForFunction(() => {
          const cover = document.querySelector('[data-game-cover]');
          return !cover || cover.getAttribute('data-stage') === '3';
        });
        if (!mobile) {
          await page.locator('body').ariaSnapshot();
          await page.getByRole('button', { name: '进入你的故事', exact: true }).click();
        }
        // Landscape phones enter automatically after the logo hold/fade.
        await cover.waitFor({ state: 'detached', timeout: 15000 });
        await page.getByRole('button', { name: label, exact: true }).waitFor({ timeout: 15000 });
        await page.locator('body').ariaSnapshot();
      }
      async function playing(resumeResponse) {
        if (scenario.blocked) {
          await resumeResponse;
          await page.getByRole('button', { name: '重试同步 / 载入服务器进度', exact: true }).waitFor();
          await page.waitForFunction(() => {
            const primary = document.querySelector('.welcomeActions .primary');
            const retry = document.querySelector('.syncStatus button');
            const status = document.querySelector('.syncStatus p');
            return primary && !primary.disabled && retry && !retry.disabled && status?.textContent &&
              status.textContent !== '正在等待服务器校验…';
          });
          check(await page.getByRole('button', { name: scenario.label, exact: true }).isVisible(),
            `${name}: unreadable pending request should keep the journey on its welcome screen`);
        } else if (scenario.complete) {
          await page.getByRole('link', { name: '进入第二幕', exact: true }).waitFor();
        } else {
          await page.waitForFunction(() =>
            document.querySelector('[aria-label="河面"]')?.getAttribute('aria-disabled') === 'false');
        }
      }

      try {
        await page.goto(base + '/', { waitUntil: 'domcontentloaded' });
        await welcome(scenario.label);
        check(writes().length === 0, `${name}: automatic API write before choosing to start/continue`);
        check(apiRequests.every(request => request.method === 'GET' && request.path.endsWith('/scoring')),
          `${name}: welcome automatically resumed a journey`);
        const before = await stored();
        check(before.session === rawSaved && before.pending === rawPending && before.draft === rawDraft,
          `${name}: welcome changed the stored session, pending request, or draft`);
        const hasProgress = scenario.label === '继续上次旅程';
        check(await page.getByRole('button', { name: '重新开始', exact: true }).count() === Number(hasProgress),
          `${name}: restart visibility does not match actual progress`);
        check(await page.getByRole('button', { name: hasProgress ? '开始探索' : '继续上次旅程', exact: true }).count() === 0,
          `${name}: wrong welcome primary action is present`);
        if (scenario.blocked) {
          await page.getByText('浏览器存储无法读取，请检查站点存储权限。', { exact: true }).waitFor();
        }
        await screenshot('welcome');

        const resumeResponse = scenario.blocked ? page.waitForResponse(response =>
          response.request().method() === 'GET' && new URL(response.url()).pathname === `/api/v1/sessions/${serverSession.id}`) : null;
        clickedPrimary = true;
        await activate(page.getByRole('button', { name: scenario.label, exact: true }));
        await playing(resumeResponse);
        const after = await stored(), auth = JSON.parse(after.session);
        check(auth.id === serverSession.id && auth.token === serverSession.token, `${name}: journey credentials changed`);
        check(creates().length === Number(!!scenario.create), `${name}: clicking start/continue unexpectedly created a journey`);
        if (scenario.saved) {
          check(apiRequests.some(request => request.method === 'GET' && request.path === `/api/v1/sessions/${scenario.saved.id}`),
            `${name}: saved journey was not resumed`);
        }
        if (scenario.pending) {
          const { sessionId, ...expected } = scenario.pending;
          check(actionBodies.length === 1 && JSON.stringify(actionBodies[0]) === JSON.stringify(expected),
            `${name}: retry did not preserve the original action_id, version, action, and positions`);
          check(after.pending === null && auth.version === 1 && auth.state.events.length === 1,
            `${name}: lost-response retry duplicated or failed to recover the accepted action`);
        } else {
          check(actionBodies.length === 0, `${name}: fabricated a gameplay action when resuming`);
        }
        if (scenario.blocked) {
          check(after.pending === rawPending && writes().length === 0,
            `${name}: unreadable pending record was changed or caused an API write`);
          check(JSON.stringify(auth.state.events) === JSON.stringify(scenario.saved.state.events),
            `${name}: unreadable pending record caused accepted progress to be discarded`);
        }
        if (scenario.draft) {
          check(after.draft === rawDraft, `${name}: resume changed cosmetic draft`);
          const transform = await page.locator('[data-layer="ring"]').getAttribute('transform');
          const [x, y] = transform.match(/[-+]?\d*\.?\d+/g).map(Number);
          check(Math.abs(x - scenario.draft.ring.x * 2944) < 0.001 && Math.abs(y - scenario.draft.ring.y * 1568) < 0.001,
            `${name}: saved draft was not restored on the scene`);
        }
        if (scenario.complete) check(auth.state.scene === 'complete', `${name}: completed L1 was reset`);
        await screenshot(scenario.blocked ? 'resume-blocked' : 'resumed');

        if (scenario.refresh) {
          const writeCount = writes().length;
          await page.reload({ waitUntil: 'domcontentloaded' });
          await welcome('开始探索');
          check(writes().length === writeCount, `${name}: refreshing an untouched journey created a session`);
          check(await page.getByRole('button', { name: '重新开始', exact: true }).count() === 0,
            `${name}: untouched session offers restart after refresh`);
          check(JSON.parse((await stored()).session).id === auth.id, `${name}: refresh discarded the empty session`);
          await screenshot('untouched-refresh');
        }
        check(unexpected.length === 0, `${name}: unexpected API calls ${JSON.stringify(unexpected)}`);
        check(errors.length === 0, `${name}: page errors ${errors.join('; ')}`);
        results.push({ mode, name: scenario.name, status: 'PASS', welcome: scenario.label,
          sessionReused: !scenario.create, sessionCreates: creates().length, actionRetries: actionBodies.length,
          untouchedRefresh: !!scenario.refresh, blockedPendingPreserved: !!scenario.blocked });
      } catch (error) {
        throw Error(`${name}: ${error.message}\n${await page.locator('body').ariaSnapshot()}`);
      } finally { await context.close(); }
    }
  }
  return { status: 'PASS', cases: results,
    environment: 'Chromium desktop and touch landscape emulation; fully mocked API; no real journeys created; not physical-device UAT',
    screenshots: 'output/playwright/l1-welcome/' };
}
