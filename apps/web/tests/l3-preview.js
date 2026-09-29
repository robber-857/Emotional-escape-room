async original => {
 const results=[];const base=original.url().split('/').slice(0,3).join('/');
 for(const mobile of [false,true]) {
  const ctx=await original.context().browser().newContext({viewport:mobile?{width:844,height:390}:{width:1280,height:720},hasTouch:mobile,isMobile:mobile});
  const page=await ctx.newPage(),errors=[],api=[];
  page.on('pageerror',e=>errors.push(e.message));ctx.on('request',r=>{if(r.url().includes('/api/'))api.push(r.url());});
  const click=async name=>{const b=page.getByRole('button',{name,exact:true});if(mobile)await b.tap();else await b.click();};
  const ready=()=>page.getByRole('button',{name:'查看半开的门',exact:true}).waitFor({state:'visible'}).then(()=>page.waitForFunction(()=>document.querySelector('[aria-label="查看半开的门"]')?.getAttribute('aria-disabled')==='false'));
  const key='emotional:l3:preview:v1:storm',carry='emotional:l3:preview:v1:carry';
  const repeatNo=async name=>{const before=await page.evaluate(k=>localStorage.getItem(k),key);for(let i=0;i<3;i++){await click(name);await click('否');await page.getByRole('region',{name:'场景提示',exact:true}).waitFor({state:'hidden'});}if(await page.evaluate(k=>localStorage.getItem(k),key)!==before)throw Error('repeat refusal duplicated events');};
  const read=async k=>page.evaluate(k=>JSON.parse(localStorage.getItem(k)),k);
  const check=async()=>{const size=page.viewportSize();if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('horizontal overflow');for(const label of ['场景提示','物品近景选择']){const region=page.getByRole('region',{name:label,exact:true});const box=await region.count()?await region.boundingBox():null;if(box&&(box.x<0||box.y<0||box.x+box.width>size.width+1||box.y+box.height>size.height+1))throw Error('clipped '+label);}};
  try {
   await page.goto(base+'/l3');await page.getByRole('heading',{name:'L3 尚未接入正式旅程'}).waitFor();
   await page.goto(base+'/l3?preview=1');await ready();
   if(await page.getByRole('navigation',{name:'风暴互动'}).count()||await page.getByRole('button',{name:'查看左窗',exact:true}).count()||await page.getByRole('button',{name:'坐稳等待',exact:true}).count())throw Error('future actions exposed before storm');
   await page.evaluate(()=>{localStorage.setItem('emotional:l1:untouched','sentinel-l1');localStorage.setItem('emotional:l2:preview:v2','sentinel-l2');});
   await page.screenshot({path:`output/playwright/l3-entry-${mobile?'mobile':'desktop'}.png`});
   await click('查看半开的门');await check();await click('关闭提示，继续探索');if(await read(key))throw Error('dismiss wrote a decision');
   await click('查看半开的门');await click('否');await page.reload();await ready();if((await read(key)).events.length!==1)throw Error('refusal lost');
   await repeatNo('查看半开的门');await click('查看半开的门');await click('是');await click('查看敞开的门');await click('否');
   if(await page.locator('[data-layer="storm"]').count())throw Error('refusal triggered storm');
   await repeatNo('查看敞开的门');await click('查看敞开的门');await click('是');await page.locator('[data-layer="storm"]').waitFor();
   await page.screenshot({path:`output/playwright/l3-contextual-storm-${mobile?'mobile':'desktop'}.png`});
   for(const name of ['坐稳等待','查看右窗窗帘','查看左窗']){await click(name);await check();await click('否');await repeatNo(name);await click(name);await click('是');}
   await page.reload();await page.locator('[data-layer="closed-window"]').waitFor();
   await click('查看电视机电源开关');await click('是');
   await page.waitForURL('**/l3?preview=1&segment=carry&from=storm');
   if((await read(key)).events.length!==11)throw Error('storm event count');
   const stormRaw=await page.evaluate(k=>localStorage.getItem(k),key);
   await page.getByRole('button',{name:'查看可携带的物品'}).waitFor();
   await click('查看可携带的物品');await click('是');await click('查看围巾');await click('查看小灯笼');await check();await page.reload();await page.getByRole('button',{name:'确认携带小灯笼',exact:true}).waitFor();
   await page.screenshot({path:`output/playwright/l3-items-${mobile?'mobile':'desktop'}.png`});
   await click('确认携带小灯笼');await click('返回挑选');await click('查看围巾');await click('确认携带围巾');await click('是，确认携带');await page.getByRole('heading',{name:'已选择携带围巾'}).waitFor();
   await page.reload();await page.getByRole('heading',{name:'已选择携带围巾'}).waitFor();
   await click('打开预览菜单');await click('重新开始此片段');await click('取消');await click('继续预览');await page.getByRole('heading',{name:'已选择携带围巾'}).waitFor();
   for(const name of ['小灯笼','雨伞','指南针','小玩偶','钥匙','日记本','登山绳','背包',null]) {
    await click('打开预览菜单');await click('重新开始此片段');await click('确认重新开始');await click('查看可携带的物品');await click(name?'是':'否');
    if(name){if(name==='指南针'){await click('查看物品清单');await click(name);}else await click('查看'+name);await click('确认携带'+name);await click('是，确认携带');}
    await page.getByRole('heading',{name:name?'已选择携带'+name:'已选择不带物品',exact:true}).waitFor();
   }
   if(await page.evaluate(k=>localStorage.getItem(k),key)!==stormRaw)throw Error('carry changed storm save');
   if(await page.evaluate(()=>localStorage.getItem('emotional:l1:untouched')!=='sentinel-l1'||localStorage.getItem('emotional:l2:preview:v2')!=='sentinel-l2'))throw Error('L1/L2 changed');
   if(mobile){await page.setViewportSize({width:390,height:844});await page.getByRole('heading',{name:'请翻转手机'}).waitFor();await page.keyboard.press('Escape');if(!await page.getByRole('heading',{name:'请翻转手机'}).isVisible())throw Error('portrait bypass');await page.setViewportSize({width:844,height:390});await page.getByRole('heading',{name:'请翻转手机'}).waitFor({state:'hidden'});}
   await page.evaluate(k=>localStorage.setItem(k,'broken'),carry);await page.reload();await page.locator('main [role=alert]').waitFor();if(await page.evaluate(k=>localStorage.getItem(k),carry)!=='broken')throw Error('corruption overwritten');
   await page.getByRole('button',{name:'重新开始此片段',exact:true}).click();await click('确认重新开始');
   const other=await ctx.newPage();await other.goto(base+'/l3?preview=1&segment=carry');await other.getByRole('button',{name:'查看可携带的物品'}).click();await other.getByRole('button',{name:'否',exact:true}).click();await page.locator('main [role=alert]').waitFor();await click('读取最新预览');await page.getByRole('heading',{name:'已选择不带物品'}).waitFor();await other.close();
   await click('打开预览菜单');await click('重新开始此片段');await click('确认重新开始');const before=await page.evaluate(k=>localStorage.getItem(k),carry);
   await page.evaluate(()=>{Storage.prototype.setItem=function(){throw new DOMException('test write denied','QuotaExceededError');};});
   await click('查看可携带的物品');await click('是');await page.locator('main [role=alert]').waitFor();if(await page.evaluate(k=>localStorage.getItem(k),carry)!==before)throw Error('failed write mutated save');
   if(errors.length||api.length)throw Error(JSON.stringify({errors,api}));results.push({mobile,status:'PASS',coverage:'door refusals/retry; controls; reload; nine items and none; cancel; corrupt save; multi-tab; failed write; L1/L2 isolation; no API calls; portrait'});
  } finally {await ctx.close();}
 }
 return results;
}


