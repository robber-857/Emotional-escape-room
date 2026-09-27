async original => {
 const context=await original.context().browser().newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
 const page=await context.newPage();
 try {
  await page.goto(original.url()); await page.getByText('为了保证用户体验请翻转手机为横屏',{exact:true}).waitFor();
  await page.screenshot({path:'output/playwright/uat/mobile-portrait.png'});
  await page.setViewportSize({width:844,height:390});await page.getByText('为了保证用户体验请翻转手机为横屏',{exact:true}).waitFor({state:'hidden'});
  await page.getByRole('button',{name:'开始探索',exact:true}).click();await page.getByRole('button',{name:'开始探索',exact:true}).waitFor({state:'hidden'});
  await page.locator('body').ariaSnapshot();await page.getByRole('button',{name:'河面',exact:true}).click();await page.locator('body').ariaSnapshot();
  const wait=page.waitForResponse(r=>r.url().endsWith('/actions'));await page.getByRole('button',{name:'是',exact:true}).click();const r=await(await wait).json();if(!r.accepted||r.session.state.scene!=='shore')throw new Error('mobile swim failed');
  await page.getByRole('img',{name:'分离之河：对岸'}).waitFor();await page.screenshot({path:'output/playwright/uat/mobile-landscape.png'});
  return {case:'mobile-portrait-and-landscape',status:'PASS',session_id:r.session.id,version:r.session.version,environment:'Chromium touch emulation; not physical device'};
 } finally {await context.close();}
}
