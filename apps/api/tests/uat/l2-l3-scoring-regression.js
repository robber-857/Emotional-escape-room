async original=>{
 const base=original.url().split('/').slice(0,3).join('/'),results=[];
 for(const mobile of [false,true]){
  const context=await original.context().browser().newContext({viewport:mobile?{width:844,height:390}:{width:1440,height:900},hasTouch:mobile,isMobile:mobile});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const check=(ok,message)=>{if(!ok)throw Error(message);};
  const enterCover = async () => {
    const cover = page.locator('[data-game-cover]');
    await page.waitForFunction(() => {
      const cover = document.querySelector('[data-game-cover]');
      return !cover || cover.getAttribute('data-stage') === '3';
    });
    await page.locator('body').ariaSnapshot();
    if (await cover.count() && await cover.getAttribute('data-mobile') === 'false')
      await page.getByRole('button', { name: '进入你的故事', exact: true }).click();
    await cover.waitFor({ state: 'hidden' });
    await page.locator('body').ariaSnapshot();
  };
  const click=async name=>{const b=page.getByRole('button',{name,exact:true});await(mobile?b.tap():b.click());};
  const get=()=>page.evaluate(async()=>{const a=JSON.parse(localStorage.getItem('emotional:l1:server:v1'));return(await fetch(`/api/v1/sessions/${a.id}/scoring`,{headers:{Authorization:`Bearer ${a.token}`}})).json();});
  const panel=page.getByRole('complementary',{name:'服务端计分测试'});
  const toggle=()=>panel.getByRole('button',{name:/^服务端计分/}).click();
  const response=()=>page.waitForResponse(r=>r.url().endsWith('/actions')&&r.request().method()==='POST');
  try{
   await page.goto(base+'/');await enterCover();await click('开始探索');await page.getByRole('button',{name:'河面',exact:true}).waitFor();
   await click('河面');check((await get()).ledger.length===0,'opening a client prompt generated score');
   const wait=response();await click('是');const swam=await wait,body=await swam.json();
   check(body.score_effect.delta.A===-1&&body.score_effect.delta.F===-2,'wrong swim delta');
   await toggle();await panel.locator(`[data-score-action-id="${body.score_effect.action_id}"]`).waitFor();
   check((await panel.textContent()).includes('A -1 · V NA · T NA · F -2'),'vector missing');
   const duplicate=await page.evaluate(async request=>{const a=JSON.parse(localStorage.getItem('emotional:l1:server:v1'));return(await fetch(`/api/v1/sessions/${a.id}/actions`,{method:'POST',headers:{Authorization:`Bearer ${a.token}`,'Content-Type':'application/json'},body:JSON.stringify(request)})).json();},swam.request().postDataJSON());
   check(duplicate.duplicate&&(await get()).ledger.length===1,'retry duplicated score');
   await page.screenshot({path:`output/playwright/scoring-regression-${mobile?'touch':'desktop'}-delta.png`});await toggle();
   await click('房门');const enterWait=response();await click('是');await enterWait;
   let score=await get();check(!score.levels.l1.complete&&score.levels.l1.axes.A.normalized===null&&score.levels.l1.axes.F.normalized===null,'L1 finalized before L2 entry');
   check(!score.ledger.some(e=>e.group_id.startsWith('l1.talk.')),'greetings scored before L2 entry');
   await page.getByRole('link',{name:'进入第二幕',exact:true}).click();
   await page.waitForFunction(()=>document.querySelector('[aria-label="走到桌边"]')?.getAttribute('aria-disabled')==='false');
   score=await get();check(score.levels.l1.complete&&score.levels.l1.axes.A.normalized===0&&score.levels.l1.axes.F.normalized===0,'L1 normalization incorrect');
   const greetings=score.ledger.filter(e=>e.group_id.startsWith('l1.talk.'));
   check(greetings.length===2&&greetings.every(e=>e.option_id==='skipped'&&e.status==='applied'&&e.vector.V===0),'untouched greetings did not settle as V0');
   // Complete L2/L3 prerequisites through their authenticated, state-validating APIs.
   await page.evaluate(async()=>{
    const a=JSON.parse(localStorage.getItem('emotional:l1:server:v1')),url=`/api/v1/sessions/${a.id}`,headers={Authorization:`Bearer ${a.token}`,'Content-Type':'application/json'};
    const post=async(path,data)=>{const r=await fetch(url+path,{method:'POST',headers,body:JSON.stringify(data)});if(!r.ok)throw Error(await r.text());return r.json();};
    let s=await post('/levels/l2',{});
    const act=async(level,action)=>{const r=await post(`/levels/${level}/actions`,{action_id:crypto.randomUUID(),expected_version:s.version,action});s=r.session;return r;};
    const seated=await act('l2',{type:'sit',seat:'table-seat',yes:true});
    if(seated.score_effect.delta.A!==-1)throw Error('table seat did not score A-1');
    await act('l2',{type:'view',view:'room'});
    await act('l2',{type:'layout-start'});
    await act('l2',{type:'layout-move',id:'armchair',point:{u:.27791321372763345,v:.9298451630714811}});
    const confirmed=await act('l2',{type:'layout-confirm'});
    if(confirmed.score_effect.reason!=='AWAITING_L3_ENTRY')throw Error('furniture scored before entry');
    await act('l2',{type:'layout-start'});
    await act('l2',{type:'layout-move',id:'chair',point:{u:.5,v:.5}});
    const last=await act('l2',{type:'layout-confirm'});
    if(last.score_effect.events.length)throw Error('reconfirmation generated score');
    s=await post('/levels/l3',{});
    const scoring=await(await fetch(url+'/scoring',{headers})).json();
    const furniture=scoring.ledger.filter(e=>e.group_id.startsWith('l2.furniture.'));
    if(furniture.length!==3||furniture.some(e=>e.evidence.layout.chair.u!==.5))throw Error('not using last confirmed layout');
    await act('l3',{type:'decision',slot:'open',yes:true});
    await act('l3',{type:'decision',slot:'close',yes:false});
    const closed=await act('l3',{type:'decision',slot:'close',yes:true});
    if(closed.score_effect.events[0]?.option_id!=='closed'||s.state.segment!=='storm')throw Error('door pair did not settle immediately');
    for(const [slot,yes] of [['wait',false],['curtain',false],['window',true],['television',false]])await act('l3',{type:'decision',slot,yes});
    await post('/levels/l3/actions',{action_id:crypto.randomUUID(),expected_version:s.version,action:{type:'carry',yes:false}});
   });
   await page.goto(base+'/l3');await toggle();
   await panel.getByText(/关窗开电视 \/ window/).waitFor();
   check((await panel.textContent()).includes('F 0'),'neutral zero hidden');
   check((await panel.textContent()).includes('/4 档'),'missing four-band label');
   check(!(await panel.textContent()).includes('四分位'),'ambiguous quartile display remains');
   await panel.getByText('靠墙程度计算明细',{exact:true}).click();
   await panel.getByText('最大距离 Dmax',{exact:true}).scrollIntoViewIfNeeded();
   await page.screenshot({path:`output/playwright/proximity-details-${mobile?'touch':'desktop'}.png`});
   await toggle();
   await click('走出密室 →');await page.waitForURL('**/l4');
   await page.getByRole('button',{name:'静塔门，海岸灯塔',exact:true}).waitFor();
   await click('静塔门，海岸灯塔');const doorWait=response();await click('走进这扇门');const door=await(await doorWait).json();
   check(door.score_effect.delta.A===1&&door.score_effect.delta.V===1,'L4 delta incorrect');
   await click('稍后再看');
   await toggle();await panel.locator(`[data-score-action-id="${door.score_effect.action_id}"]`).waitFor();
   score=await get();check(score.levels.l4.axes.A.normalized===100&&score.levels.l4.axes.V.normalized===100,'L4 normalization incorrect');
   check(score.final.status==='pending_configuration'&&score.final.vector.F===null,'missing rules fabricated final score');
   check(!(await panel.textContent()).includes('总分'),'scalar total remains in UI');
   check(score.ledger.filter(e=>e.group_id.startsWith('l2.furniture.')).every(e=>e.status==='applied'),'furniture still unconfigured');
   await page.screenshot({path:`output/playwright/scoring-regression-${mobile?'touch':'desktop'}-levels.png`});
   await context.setOffline(true);await panel.getByRole('alert').waitFor();check(await panel.locator('[data-score-action-id]').count()===0,'stale score rows presented as fresh');
   await context.setOffline(false);await panel.locator(`[data-score-action-id="${door.score_effect.action_id}"]`).waitFor();
   await page.reload();await click('稍后再看');await toggle();await panel.locator(`[data-score-action-id="${door.score_effect.action_id}"]`).waitFor();
   check(!errors.length,errors.join(';'));
   results.push({mobile,status:'PASS',session_id:score.session_id,ledger_count:score.ledger.length,l1:score.levels.l1.axes,l4:score.levels.l4.axes,final:score.final});
  }catch(e){throw Error(e.message+'\n'+await page.locator('body').ariaSnapshot());}
  finally{await context.close();}
 }
 return results;
}
