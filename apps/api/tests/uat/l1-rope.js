async original => {
  const results = [];
  for (const mobile of [false, true]) {
    const context = await original.context().browser().newContext({
      viewport: mobile ? {width: 844, height: 390} : {width: 1280, height: 720},
      hasTouch: mobile, isMobile: mobile,
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const check = (ok, message) => { if (!ok) throw new Error(message); };
    const snap = () => page.locator('body').ariaSnapshot();
    const button = name => page.getByRole('button', {name, exact: true});
    const click = async name => { if (mobile) await button(name).tap(); else await button(name).click(); await snap(); };
    const idle = () => page.waitForFunction(() => document.querySelector('[data-layer="rope"]')?.getAttribute('aria-disabled') === 'false');
    const step = async (name, keyboard = false) => {
      const response = page.waitForResponse(r => r.url().endsWith('/actions') && r.request().method() === 'POST');
      if (keyboard) { await button(name).focus(); await page.keyboard.press('Enter'); } else await click(name);
      const result = await (await response).json();
      check(result.accepted, result.code);
      await idle(); await snap();
      return result.session;
    };
    try {
      await page.goto(new URL('/', original.url()).href);
      await snap(); await click('开始探索'); await idle();
      const rope = page.locator('[data-layer="rope"]');
      check(await rope.getAttribute('transform') === 'translate(350 -490)', 'rope is not hanging');
      await button('绳子').focus(); await page.keyboard.press('ArrowLeft');
      check(await rope.getAttribute('transform') === 'translate(350 -490)', 'hanging rope moved');
      await page.screenshot({path: `output/playwright/l1-rope-${mobile ? 'touch' : 'desktop'}-hanging.png`});
      for (let n = 1; n <= 3; n++) {
        const session = await step('绳子');
        check(session.state.ropeClicks === n, 'click counted incorrectly');
        check((await snap()).includes(`再点击${5 - n}次就可以拿下来了。`), 'wrong remaining prompt');
      }
      await page.reload(); await snap(); await click('继续上次旅程'); await idle();
      check(await rope.getAttribute('transform') === 'translate(350 -490)', 'refresh released rope');
      const fourth = await step('绳子', !mobile);
      check(fourth.state.ropeClicks === 4, 'refresh lost progress');
      check((await snap()).includes('再点击1次就可以拿下来了。'), 'fourth prompt missing');
      const fifth = await step('拿下绳子 · 4 / 5');
      check(fifth.state.ropeClicks === 5, 'fifth click did not release');
      check(await rope.getAttribute('transform') === 'translate(0 0)', 'rope did not land at original position');
      check(await button('绳子，可拖动；方向键微调位置').count() === 1, 'released rope not draggable');
      await page.screenshot({path: `output/playwright/l1-rope-${mobile ? 'touch' : 'desktop'}-released.png`});
      const receipts = await page.evaluate(async () => {
        const s = JSON.parse(localStorage.getItem('emotional:l1:server:v1'));
        return (await fetch(`/api/v1/sessions/${s.id}/events`, {headers:{Authorization:`Bearer ${s.token}`}})).json();
      });
      check(receipts.filter(r => r.accepted && r.action.choice === 'take-rope').length === 5, 'receipt count wrong');
      await page.reload(); await snap(); await click('继续上次旅程'); await idle();
      check(await rope.getAttribute('transform') === 'translate(0 0)', 'released rope reset after reload');
      if (!mobile) {
        const drag = async (x, y) => {
          const points = await page.getByRole('img', {name:'分离之河：河岸'}).evaluate((el, [x,y]) => {
            const m = el.getScreenCTM();
            return [[x,y],[960,1160]].map(([a,b]) => {const p = new DOMPoint(a,b).matrixTransform(m); return {x:p.x,y:p.y};});
          }, [x,y]);
          await page.mouse.move(points[0].x, points[0].y); await page.mouse.down();
          await page.mouse.move(points[1].x, points[1].y, {steps:15}); await page.mouse.up(); await snap();
        };
        await drag(2446.355,1426.75);
        const repair = page.waitForResponse(r => r.url().endsWith('/actions') && r.request().postDataJSON()?.action?.choice === 'repair');
        await drag(2104.5,1413.5);
        const result = await (await repair).json();
        check(result.accepted && result.session.state.repaired && result.session.state.scene === 'river', 'released rope failed to repair bridge');
        await page.getByRole('heading',{name:'从桥上走过去？'}).waitFor();
      }
      check(errors.length === 0, errors.join('\n'));
      results.push({mode:mobile ? 'touch' : 'desktop', status:'PASS', clicks:5, refresh:true, receipts:5, bridge:!mobile});
    } finally { await context.close(); }
  }
  return results;
}
