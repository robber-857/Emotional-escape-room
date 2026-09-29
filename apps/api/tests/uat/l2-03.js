async original=>{
 const results=[];
 for(const mobile of [false,true]){const both=true;
 const context=await original.context().browser().newContext({viewport:mobile?{width:844,height:390}:{width:1280,height:720},hasTouch:mobile,isMobile:mobile});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const click=async name=>{const b=page.getByRole('button',{name,exact:true}).first();if(mobile)await b.tap();else await b.click();};
 const ready=()=>page.waitForFunction(()=>document.querySelector('[aria-label="坐在桌前椅"]')?.getAttribute('aria-disabled')==='false'||!!document.querySelector('[aria-label="拿起钥匙1"][aria-disabled="false"]')||!!document.querySelector('[aria-label="拿起钥匙2"][aria-disabled="false"]'));
 try{await page.goto(original.url().split('/').slice(0,3).join('/')+'/l2?preview=1');await ready();await click('坐在桌前椅');await click('是，坐下');await page.getByRole('img',{name:'失联房间：坐在桌前',exact:true}).waitFor();
 await click('关闭提示，继续探索');await page.screenshot({path:`output/playwright/l2-table-${mobile?'mobile':'desktop'}.jpg`,type:'jpeg',quality:65});
 const first=both?'钥匙2':'钥匙1',second=both?'钥匙1':'钥匙2';await click('拿起'+first);if(both)await click('拿起'+second);await click('去开门试试');if(both&&await page.getByRole('button',{name:'回到桌边拿钥匙',exact:true}).count())throw new Error('return shown with both keys');await click('用'+first+'开门');await page.getByRole('heading',{name:'这把钥匙没有打开门。',exact:true}).waitFor();
 await page.reload();await ready();await click('去开门试试');if(!await page.getByRole('button',{name:'用'+first+'开门',exact:true}).isDisabled())throw new Error('failed key enabled');
 if(!both){await click('回到桌边拿钥匙');await page.getByRole('img',{name:'失联房间：坐在桌前',exact:true}).waitFor();await click('拿起'+second);await click('去开门试试');}
 await click('用'+second+'开门');await page.getByRole('heading',{name:'里面很黑，要进去探索吗？',exact:true}).waitFor();if(await page.getByRole('button',{name:'回到桌边拿钥匙',exact:true}).count())throw new Error('return shown after unlock');const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('emotional:l2:preview:v2')));if(saved.events.filter(e=>e.action.type==='try-door').length!==2)throw new Error('wrong attempt count');
 const box=await page.getByRole('region',{name:'场景提示'}).boundingBox();const size=page.viewportSize();if(box.x<0||box.y<0||box.x+box.width>size.width||box.y+box.height>size.height||errors.length)throw new Error('layout or page error');
 await page.screenshot({path:`output/playwright/l2-door-${mobile?'mobile':'desktop'}.jpg`,type:'jpeg',quality:65});
 if(await page.locator('svg text').filter({hasText:'门锁已打开'}).count())throw new Error('door label remains');
 if(await page.locator('[data-layer="half-open-door"]').count()!==1)throw new Error('half-open layer missing');
 await click('关闭提示，继续探索');await click('查看半开的门');await click('否');await page.getByRole('img',{name:'失联房间：大厅',exact:true}).waitFor();
 await click('查看半开的门');await click('是，进去探索');await page.getByRole('img',{name:'失联房间：卧室',exact:true}).waitFor();

 const searchState=()=>page.evaluate(()=>{const es=JSON.parse(localStorage.getItem('emotional:l2:preview:v2')).events;const ts=es.filter(e=>e.action.type==='search-time');return {events:es,ms:ts.length?ts[ts.length-1].action.activeMs:0};});
 await click('查看梳妆台');await click('否');if(await page.getByRole('button',{name:'查看窗帘附近',exact:true}).count())throw new Error('refusal allows pickup');
 await click('查看梳妆台');await click('是，开始寻找');await page.getByRole('button',{name:'查看窗帘附近',exact:true}).waitFor();
 await click('返回大厅');await page.getByRole('heading',{name:'先回大厅吗？',exact:true}).waitFor();await click('是，返回大厅');await click('查看半开的门');await click('是，进去探索');
 await click('查看梳妆台');await click('是，开始寻找');
 await click('打开第二幕菜单');const before=(await searchState()).ms;await page.waitForTimeout(1200);if((await searchState()).ms!==before)throw new Error('menu counted');await click('关闭菜单');
 await context.setOffline(true);await page.waitForTimeout(250);const off=(await searchState()).ms;await page.waitForTimeout(1200);if((await searchState()).ms!==off)throw new Error('offline counted');await context.setOffline(false);
 if(mobile){await page.setViewportSize({width:390,height:844});await page.getByText('为了保证用户体验请翻转手机为横屏',{exact:true}).waitFor();const portrait=(await searchState()).ms;await page.waitForTimeout(1200);if((await searchState()).ms!==portrait)throw new Error('portrait counted');await page.setViewportSize({width:844,height:390});await page.getByText('为了保证用户体验请翻转手机为横屏',{exact:true}).waitFor({state:'hidden'});}
 else await page.waitForFunction(()=>JSON.parse(localStorage.getItem('emotional:l2:preview:v2')).events.some(e=>e.action.type==='search-time'&&e.action.activeMs>15000),{},{timeout:25000});
 await page.reload();await page.getByRole('button',{name:'查看窗帘附近',exact:true}).waitFor();await page.waitForFunction(()=>document.querySelector('[aria-label="查看窗帘附近"]')?.getAttribute('aria-disabled')==='false');
 await page.screenshot({path:`output/playwright/l2-search-${mobile?'mobile':'desktop'}.jpg`,type:'jpeg',quality:65});await click('查看窗帘附近');await click('查看窗帘附近');if(await page.locator('[data-layer="found-earring"]').count())throw new Error('revealed before third click');await page.reload();await page.waitForFunction(()=>document.querySelector('[aria-label="查看窗帘附近"]')?.getAttribute('aria-disabled')==='false');await click('查看窗帘附近');await page.getByRole('heading',{name:'在窗帘附近找到另一只耳环了。',exact:true}).waitFor();if(await page.locator('[data-layer="earring-clue"]').count()!==1||await page.locator('[data-layer="found-earring"]').count()!==1)throw new Error('two earrings not visible');
 await page.screenshot({path:`output/playwright/l2-found-${mobile?'mobile':'desktop'}.jpg`,type:'jpeg',quality:65});await click('返回大厅');await click('查看半开的门');await click('是，进去探索');if(await page.getByRole('button',{name:'查看窗帘附近',exact:true}).count())throw new Error('duplicate pickup');
 const savedSearch=await searchState();if(savedSearch.events.filter(e=>e.action.type==='curtain-click').length!==3)throw new Error('duplicate found event');if(errors.length)throw new Error(errors.join(';'));
 results.push({mobile,status:'PASS',cases:['decline and reconsider','return confirmation','new search segment','menu/offline pause','refresh resume','find once','revisit'],longSearch:!mobile});

 }finally{await context.close();}
 }return results;
}
