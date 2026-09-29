async original=>{
 const base=original.url().split('/').slice(0,3).join('/'),results=[];
 const runId=original.url().split('?uatRun=')[1];
 const shotDir=runId&&/^uat4-[0-9-]+-[a-f0-9]+$/.test(runId)?`output/playwright/uat4/${runId}`:'output/l4-backend';
 const check=(ok,message)=>{if(!ok)throw Error(message);};
 for(const mobile of [false,true]){
  const ctx=await original.context().browser().newContext({viewport:mobile?{width:844,height:390}:{width:1280,height:720},hasTouch:mobile,isMobile:mobile});
  const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const click=async name=>{const button=page.getByRole('button',{name,exact:true});await(mobile?button.tap():button.click());};
  const get=()=>page.evaluate(async()=>{
   const auth=JSON.parse(localStorage.getItem('emotional:l1:server:v1')),headers={Authorization:`Bearer ${auth.token}`};
   const read=async suffix=>{const response=await fetch(`/api/v1/sessions/${auth.id}${suffix}`,{headers});if(!response.ok)throw Error(await response.text());return response.json();};
   return {l1:await read(''),l2:await read('/levels/l2'),l3:await read('/levels/l3'),l4:await read('/levels/l4'),receipts:await read('/levels/l4/events'),pending:localStorage.getItem(`emotional:l4:pending:${auth.id}`)};
  });
  try{
   await page.goto(base+'/l4');await page.getByRole('alert').filter({hasText:'原旅程凭据未找到'}).waitFor();
   // All prerequisite state is created through authenticated APIs in a new journey.
   await page.evaluate(async mobile=>{
    const post=async(url,body,token)=>{const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body)});if(!r.ok)throw Error(await r.text());return r.json();};
    let auth=await post('/api/v1/sessions',{});const token=auth.token,url=`/api/v1/sessions/${auth.id}`;
    for(const choice of ['swim','enter'])auth=(await post(url+'/actions',{action_id:crypto.randomUUID(),expected_version:auth.version,action:{type:'choose',choice,yes:true}},token)).session;
    localStorage.setItem('emotional:l1:server:v1',JSON.stringify({...auth,token}));
    let s=await post(url+'/levels/l2',{},token);
    for(const action of [{type:'layout-start'},{type:'layout-move',id:'sofa',point:{u:.1,v:.5}},{type:'layout-confirm'}])s=(await post(url+'/levels/l2/actions',{action_id:crypto.randomUUID(),expected_version:s.version,action},token)).session;
    s=await post(url+'/levels/l3',{},token);
    const actions=['open','close','wait','curtain','window','television'].map(slot=>({type:'decision',slot,yes:false}));
    actions.push({type:'carry',yes:!mobile});
    if(!mobile)actions.push({type:'draft',item:'lantern'},{type:'confirm'});
    for(const action of actions)s=(await post(url+'/levels/l3/actions',{action_id:crypto.randomUUID(),expected_version:s.version,action},token)).session;
    // Legacy local journey-scoped L4 records must never grant server completion.
    localStorage.setItem(`emotional:l4:preview:v1:${auth.id}`,JSON.stringify({source:'local_preview',door:'castle',at:new Date().toISOString()}));
   },mobile);
   await page.goto(base+'/l3');await click('走出密室 →');await page.waitForURL('**/l4');
   const name=mobile?'静塔门，海岸灯塔':'森林门，林间小径',door=mobile?'coast':'forest';
   await page.waitForFunction(name=>{const b=document.querySelector(`[aria-label="${name}"]`);return b&&!b.disabled;},name);
   const before=await get();check(before.l4.id===before.l1.id&&before.l4.version===0&&before.l4.state.door===null,'preview imported or wrong session');
   check(before.l4.state.item===(mobile?null:'lantern'),'inventory did not come from L3');
   await click(name);await click('再看看');check((await get()).receipts.length===0,'cancel persisted a choice');
   let peer;
   if(!mobile){
    peer=await ctx.newPage();await peer.goto(base+'/l4');await peer.waitForFunction(()=>{const b=document.querySelector('[aria-label="微光门，田园小屋"]');return b&&!b.disabled;});
    let lost=false;await page.route('**/levels/l4/actions',async route=>{if(!lost){lost=true;await route.fetch();await route.abort('failed');}else await route.continue();});
    await click(name);await click('走进这扇门');await page.getByRole('button',{name:'重试同步',exact:true}).waitFor();
    const uncertain=await get();check(uncertain.l4.version===1&&uncertain.pending,'committed response loss did not retain pending ID');
    check(await page.getByRole('status').filter({hasText:'你选择了'}).count()===0,'UI guessed committed outcome');
    await page.unroute('**/levels/l4/actions');await page.reload();
   }else{
    await click(name);await ctx.setOffline(true);await click('走进这扇门');await page.getByRole('button',{name:'重试同步',exact:true}).waitFor();await ctx.setOffline(false);
    const uncertain=await get();check(uncertain.l4.version===0&&uncertain.pending,'offline choice advanced or lost request');await click('重试同步');
   }
   await page.getByRole('status').filter({hasText:`你选择了${mobile?'静塔门':'森林门'}`}).waitFor();
   const after=await get();check(after.l4.version===1&&after.l4.state.door===door&&!after.pending&&after.receipts.length===1,'retry duplicated or lost selection');
   for(const level of ['l1','l2','l3'])check(JSON.stringify(before[level])===JSON.stringify(after[level]),'previous level changed: '+level);
   check(after.receipts[0].authority.record_source==='server_database'&&after.receipts[0].validation.l3_complete,'missing server evidence');
   if(peer){await peer.getByRole('alert').filter({hasText:'旅程已在其他页面更新'}).waitFor();await peer.getByRole('button',{name:'重试同步',exact:true}).click();await peer.getByRole('status').filter({hasText:'你选择了森林门'}).waitFor();await peer.close();}
   await page.reload();await page.getByRole('status').filter({hasText:'你选择了'}).waitFor();check(await page.getByRole('button',{name,exact:true}).isDisabled(),'terminal door remains editable');
   const rejected=await page.evaluate(async()=>{const a=JSON.parse(localStorage.getItem('emotional:l1:server:v1'));return (await fetch(`/api/v1/sessions/${a.id}/levels/l4/actions`,{method:'POST',headers:{Authorization:`Bearer ${a.token}`,'Content-Type':'application/json'},body:JSON.stringify({action_id:crypto.randomUUID(),expected_version:1,action:{type:'confirm',door:'castle'}})})).json();});
   check(!rejected.accepted&&rejected.code==='L4_COMPLETE','second door accepted');
   await click('查看第四幕记录');const list=page.getByRole('region',{name:'服务器回执列表'});await list.locator('[data-action-id]').first().waitFor();
   const final=await get(),actual=await list.locator('pre').allTextContents();
   check(JSON.stringify(actual.map(JSON.parse))===JSON.stringify(final.receipts),'UI receipt values differ from server');
   await page.route('**/levels/l4/events',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({detail:'DATABASE_UNAVAILABLE'})}));
   await click('刷新服务器记录');await list.getByRole('alert').waitFor();check(await list.locator('[data-action-id]').count()===0,'receipt failure reconstructed history');
   await page.unroute('**/levels/l4/events');await click('刷新服务器记录');await list.locator('[data-action-id]').first().waitFor();await click('关闭记录');
   await page.screenshot({path:`${shotDir}/${mobile?'touch':'desktop'}.png`});
   await page.goto(base+'/l4?preview=1');await page.waitForFunction(()=>{const b=document.querySelector('[aria-label="微光门，田园小屋"]');return b&&!b.disabled;});
   await click('微光门，田园小屋');await click('走进这扇门');check((await get()).l4.state.door===door,'preview changed server choice');
   check(errors.length===0,errors.join(';'));
   results.push({mobile,status:'PASS',session_id:final.l4.id,version:final.l4.version,receipts:final.receipts.length,cases:['L3 exit handoff','server inventory','preview isolation','cancel','durable retry','refresh recovery','terminal choice','immutable receipts','receipt failure and retry','prior levels unchanged',mobile?'offline retry':'lost committed response and cross-tab sync']});
  }catch(e){throw Error(e.message+'\n'+await page.locator('body').ariaSnapshot());}finally{await ctx.close();}
 }
 return results;
}
