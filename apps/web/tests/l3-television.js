async original=>{
 const base=original.url().split('/').slice(0,3).join('/'),results=[];
 for(const mobile of [false,true]){
  const ctx=await original.context().browser().newContext({viewport:mobile?{width:844,height:390}:{width:1280,height:720},hasTouch:mobile,isMobile:mobile});const page=await ctx.newPage();
  const click=async name=>{const b=page.getByRole('button',{name,exact:true});await(mobile?b.tap():b.click());};
  try{
   await page.goto(base+'/l3?preview=1');await page.locator('[data-television-power=on] [data-layer=tv-screen]').waitFor();
   await click('查看半开的门');await click('是');await click('查看敞开的门');await click('是');
   for(let i=0;i<2;i++){await click('查看电视机电源开关');await page.getByRole('heading',{name:'要关掉电视机电源吗？'}).waitFor();await click('否');await page.getByRole('region',{name:'场景提示',exact:true}).waitFor({state:'hidden'});await page.locator('[data-television-power=on] [data-layer=tv-screen]').waitFor();}
   await click('查看电视机电源开关');await click('是');await page.locator('[data-television-power=off]').waitFor();
   if(await page.locator('[data-layer=tv-screen]').count())throw Error('TV remains noisy after power off');
   await page.reload();await page.locator('[data-television-power=off]').waitFor();
   await page.screenshot({path:`output/playwright/l3-tv-off-${mobile?'mobile':'desktop'}.png`});
   for(const name of ['坐稳等待','查看右窗窗帘','查看左窗']){await click(name);await click('否');}
   await page.waitForURL('**/l3?preview=1&segment=carry&from=storm');await page.locator('[data-television-power=off]').waitFor();await page.reload();await page.locator('[data-television-power=off]').waitFor();
   results.push({mobile,status:'PASS'});
  }finally{await ctx.close();}
 }return results;
}
