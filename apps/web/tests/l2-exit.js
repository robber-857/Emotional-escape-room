async original=>{
 const results=[],base=original.url().split('/').slice(0,3).join('/');
 for(const mobile of [false,true])for(const preview of [false,true]){
  const context=await original.context().browser().newContext({viewport:mobile?{width:844,height:390}:{width:1280,height:720},hasTouch:mobile,isMobile:mobile});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const check=(ok,message)=>{if(!ok)throw Error(message);};
  const click=async name=>{const region=page.getByRole('region',{name:'场景提示',exact:true});const inner=region.getByRole('button',{name,exact:true});const b=await inner.count()?inner:page.getByRole('button',{name,exact:true});await (mobile?b.tap():b.click());};
  const idle=()=>page.waitForFunction(()=>document.querySelector('[aria-label="走到桌边"],[aria-label="移动双人沙发"]')?.getAttribute('aria-disabled')==='false');
  const action=async(name,type)=>{if(preview){await click(name);return;}const wait=page.waitForResponse(r=>r.url().endsWith('/actions')&&r.request().method()==='POST'&&r.request().postDataJSON().action.type===type);await click(name);const r=await(await wait).json();check(r.accepted,r.code);return r;};
  const snapshot=()=>page.evaluate(async()=>{const a=JSON.parse(localStorage.getItem('emotional:l1:server:v1'));if(!a)return null;const h={Authorization:`Bearer ${a.token}`};return {l1:await(await fetch(`/api/v1/sessions/${a.id}`,{headers:h})).json(),l2:await(await fetch(`/api/v1/sessions/${a.id}/levels/l2`,{headers:h})).json()};});
  const cdp=mobile?await context.newCDPSession(page):null;
  async function drag(x,y,dx,dy){const box=await page.getByRole('img',{name:'失联房间：大厅',exact:true}).boundingBox();const a={x:box.x+x*box.width/1920,y:box.y+y*box.height/1049},b={x:a.x+dx*box.width/1920,y:a.y+dy*box.height/1049};if(cdp){await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...a,id:1}]});for(let i=1;i<=12;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:a.x+(b.x-a.x)*i/12,y:a.y+(b.y-a.y)*i/12,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}else{await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:12});await page.mouse.up();}}
  try{
   if(preview)await page.goto(base+'/l2?preview=1');
   else{await page.goto(base+'/');await click('开始探索');await click('河面');await action('是','choose');await click('房门');await action('是','choose');await page.getByRole('link',{name:'进入第二幕',exact:true}).click();}
   await idle();const initial=await snapshot();
   await action('走到桌边','arrive-table');await action('选择钥匙1','select-key');await click('去开门试试');await action('用钥匙1开门','try-door');
   await action('回到桌边拿钥匙','view');await action('拿起钥匙2','select-key');await click('去开门试试');await action('用钥匙2开门','try-door');
   await action('否','explore');await idle();check(page.url().includes('/l2'),'decline left L2');
   await action('整理家具','layout-start');await idle();await click('确认摆放');await action('是，保存摆放','layout-confirm');await idle();check(!await page.locator('[data-layer="l2-exit-door"]').count(),'unchanged layout unlocked exit');
   await action('整理家具','layout-start');await idle();const sofa=page.locator('[data-furniture="sofa"]'),before=await sofa.getAttribute('transform');
   // Floating drops remain where released; confirmation saves without unlocking.
   const floating=preview?null:page.waitForResponse(r=>r.url().endsWith('/actions')&&r.request().postDataJSON().action.type==='layout-move');
   await drag(1510,675,-1154,-280);if(floating)check((await(await floating).json()).accepted,'floating drop rejected');await idle();check(await sofa.getAttribute('transform')!==before,'floating drop snapped back');
   check(!await page.getByText('这里放不稳，请换一个地点',{exact:true}).count(),'old rejection shown');
   await click('确认摆放');await action('是，保存摆放','layout-confirm');await idle();check(!await page.locator('[data-layer="l2-exit-door"]').count(),'floating layout unlocked exit');
   await page.reload();await idle();check(await sofa.getAttribute('transform')!==before,'floating drop lost on reload');
   await action('整理家具','layout-start');await idle();await action('撤销移动','layout-undo');await idle();
   // Original anchor (1510,925) -> left floor (356,895), normalized (.1,.5).
   const wait=preview?null:page.waitForResponse(r=>r.url().endsWith('/actions')&&r.request().postDataJSON().action.type==='layout-move');
   await drag(1510,675,-1154,-30);if(wait)check((await(await wait).json()).accepted,'left drop rejected');await idle();check(await sofa.getAttribute('transform')!==before,'sofa did not move left');
   await click('确认摆放');await action('是，保存摆放','layout-confirm');await idle();await page.locator('[data-layer="l2-exit-door"]').waitFor();
   await page.reload();await idle();await page.locator('[data-layer="l2-exit-door"]').waitFor();
   if(!preview){const s=await snapshot();check(s.l2.completion==='complete'&&s.l2.state.exitDoorOpen,'server completion missing');check(Math.abs(s.l2.state.furniture.layout.sofa.u-.1)<.001,'server left position wrong');check(s.l2.scoring.totals===null,'invented score');check(JSON.stringify(s.l1)===JSON.stringify(initial.l1),'L1 modified');}
   await page.screenshot({path:`output/playwright/l2-exit-${preview?'preview':'server'}-${mobile?'mobile':'desktop'}.png`});
   await click('查看通往第三幕的门');await page.getByText(/第三幕目前为本地预览/).waitFor();await page.getByRole('link',{name:'是，进入第三幕',exact:true}).click();await page.waitForURL('**/l3?preview=1&from=l2');await page.getByRole('button',{name:'查看半开的门',exact:true}).waitFor();
   if(!preview){const s=await snapshot();check(s.l2.completion==='complete'&&JSON.stringify(s.l1)===JSON.stringify(initial.l1),'L3 modified server run');}
   check(!errors.length,errors.join(';'));results.push({mobile,preview,status:'PASS',cases:['decline stays L2','unchanged confirm locked','floating drop saved without unlocking','large sofa left floor','confirm opens other door','refresh persists','L3 local preview','L1 retained']});
  }catch(e){throw Error(e.message+'\n'+await page.locator('body').ariaSnapshot());}finally{await context.close();}
 }
 return results;
}
