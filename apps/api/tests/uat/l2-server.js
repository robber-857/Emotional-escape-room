async original=>{
 const results=[];
 for(const mobile of [false,true]){
  const context=await original.context().browser().newContext({viewport:mobile?{width:844,height:390}:{width:1280,height:720},hasTouch:mobile,isMobile:mobile});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const base=original.url().split('/').slice(0,3).join('/');
  const check=(ok,message)=>{if(!ok)throw new Error(message);};
  const click=async name=>{const inPrompt=page.getByRole('region',{name:'场景提示',exact:true}).getByRole('button',{name,exact:true});const button=await inPrompt.count()?inPrompt:page.getByRole('button',{name,exact:true});if(mobile)await button.tap();else await button.click();};
  const idle=()=>page.waitForFunction(()=>!document.querySelector('[aria-label="场景提示"]')?.inert && !document.querySelector('[role="alert"]')?.textContent?.includes('同步失败'));
  const action=async(name,type)=>{const wait=page.waitForResponse(r=>r.url().endsWith('/actions')&&r.request().method()==='POST'&&(!type||r.request().postDataJSON().action.type===type));const [response]=await Promise.all([wait,click(name)]);const result=await response.json();check(result.accepted,result.code);await idle();return result;};
  const snapshot=async()=>page.evaluate(async()=>{const s=JSON.parse(localStorage.getItem('emotional:l1:server:v1'));const h={Authorization:`Bearer ${s.token}`};const l1=await(await fetch(`/api/v1/sessions/${s.id}`,{headers:h})).json();const l2=await(await fetch(`/api/v1/sessions/${s.id}/levels/l2`,{headers:h})).json();return {l1,l2};});
  try{
   await page.goto(base+'/l2');await page.getByRole('alert').filter({hasText:'请先完成第一幕'}).waitFor();
   await page.goto(base+'/');await click('开始探索');await page.getByRole('button',{name:'河面',exact:true}).waitFor();
   await click('河面');await action('是','choose');await click('房门');const completed=await action('是','choose');
   check(completed.session.state.scene==='complete','L1 not complete');
   const parent=completed.session;await page.getByRole('link',{name:'进入第二幕',exact:true}).click();
   await page.waitForFunction(()=>document.querySelector('[aria-label="走到桌边"]')?.getAttribute('aria-disabled')==='false');
   const initial=await snapshot();check(initial.l2.id===parent.id&&initial.l2.version===0,'not linked to original L1');check(JSON.stringify(initial.l1.state)===JSON.stringify(parent.state),'L1 state changed');
   await action('走到桌边','arrive-table');await action('选择钥匙1','select-key');await click('去开门试试');await action('用钥匙1开门','try-door');
   await action('回到桌边拿钥匙','view');await action('拿起钥匙2','select-key');await click('去开门试试');await action('用钥匙2开门','try-door');
   await action('是，进去探索','explore');await page.getByRole('navigation',{name:'房间探索操作'}).getByRole('button',{name:'查看梳妆台',exact:true}).click();await action('是，开始寻找','search-choice');
   if(!mobile){
    await page.waitForFunction(async()=>{const s=JSON.parse(localStorage.getItem('emotional:l1:server:v1'));return (await(await fetch(`/api/v1/sessions/${s.id}/levels/l2`,{headers:{Authorization:`Bearer ${s.token}`}})).json()).state.search.long;},null,{polling:1000,timeout:25000});
    await click('打开第二幕菜单');await page.waitForTimeout(500);const paused=(await snapshot()).l2.state.search.activeMs;await page.waitForTimeout(1500);check((await snapshot()).l2.state.search.activeMs===paused,'menu search timer advanced');await click('关闭菜单');
   }
   await action('查看窗帘附近','curtain-click');await action('查看窗帘附近','curtain-click');
   await page.reload();await page.waitForFunction(()=>document.querySelector('[aria-label="查看窗帘附近"]')?.getAttribute('aria-disabled')==='false');
   const found=await action('查看窗帘附近','curtain-click');check(found.session.state.search.status==='found','earring not found');
   await action('返回大厅','return-hall');await action('整理家具','layout-start');
   await page.getByRole('button',{name:'移动窗边椅',exact:true}).focus();const move=page.waitForResponse(r=>r.url().endsWith('/actions')&&r.request().postDataJSON().action.type==='layout-move');await page.keyboard.press('ArrowLeft');check((await(await move).json()).accepted,'server furniture move rejected');
   await page.getByRole('button',{name:'确认摆放',exact:true}).click();const saved=await action('是，保存摆放','layout-confirm');
   check(saved.scoring.status==='pending_configuration'&&saved.scoring.contributions===null,'unexpected score');check(saved.scoring.facts.placement.ruleVersion==='l2-metrics-overlap-v1','missing placement evidence');
   // Offline requests remain pending until the user explicitly retries.
   await context.setOffline(true);await click('整理家具');await page.getByRole('button',{name:'重试同步',exact:true}).waitFor();await context.setOffline(false);
   const offlineRetry=page.waitForResponse(r=>r.url().endsWith('/actions')&&r.request().postDataJSON().action.type==='layout-start');await click('重试同步');check((await(await offlineRetry).json()).accepted,'offline retry failed');
   await page.getByRole('button',{name:'返回探索',exact:true}).waitFor();await action('返回探索','layout-exit');
   // A second real tab advances this run; the old tab must stop and reload.
   const peer=await context.newPage();await peer.goto(base+'/l2');await peer.waitForFunction(()=>document.querySelector('[aria-label="走到桌边"]')?.getAttribute('aria-disabled')==='false');
   const peerWait=peer.waitForResponse(r=>r.url().endsWith('/actions'));await peer.getByRole('button',{name:'整理家具',exact:true}).click();check((await(await peerWait).json()).accepted,'peer action failed');
   await page.getByRole('alert').filter({hasText:'另一标签页更新了进度'}).waitFor();await click('载入最新进度');await page.getByRole('button',{name:'返回探索',exact:true}).waitFor();await peer.close();await action('返回探索','layout-exit');
   // Lose a real committed response; retry the exact durable request after reload.
   let dropped=false;
   await page.route('**/levels/l2/actions',async route=>{if(!dropped&&route.request().postDataJSON().action.type==='layout-start'){dropped=true;await route.fetch();await route.abort('failed');}else await route.continue();});
   await click('整理家具');await page.getByRole('button',{name:'重试同步',exact:true}).waitFor();
   const pending=await page.evaluate(()=>{const s=JSON.parse(localStorage.getItem('emotional:l1:server:v1'));return JSON.parse(localStorage.getItem(`emotional:l2:pending:${s.id}`));});check(!!pending,'lost response not durable');
   await page.unroute('**/levels/l2/actions');
   const retry=page.waitForResponse(r=>r.url().endsWith('/actions')&&r.request().postDataJSON().action_id===pending.action_id);await page.reload();const retried=await(await retry).json();check(retried.accepted&&retried.duplicate,'retry duplicated action');
   await page.getByRole('button',{name:'返回探索',exact:true}).waitFor();await action('返回探索','layout-exit');
   await click('打开第二幕菜单');await click('查看服务器记录');await page.getByRole('heading',{name:'服务器选择记录'}).waitFor();await click('关闭菜单');
   const final=await snapshot();check(final.l2.id===parent.id&&JSON.stringify(final.l1.state)===JSON.stringify(parent.state),'L1 continuity broken');
   check(final.l2.state.events.filter(e=>e.id===pending.action_id).length===1,'duplicate event');check(final.l2.scoring.totals===null,'pending scores became zero');
   check(await page.evaluate(()=>localStorage.getItem('emotional:l2:preview:v2'))===null,'server game wrote preview save');
   await page.screenshot({path:`output/playwright/l2-server-${mobile?'mobile':'desktop'}.jpg`,type:'jpeg',quality:70});
   check(!errors.length,errors.join(';'));results.push({mobile,status:'PASS',session_id:parent.id,l1_version:final.l1.version,l2_version:final.l2.version,cases:['L1 gate','real L1 completion','same session','two keys','bedroom','curtain reload','server furniture','pending scoring','lost committed response retry']});
  }catch(error){throw new Error(error.message+'\n'+await page.locator('body').ariaSnapshot());}finally{await context.close();}
 }
 return results;
}
