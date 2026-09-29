async original=>{
 const base=original.url().split('/').slice(0,3).join('/'),results=[];
 for(const mobile of [false,true]){
  const ctx=await original.context().browser().newContext({viewport:mobile?{width:844,height:390}:{width:1280,height:720},hasTouch:mobile,isMobile:mobile});
  const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const check=(ok,msg)=>{if(!ok)throw Error(msg);};
  const click=async name=>{const b=page.getByRole('button',{name,exact:true});await(mobile?b.tap():b.click());};
  const available=async name=>{await page.waitForFunction(name=>{const e=document.querySelector(`[aria-label="${name}"]`);return e&&e.getAttribute('aria-disabled')==='false';},name);};
  const action=async name=>{const wait=page.waitForResponse(r=>r.url().includes('/levels/l3/actions')&&r.request().method()==='POST');await click(name);const data=await(await wait).json();check(data.accepted,data.code);return data;};
  const get=()=>page.evaluate(async()=>{const a=JSON.parse(localStorage.getItem('emotional:l1:server:v1'));const h={Authorization:`Bearer ${a.token}`};const read=async suffix=>(await fetch(`/api/v1/sessions/${a.id}${suffix}`,{headers:h})).json();return {l1:await read(''),l2:await read('/levels/l2'),l3:await read('/levels/l3'),receipts:await read('/levels/l3/events'),pending:localStorage.getItem(`emotional:l3:pending:${a.id}`)};});
  try{
   await page.goto(base+'/l3');await page.getByRole('alert').filter({hasText:'原旅程凭据未找到'}).waitFor();
   // Setup goes through the actual API; no fabricated database state or browser history.
   await page.evaluate(async()=>{
    const post=async(url,body,token)=>{const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body)});if(!r.ok)throw Error(await r.text());return r.json();};
    let a=await post('/api/v1/sessions',{});const token=a.token,url=`/api/v1/sessions/${a.id}`;
    for(const choice of ['swim','enter'])a=(await post(url+'/actions',{action_id:crypto.randomUUID(),expected_version:a.version,action:{type:'choose',choice,yes:true}},token)).session;
    localStorage.setItem('emotional:l1:server:v1',JSON.stringify({...a,token}));
    let s=await post(url+'/levels/l2',{},token);
    for(const action of [{type:'layout-start'},{type:'layout-move',id:'sofa',point:{u:.1,v:.5}},{type:'layout-confirm'}])s=(await post(url+'/levels/l2/actions',{action_id:crypto.randomUUID(),expected_version:s.version,action},token)).session;
   });
   await page.goto(base+'/l2');await available('查看通往第三幕的门');await click('查看通往第三幕的门');await page.getByRole('link',{name:'是，进入第三幕',exact:true}).click();
   await page.waitForURL('**/l3?from=l2');await available('查看半开的门');
   const initial=await get();check(initial.l3.id===initial.l1.id&&initial.l3.version===0,'original session not reused');
   const rejected=await page.evaluate(async()=>{const a=JSON.parse(localStorage.getItem('emotional:l1:server:v1'));const r=await fetch(`/api/v1/sessions/${a.id}/levels/l3/actions`,{method:'POST',headers:{Authorization:`Bearer ${a.token}`,'Content-Type':'application/json'},body:JSON.stringify({action_id:crypto.randomUUID(),expected_version:0,action:{type:'carry',yes:false}})});return {status:r.status,body:await r.json()};});
   check(rejected.status===409&&!rejected.body.accepted&&rejected.body.session.version===0,'illegal carry advanced state');
   await click('查看半开的门');await action('否');await available('查看半开的门');await click('查看半开的门');const repeat=await action('否');check(repeat.code==='ALREADY_RECORDED'&&repeat.session.version===1,'repeat accumulated');
   if(!mobile){
    // Commit server response, lose it in transit, then refresh and retry the durable ID.
    let lost=false;await page.route('**/levels/l3/actions',async route=>{if(!lost){lost=true;await route.fetch();await route.abort('failed');}else await route.continue();});
    await available('决定是否关门');await click('决定是否关门');await click('是');await page.getByRole('button',{name:'重试同步',exact:true}).waitFor();
    const before=await get();check(before.pending&&before.l3.version===2,'lost response not durable');
    check(await page.locator('[data-layer="storm"]').count()===0,'UI advanced before a server response');
    await page.unroute('**/levels/l3/actions');await page.reload();await available('坐稳等待');const after=await get();check(after.l3.version===2&&!after.pending&&after.receipts.length===before.receipts.length,'retry duplicated event');
    // A real second tab changes the run; first tab must stop and explicitly synchronize.
    const peer=await ctx.newPage();await peer.goto(base+'/l3');await peer.waitForFunction(()=>document.querySelector('[aria-label="坐稳等待"]')?.getAttribute('aria-disabled')==='false');
    await peer.getByRole('button',{name:'坐稳等待',exact:true}).click();await peer.getByRole('button',{name:'否',exact:true}).click();
    await page.getByRole('alert').filter({hasText:'其他页面更新了旅程'}).waitFor();await peer.close();await click('重试同步');await available('查看右窗窗帘');
   }else{await available('决定是否关门');await click('决定是否关门');await action('否');await available('坐稳等待');await click('坐稳等待');await action('否');}
   for(const name of ['查看右窗窗帘','查看左窗','查看电视机电源开关']){await available(name);await click(name);await action(!mobile&&name==='查看电视机电源开关'?'是':'否');}
   await page.locator('main[data-segment=carry]').waitFor();await page.locator(`[data-television-power=${mobile?'on':'off'}]`).waitFor();
   await available('查看可携带的物品');await click('查看可携带的物品');
   if(mobile){await action('否');await page.getByRole('heading',{name:'已选择不带物品',exact:true}).waitFor();}
   else{await action('是');await available('查看小玩偶');await action('查看小玩偶');await page.reload();await page.getByText('已预选 · 小玩偶',{exact:true}).waitFor();await click('确认携带小玩偶');await action('是，确认携带');await page.getByRole('heading',{name:'已选择携带小玩偶',exact:true}).waitFor();}
   await page.reload();await page.getByRole('region',{name:'服务器选择结果',exact:true}).waitFor();
   const final=await get();check(final.l3.completion==='complete','not complete');check(JSON.stringify(initial.l1)===JSON.stringify(final.l1)&&JSON.stringify(initial.l2)===JSON.stringify(final.l2),'parent modified');
   await click('查看服务器记录');const list=page.getByRole('region',{name:'服务器回执列表',exact:true});await list.getByText(`服务器返回 ${final.receipts.length} 条回执。`,{exact:false}).waitFor();
   const ids=await list.locator('[data-action-id]').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('data-action-id')).sort());check(JSON.stringify(ids)===JSON.stringify(final.receipts.map(r=>r.action_id).sort()),'UI receipts differ from DB');
   await page.screenshot({path:`output/playwright/l3-server-${mobile?'touch':'desktop'}.png`});
   await click('关闭菜单');await click('打开第三幕菜单');check(await page.getByRole('button',{name:'重新开始整个 L3',exact:true}).count()===0,'destructive server restart');
   await page.getByRole('link',{name:'进入独立本地预览',exact:true}).click();await available('查看半开的门');
   check((await get()).l3.version===final.l3.version,'preview changed server run');check(errors.length===0,errors.join(';'));
   results.push({mobile,status:'PASS',session_id:final.l3.id,version:final.l3.version,receipts:final.receipts.length,cases:['L2 mode routing','original session','repeat refusal','carry and TV restore','receipt reconciliation','preview separation',...(!mobile?['lost committed response','cross-tab conflict']:[])]});
  }catch(e){throw Error(e.message+'\n'+await page.locator('body').ariaSnapshot());}finally{await ctx.close();}
 }
 return results;
}
