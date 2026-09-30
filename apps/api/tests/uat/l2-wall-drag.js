async original=>{
 const base=original.url().split('/').slice(0,3).join('/'),results=[];
 for(const mobile of [false,true]){
  const context=await original.context().browser().newContext({viewport:mobile?{width:844,height:390}:{width:1440,height:900},hasTouch:mobile,isMobile:mobile});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const check=(ok,message)=>{if(!ok)throw Error(message);};
  const click=async name=>{const b=page.getByRole('button',{name,exact:true});await(mobile?b.tap():b.click());};
  const get=()=>page.evaluate(async()=>{const a=JSON.parse(localStorage.getItem('emotional:l1:server:v1'));return(await fetch(`/api/v1/sessions/${a.id}/scoring`,{headers:{Authorization:`Bearer ${a.token}`}})).json();});
  const panel=page.getByRole('complementary',{name:'服务端计分测试'});
  const toggle=()=>panel.getByRole('button',{name:/^服务端计分/}).click();
  const response=()=>page.waitForResponse(r=>r.url().endsWith('/actions')&&r.request().method()==='POST');
  try{
   await page.goto(base+'/');await click('开始探索');await page.getByRole('button',{name:'河面',exact:true}).waitFor();
   await click('河面');check((await get()).ledger.length===0,'opening a client prompt generated score');
   const wait=response();await click('是');const swam=await wait,body=await swam.json();
   check(body.score_effect.delta.A===-1&&body.score_effect.delta.F===-2,'wrong swim delta');
   await toggle();await panel.locator(`[data-score-action-id="${body.score_effect.action_id}"]`).waitFor();
   check((await panel.textContent()).includes('A -1 · V NA · T NA · F -2'),'vector missing');
   const duplicate=await page.evaluate(async request=>{const a=JSON.parse(localStorage.getItem('emotional:l1:server:v1'));return(await fetch(`/api/v1/sessions/${a.id}/actions`,{method:'POST',headers:{Authorization:`Bearer ${a.token}`,'Content-Type':'application/json'},body:JSON.stringify(request)})).json();},swam.request().postDataJSON());
   check(duplicate.duplicate&&(await get()).ledger.length===1,'retry duplicated score');
   await page.screenshot({path:`output/playwright/scoring-${mobile?'touch':'desktop'}-delta.png`});await toggle();
   await click('房门');const enterWait=response();await click('是');await enterWait;
   let score=await get();check(score.levels.l1.axes.A.normalized===0&&score.levels.l1.axes.F.normalized===0,'L1 normalization incorrect');
   await page.getByRole('link',{name:'进入第二幕',exact:true}).click();
   await page.waitForFunction(()=>document.querySelector('[aria-label="走到桌边"]')?.getAttribute('aria-disabled')==='false');

   await click('整理家具');
   await page.getByRole('button',{name:'移动单人沙发',exact:true}).waitFor();
   await page.locator('body').ariaSnapshot();
   const read=()=>page.evaluate(async()=>{const a=JSON.parse(localStorage.getItem('emotional:l1:server:v1'));return(await fetch(`/api/v1/sessions/${a.id}/levels/l2`,{headers:{Authorization:`Bearer ${a.token}`}})).json();});
   const cdp=mobile?await context.newCDPSession(page):null;
   for(const [x,y] of [[3,3],[mobile?841:1437,mobile?387:897]]){
    const box=await page.getByRole('button',{name:'移动单人沙发',exact:true}).boundingBox();
    const from={x:box.x+box.width/2,y:box.y+box.height/2};
    const wait=response();
    if(cdp){
     await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[from]});
     await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y}]});
     await page.screenshot({path:`output/playwright/wall-drag-touch-${x}.png`});
     await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    }else{
     await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(x,y,{steps:8});
     await page.screenshot({path:`output/playwright/wall-drag-desktop-${x}.png`});await page.mouse.up();
    }
    const r=await(await wait).json();check(r.accepted,'wall drop rejected');
    await page.waitForFunction(()=>document.querySelector('[data-furniture="armchair"]')?.getAttribute('aria-disabled')==='false');
   }
   await click('确认摆放');const finish=response();await click('是，保存摆放');const receipt=await(await finish).json();
   check(receipt.accepted&&receipt.score_effect.reason==='AWAITING_L3_ENTRY','wall placement did not score');
   const state=await read();check(state.state.furniture.classification.eligible,'UI and server floor boundaries disagree');
   check(!errors.length,errors.join(';'));results.push({mobile,status:'PASS',metrics:state.state.furniture.classification.metrics});
  }catch(e){throw Error(e.message+'\n'+await page.locator('body').ariaSnapshot());}
  finally{await context.close();}
 }
 return results;
}
