async original=>{
 const results=[];
 for(const mobile of [false,true])for(const both of [false,true]){
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
 await page.screenshot({path:`output/playwright/l2-bedroom-${mobile?'mobile':'desktop'}.jpg`,type:'jpeg',quality:65});
 await page.reload();await page.getByRole('img',{name:'失联房间：卧室',exact:true}).waitFor();await page.waitForFunction(()=>!document.querySelector('button')?.disabled);await click('返回大厅');await click('是，返回大厅');await page.getByRole('img',{name:'失联房间：大厅',exact:true}).waitFor();
 if(await page.locator('[data-layer="half-open-door"]').count()!==1)throw new Error('door closed on return');
 const events=await page.evaluate(()=>JSON.parse(localStorage.getItem('emotional:l2:preview:v2')).events);if(events.filter(e=>e.action.type==='explore').length!==2||events.filter(e=>e.action.type==='return-hall').length!==1)throw new Error('exploration event mismatch');
 if(errors.length)throw new Error(errors.join(';'));results.push({mobile,both,status:'PASS',exploration:'decline, retry, enter, reload, return'});
 }finally{await context.close();}
 }return results;
}
