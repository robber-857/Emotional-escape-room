async original=>{
 const base=original.url().split('/').slice(0,3).join('/'),results=[];
 for(const mobile of [false,true])for(const answers of [[false,false,false,false,false,false],[true,true,true,true,true,true],[true,false,true,false,true,false]]){
  const ctx=await original.context().browser().newContext({viewport:mobile?{width:844,height:390}:{width:1280,height:720},hasTouch:mobile,isMobile:mobile});const page=await ctx.newPage(),errors=[],api=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().includes('/api/'))api.push(r.url());});
  const click=async name=>{const b=page.getByRole('button',{name,exact:true});await(mobile?b.tap():b.click());};
  try{
   await page.goto(base+'/l3?preview=1');
   await page.locator('[data-television-power=on] [data-layer=tv-screen]').waitFor();
   const names=['查看半开的门',answers[0]?'查看敞开的门':'决定是否关门','坐稳等待','查看右窗窗帘','查看左窗','查看电视机电源开关'];
   for(let i=0;i<6;i++){
    await page.waitForFunction(name=>document.querySelector(`[aria-label="${name}"]`)?.getAttribute('aria-disabled')==='false',names[i]);
    await click(names[i]);await click(answers[i]?'是':'否');
    if(i<5&&page.url().includes('segment=carry'))throw Error('early transition');
    if(i===4){await page.reload();await page.getByRole('button',{name:names[5],exact:true}).waitFor();}
   }
   await page.waitForURL('**/l3?preview=1&segment=carry&from=storm');
   await page.locator(`[data-television-power=${answers[5]?'off':'on'}]`).waitFor();
   if(await page.locator('[data-layer=tv-screen]').count()!==(answers[5]?0:1))throw Error('wrong TV screen after progression');
   const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('emotional:l3:preview:v1:storm')));
   if(saved.events.length!==6||JSON.stringify(saved.events.map(e=>e.action.yes))!==JSON.stringify(answers))throw Error('answers lost or invented');
   await click('查看可携带的物品');await click('是');await click('查看小玩偶');await click('确认携带小玩偶');await click('是，确认携带');
   await page.getByRole('heading',{name:'已选择携带小玩偶',exact:true}).waitFor();await page.reload();await page.getByRole('heading',{name:'已选择携带小玩偶',exact:true}).waitFor();
   await page.locator(`[data-television-power=${answers[5]?'off':'on'}]`).waitFor();
   await page.goto(base+'/l3?preview=1');await page.waitForURL('**/l3?preview=1&segment=carry&from=storm');await page.getByRole('heading',{name:'已选择携带小玩偶',exact:true}).waitFor();
   if(errors.length||api.length)throw Error(JSON.stringify({errors,api}));results.push({mobile,answers,status:'PASS'});
  }finally{await ctx.close();}
 }
 return results;
}
