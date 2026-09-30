async original=>{
 const results=[],base=new URL(original.url()).origin;
 for(const mobile of [false,true])for(const scenario of ['edge','floating','stacked']){
  const context=await original.context().browser().newContext({viewport:mobile?{width:844,height:390}:{width:1280,height:720},hasTouch:mobile,isMobile:mobile});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const check=(ok,message)=>{if(!ok)throw new Error(`${mobile}/${scenario}: ${message}`);};
  const click=async name=>{const prompt=page.getByRole('region',{name:'场景提示',exact:true}).getByRole('button',{name,exact:true});const b=await prompt.count()?prompt:page.getByRole('button',{name,exact:true});if(mobile)await b.tap();else await b.click();};
  const action=async(name,type)=>{const wait=page.waitForResponse(r=>r.url().endsWith('/actions')&&r.request().method()==='POST'&&r.request().postDataJSON().action.type===type);await click(name);const body=await(await wait).json();check(body.accepted,body.code);return body;};
  try{
   await page.goto(base+'/');await click('开始探索');await page.getByRole('button',{name:'河面',exact:true}).waitFor();await click('河面');await action('是','choose');await click('房门');const parent=(await action('是','choose')).session;
   await page.getByRole('link',{name:'进入第二幕',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[aria-label="走到桌边"]')?.getAttribute('aria-disabled')==='false');
   const initial=(await action('整理家具','layout-start')).session;
   await page.waitForFunction(()=>document.querySelector('[aria-label="移动桌椅组合"]')?.getAttribute('aria-disabled')==='false');
   const sofa=initial.state.furniture.layout.sofa,target=scenario==='edge'?{u:sofa.u-.29,v:sofa.v}:scenario==='stacked'?sofa:{u:.45,v:.05-100/270};
   const projected={x:960+(target.u-.5)*(1100+820*Math.max(0,target.v)),y:760+270*target.v};
   const box=await page.getByRole('img',{name:'失联房间：大厅',exact:true}).boundingBox();
   const a={x:box.x+1370*box.width/1920,y:box.y+950*box.height/1049};
   const b={x:a.x+(projected.x-1510)*box.width/1920,y:a.y+(projected.y-1013)*box.height/1049};
   const wait=page.waitForResponse(r=>r.url().endsWith('/actions')&&r.request().postDataJSON().action.type==='layout-move');
   if(mobile){const cdp=await context.newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...a,id:1}]});for(let i=1;i<=12;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:a.x+(b.x-a.x)*i/12,y:a.y+(b.y-a.y)*i/12,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
   else{await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:12});await page.mouse.up();}
   const moved=await(await wait).json();check(moved.accepted,'drag rejected');check(moved.action.id==='table-chair'||moved.session.state.furniture.layout['table-chair'].u!==initial.state.furniture.layout['table-chair'].u,'wrong furniture dragged');
   await click('确认摆放');const saved=await action('是，保存摆放','layout-confirm'),state=saved.session.state;
   check(state.furniture.classification.ruleVersion==='l2-placement-v5','old rule');check(state.furniture.classification.tidy===(scenario==='edge'),'wrong tidy result');check(state.exitDoorOpen===true,'wrong exit state');
   const confirmed=state.furniture.confirmed['table-chair'];check(Math.abs(confirmed.u-target.u)<.003&&Math.abs(confirmed.v-target.v)<.01,'drag target mismatch');
   if(scenario==='floating')check(state.furniture.classification.suspensionGapsPx['table-chair']>90,'floating not reproduced');
   await page.reload();await page.waitForFunction(()=>document.querySelector('[aria-label="走到桌边"]')?.getAttribute('aria-disabled')==='false');
   check(await page.locator('[data-layer="l2-exit-door"]').count()===1,'door after reload');
   const evidence=await page.evaluate(async()=>{const auth=JSON.parse(localStorage.getItem('emotional:l1:server:v1')),headers={Authorization:`Bearer ${auth.token}`};return {l1:await(await fetch(`/api/v1/sessions/${auth.id}`,{headers})).json(),l2:await(await fetch(`/api/v1/sessions/${auth.id}/levels/l2`,{headers})).json(),receipts:await(await fetch(`/api/v1/sessions/${auth.id}/levels/l2/events`,{headers})).json()};});
   check(JSON.stringify(evidence.l1.state)===JSON.stringify(parent.state),'L1 changed');check(JSON.stringify(evidence.l2.state.furniture.confirmed)===JSON.stringify(state.furniture.confirmed),'saved layout changed');check(evidence.receipts.at(-1).validation_version==='l2-validation-v6','old receipt');check(errors.length===0,errors.join(';'));
   const screenshot=`output/playwright/l2-v5-${mobile?'touch':'desktop'}-${scenario}.png`;await page.screenshot({path:screenshot});
   await click('进入第三幕');const started=page.waitForResponse(r=>r.url().endsWith('/levels/l3')&&r.request().method()==='POST');await page.getByRole('link',{name:'是，进入第三幕',exact:true}).click();check((await started).ok(),'L3 start rejected');await page.waitForURL('**/l3?from=l2');
   results.push({mobile,scenario,status:'PASS',session_id:parent.id,tidy:state.furniture.classification.tidy,suspensionGap:state.furniture.classification.suspensionGapsPx['table-chair'],screenshot});
  }finally{await context.close();}
 }
 return results;
}
