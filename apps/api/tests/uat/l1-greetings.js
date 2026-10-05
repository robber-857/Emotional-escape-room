async original => {
  const base = original.url().split('/').slice(0, 3).join('/');
  const results = [];
  const cases = [
    { man: 'yes', woman: 'no' },
    { man: 'no', woman: 'skipped' },
    { man: 'skipped', woman: 'yes' },
    { man: 'skipped', woman: 'skipped', untouched: true },
  ];
  const names = { man: '右侧岸边的男子', woman: '左侧草地的女子' };
  const choices = { man: 'greet', woman: 'greet-woman' };
  const values = { yes: -2, no: 2, skipped: 0 };
  for (const mobile of [false, true]) {
    for (const scenario of cases) {
      const context = await original.context().browser().newContext({
        viewport: mobile ? { width: 844, height: 390 } : { width: 1440, height: 900 },
        hasTouch: mobile,
        isMobile: mobile,
      });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      const check = (ok, message) => { if (!ok) throw Error(message); };
      const activate = locator => mobile ? locator.tap() : locator.click();
      const click = name => activate(page.getByRole('button', { name, exact: true }));
      const idle = name => page.waitForFunction(name =>
        document.querySelector(`[aria-label="${name}"]`)?.getAttribute('aria-disabled') === 'false', name);
      const score = () => page.evaluate(async () => {
        const auth = JSON.parse(localStorage.getItem('emotional:l1:server:v1'));
        const response = await fetch(`/api/v1/sessions/${auth.id}/scoring`, {
          headers: { Authorization: `Bearer ${auth.token}` }, cache: 'no-store',
        });
        if (!response.ok) throw Error(`scoring HTTP ${response.status}`);
        return response.json();
      });
      const state = () => page.evaluate(() => JSON.parse(localStorage.getItem('emotional:l1:server:v1')).state);
      const greetings = summary => summary.ledger.filter(e => e.group_id.startsWith('l1.talk.'));
      const settlements = summary => summary.actions.filter(a => a.action.type === 'greeting-finalize');
      const panel = page.getByRole('complementary', { name: '服务端计分测试' });
      const toggle = () => activate(panel.getByRole('button', { name: /^服务端计分/ }));
      const answer = async (choice, yes) => {
        const waiting = page.waitForResponse(r => r.url().endsWith('/actions') &&
          r.request().method() === 'POST' && r.request().postDataJSON()?.action?.choice === choice);
        await click(yes ? '是' : '否');
        const result = await (await waiting).json();
        check(result.accepted, `choice ${choice} rejected: ${result.code}`);
        if (choice !== 'enter') await idle(names.man);
        return result;
      };
      const checkPending = async result => {
        check(result.score_effect.reason === 'AWAITING_L2_ENTRY', 'greeting did not await actual L2 entry');
        check(result.score_effect.events.length === 0, 'greeting emitted an early score event');
        check(Object.values(result.score_effect.delta).every(v => v === null), 'greeting changed score before L2');
        check(greetings(await score()).length === 0, 'early greeting ledger entry');
        await toggle();
        const row = panel.locator(`[data-score-action-id="${result.score_effect.action_id}"]`);
        await row.waitFor();
        check((await row.textContent()).includes('已记录，进入第二幕时结算'), 'Chinese waiting reason absent');
        await toggle();
      };
      try {
        await page.goto(base + '/');
        await click('开始探索');
        await idle('河面');
        await page.locator('body').ariaSnapshot();
        await click('河面');
        await answer('swim', true);
        for (const person of ['man', 'woman']) {
          const outcome = scenario[person];
          if (outcome === 'skipped' && scenario.untouched) continue;
          const before = await state();
          await page.locator('body').ariaSnapshot();
          await click(names[person]);
          if (outcome === 'skipped') {
            await click('关闭提示，继续探索');
            check(JSON.stringify((await state()).events) === JSON.stringify(before.events), 'closing prompt invented a greeting answer');
            check(greetings(await score()).length === 0, 'closing prompt scored a greeting');
            continue;
          }
          // An explicit refusal remains retryable; a later accepted yes is the final outcome.
          const declined = await answer(choices[person], false);
          await checkPending(declined);
          if (outcome === 'yes') {
            await click(names[person]);
            await checkPending(await answer(choices[person], true));
            await click('关闭提示，继续探索');
          }
        }
        const answered = await state();
        await page.reload();
        await click('继续上次旅程');
        await idle(names.man);
        check(JSON.stringify((await state()).events) === JSON.stringify(answered.events), 'refresh lost accepted greeting evidence');
        check(greetings(await score()).length === 0, 'refresh settled greetings before L2');
        await click('房门');
        const completed = await answer('enter', true);
        await page.getByRole('link', { name: '进入第二幕', exact: true }).waitFor();
        check(!completed.score_effect.events.some(e => e.group_id.startsWith('l1.talk.')), 'entering L1 door settled greetings');
        const beforeL2 = await score();
        check(!beforeL2.levels.l1.complete && beforeL2.levels.l1.axes.V.normalized === null, 'L1 score finalized before actual L2 start');
        check(greetings(beforeL2).length === 0 && settlements(beforeL2).length === 0, 'early greeting settlement receipt');
        await page.reload();
        await click('继续上次旅程');
        await page.getByRole('link', { name: '进入第二幕', exact: true }).waitFor();
        check(greetings(await score()).length === 0, 'refreshing completed L1 settled greetings');
        await page.locator('body').ariaSnapshot();
        await activate(page.getByRole('link', { name: '进入第二幕', exact: true }));
        await page.waitForURL('**/l2');
        await idle('走到桌边');
        const settled = await score();
        const rows = greetings(settled);
        check(rows.length === 2 && settlements(settled).length === 1, 'actual L2 entry did not settle exactly two greetings');
        for (const person of ['man', 'woman']) {
          const row = rows.find(e => e.group_id === `l1.talk.${person}`);
          const outcome = scenario[person];
          check(row?.option_id === outcome && row.status === 'applied', `${person} outcome differs from accepted evidence`);
          check(row.vector.V === values[outcome] && row.vector.A === null && row.vector.T === null && row.vector.F === null, `${person} greeting vector incorrect`);
          check(row.cutoff_version === completed.session.version && row.evidence.settlement === 'l2-entry', `${person} cutoff evidence incorrect`);
          const acceptedIds = answered.events.filter(e => e.action.choice === choices[person]).map(e => e.id);
          check(JSON.stringify(row.evidence.greeting_action_ids) === JSON.stringify(acceptedIds), `${person} accepted greeting evidence missing`);
        }
        const expectedV = values[scenario.man] + values[scenario.woman];
        check(settled.levels.l1.complete && settled.levels.l1.axes.V.raw === expectedV, 'L1 final V sum incorrect');
        check(settled.levels.l1.axes.A.normalized === 0 && settled.levels.l1.axes.F.normalized === 0, 'unrelated L1 normalization changed');
        check(settlements(settled)[0].delta.V === expectedV, 'synthetic settlement delta incorrect');
        await toggle();
        await panel.locator(`[data-score-action-id="${settlements(settled)[0].action_id}"]`).waitFor();
        check((await panel.textContent()).includes('进入第二幕：结算人物打招呼选择'), 'synthetic settlement action label absent');
        await page.screenshot({ path: `output/playwright/l1-greetings-${mobile ? 'touch' : 'desktop'}-${scenario.man}-${scenario.woman}.png` });
        await page.reload();
        await idle('走到桌边');
        const repeated = await score();
        check(JSON.stringify(greetings(repeated)) === JSON.stringify(rows), 'L2 refresh duplicated or changed greeting ledger');
        check(JSON.stringify(settlements(repeated)) === JSON.stringify(settlements(settled)), 'L2 refresh duplicated settlement receipt');
        check(errors.length === 0, errors.join('; '));
        results.push({ mode: mobile ? 'touch' : 'desktop', status: 'PASS', session_id: settled.session_id,
          man: scenario.man, woman: scenario.woman, untouched: !!scenario.untouched,
          V: expectedV, greeting_count: rows.length, settlement_count: settlements(repeated).length });
      } catch (error) {
        throw Error(`${mobile ? 'touch' : 'desktop'} ${scenario.man}/${scenario.woman}: ${error.message}\n${await page.locator('body').ariaSnapshot()}`);
      } finally {
        await context.close();
      }
    }
  }
  return results;
}
