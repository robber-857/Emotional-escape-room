async page => {
  const cover = page.locator('[data-game-cover]');
  await page.waitForFunction(() => {
    const node = document.querySelector('[data-game-cover]');
    return !node || node.getAttribute('data-stage') === '3';
  });
  await page.locator('body').ariaSnapshot();
  if (await cover.count() && await cover.getAttribute('data-mobile') === 'false') {
    await page.getByRole('button', { name: '进入你的故事', exact: true }).click();
  }
  await cover.waitFor({ state: 'hidden' });
  await page.locator('body').ariaSnapshot();
  return { case: 'cover-entry', status: 'PASS' };
}
