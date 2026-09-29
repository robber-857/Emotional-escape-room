async original=>{
 const results=[],base=original.url().split('/').slice(0,3).join('/');
 for(const mobile of [false,true]){
  const ctx=await original.context().browser().newContext({viewport:mobile?{width:844,height:390}:{width:1280,height:720},hasTouch:mobile,isMobile:mobile});
  const page=await ctx.newPage(),errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));ctx.on('request',r=>{if(r.url().includes('/api/'))requests.push(r.url());});
  const click=async name=>{const b=page.getByRole('button',{name,exact:true});await(mobile?b.tap():b.click());};
  const key='emotional:l3:preview:v1:carry';
  const read=()=>page.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);
  const ready=()=>page.waitForFunction(()=>document.querySelector('[aria-label="查看可携带的物品"]')?.getAttribute('aria-disabled')==='false');
  const check=(ok,msg)=>{if(!ok)throw Error(msg);};
  try{
   await page.goto(base+'/l3?preview=1&segment=carry');await ready();
   await page.screenshot({animations:"disabled",path:`output/playwright/l3-02-room-${mobile?'mobile':'desktop'}.png`});
   check(!await page.getByRole('region',{name:'物品近景选择'}).count(),'catalog covers room on entry');
   const geometry=await page.locator('svg[data-figma-node="83:115"] [data-item] > svg').evaluateAll(nodes=>nodes.map(n=>({item:n.getAttribute('data-layer'),x:Number(n.getAttribute('x')),y:Number(n.getAttribute('y')),width:Number(n.getAttribute('width')),height:Number(n.getAttribute('height')),visible:n.getBoundingClientRect().width>0})));
   check(geometry.length===8&&geometry.every(g=>g.visible),'missing scene artwork');
   const expected={umbrella:[1538,666,310,285],key:[550,764,46,46],lantern:[626,650,203.4111,203.4111],doll:[718,669,203.4111,203.4111],backpack:[19,733,152,239],rope:[470,812,203.4111,203.4111],journal:[1007,824,203.4111,203.4111],scarf:[322,872,203.4111,203.4111]};
   for(const g of geometry)check([g.x,g.y,g.width,g.height].every((v,i)=>Math.abs(v-expected[g.item][i])<.01),'Figma slot mismatch '+g.item);
   const sources=await page.locator('svg[data-figma-node="83:115"] image').evaluateAll(nodes=>[...new Set(nodes.map(n=>n.getAttribute('href')))]);
   for(const src of sources){const r=await ctx.request.get(base+src);check(r.ok()&&(await r.body()).length>0,'missing local asset '+src);}
   await click('查看背包');await page.getByRole('region',{name:'场景提示'}).waitFor();check(await read()===null,'viewing item wrote choice before consent');await click('关闭提示，继续探索');
   await click('查看可携带的物品');await click('是');
   for(const [id,name] of Object.entries({backpack:'背包',key:'钥匙',lantern:'小灯笼',doll:'小玩偶',rope:'登山绳',journal:'日记本',scarf:'围巾',umbrella:'雨伞'})){
    await click('查看'+name);const saved=await read();check(saved.events.at(-1).action.item===id,'wrong hit target '+id);await page.getByRole('button',{name:'确认携带'+name,exact:true}).waitFor();
   }
   await page.screenshot({animations:"disabled",path:`output/playwright/l3-02-selected-${mobile?'mobile':'desktop'}.png`});
   await click('确认携带雨伞');await page.getByRole('region',{name:'场景提示'}).waitFor();
   await page.screenshot({animations:"disabled",path:`output/playwright/l3-02-confirm-${mobile?'mobile':'desktop'}.png`});
   await click('返回挑选');await click('查看物品清单');await click('指南针');await page.getByRole('button',{name:'确认携带指南针',exact:true}).waitFor();
   await click('查看钥匙');await page.reload();await page.getByRole('button',{name:'确认携带钥匙',exact:true}).waitFor();check(await page.locator('[data-item="key"]').count()===1,'draft removed physical item');
   await page.getByRole('button',{name:'查看钥匙',exact:true}).focus();await page.keyboard.press('Enter');
   await click('确认携带钥匙');await click('是，确认携带');await page.getByRole('heading',{name:'已选择携带钥匙'}).waitFor();
   check(await page.locator('[data-item="key"]').count()===0,'confirmed item left on floor');check(await page.getByRole('complementary',{name:'随身物品'}).getByRole('img',{name:'钥匙'}).count()===1,'inventory missing');
   await page.reload();await page.getByRole('heading',{name:'已选择携带钥匙'}).waitFor();
   await page.screenshot({animations:"disabled",path:`output/playwright/l3-02-inventory-${mobile?'mobile':'desktop'}.png`});
   const saved=await read();check(saved.events.filter(e=>e.action.type==='confirm').length===1,'duplicate confirm');
   check(!errors.length&&!requests.length,JSON.stringify({errors,requests}));results.push({mobile,status:'PASS',geometry,coverage:'Figma slots/local assets; scene consent; eight physical targets; compass text fallback; closeup/cancel; keyboard; draft restore; single pickup/inventory; no API'});
  }catch(e){throw Error(e.message+'\n'+await page.locator('body').ariaSnapshot());}finally{await ctx.close();}
 }
 return results;
}
