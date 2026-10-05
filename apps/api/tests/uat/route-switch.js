async original => {
  const context = await original.context().browser().newContext({
    viewport: { width: 956, height: 440 }, hasTouch: true, isMobile: true,
  });
  const page = await context.newPage();
  const check = (ok, message) => { if (!ok) throw new Error(message); };
  const tap = async name => {
    await page.getByRole('button', { name, exact: true }).tap();
    await page.locator('body').ariaSnapshot();
  };
  const enterCover = async () => {
    const cover = page.locator('[data-game-cover]');
    await page.waitForFunction(() => {
      const cover = document.querySelector('[data-game-cover]');
      return !cover || cover.getAttribute('data-stage') === '3';
    });
    await page.locator('body').ariaSnapshot();
    if (await cover.count() && await cover.getAttribute('data-mobile') === 'false')
      await page.getByRole('button', { name: '进入你的故事', exact: true }).click();
    await cover.waitFor({ state: 'hidden' });
    await page.locator('body').ariaSnapshot();
  };
  const action = async name => {
    const response = page.waitForResponse(r => r.url().endsWith('/actions') && r.request().method() === 'POST');
    await tap(name);
    const result = await (await response).json();
    check(result.accepted, result.code);
    return result;
  };
  const results = [];
  try {
    await page.goto(original.url());
    await enterCover();
    await tap('开始探索');
    for (const route of ['swim', 'ring', 'boat']) {
      if (results.length) {
        await tap('打开游戏菜单'); await tap('重新开始旅程'); await tap('确认重新开始');
      }
      await action('草丛');
      for (let i = 1; i < 5; i++) await action(`拨开草丛 · ${i} / 5`);
      await action('是');
      let result = await action('划桨一次 0 / 5');
      check(result.session.state.strokes === 1, 'first stroke');
      await tap('关闭提示，继续探索');
      await tap('河面');
      await page.getByRole('heading', { name: '直接游泳过去？' }).waitFor();
      await page.screenshot({ path: `output/playwright/route-switch/${route}-choice.png` });
      if (route === 'swim') result = await action('是');
      else {
        await action('否');
        await tap('小船');
        await page.getByRole('heading', { name: '划向对岸 · 1 / 5' }).waitFor();
        if (route === 'ring') {
          await tap('救生圈，可拖动；方向键微调位置');
          await page.getByRole('heading', { name: '使用救生圈游过去？' }).waitFor();
          result = await action('是');
        } else {
          await page.reload();
          await enterCover();
          await tap('继续上次旅程');
          await tap('小船');
          for (let i = 1; i < 5; i++) result = await action(`划桨一次 ${i} / 5`);
        }
      }
      check(result.session.state.route === route, `wrong route: ${route}`);
      check(result.session.state.rowing === false, 'rowing remained active after arrival');
      await page.getByRole('img', { name: '分离之河：对岸' }).waitFor();
      results.push({ route, strokes: result.session.state.strokes, status: 'PASS' });
    }
    return { status: 'PASS', results, environment: 'Chromium 956x440 touch emulation; not a physical device' };
  } finally { await context.close(); }
}
