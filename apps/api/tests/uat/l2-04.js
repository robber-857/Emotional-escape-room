async original=>{
 const results=[];
 for(const mobile of [false,true]){
 const context=await original.context().browser().newContext({viewport:mobile?{width:844,height:390}:{width:1280,height:720},hasTouch:mobile,isMobile:mobile});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const click=async name=>{const b=page.getByRole('button',{name,exact:true});if(mobile)await b.tap();else await b.click();await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));};
 const events=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('emotional:l2:preview:v2')).events);
 const cdp=mobile?await context.newCDPSession(page):null;
 async function drag(x,y,dx,dy){const box=await page.getByRole('img',{name:'失联房间：大厅',exact:true}).boundingBox();const a={x:box.x+x*box.width/1920,y:box.y+y*box.height/1049},b={x:a.x+dx*box.width/1920,y:a.y+dy*box.height/1049};if(cdp){await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...a,id:1}]});for(let i=1;i<=12;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:a.x+(b.x-a.x)*i/12,y:a.y+(b.y-a.y)*i/12,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}else{await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:12});await page.mouse.up();}}
 try{await page.goto(original.url().split('/').slice(0,3).join('/')+'/l2?preview=1');await page.waitForFunction(()=>document.querySelector('[aria-label="走到桌边"]')?.getAttribute('aria-disabled')==='false');if(await page.locator('[data-layer="cabinet"]').count()!==1)throw new Error('hall cabinet missing');await click('整理家具');if(await page.locator('[data-layer="cabinet"]').count())throw new Error('cabinet remains in arrangement');if(await page.getByRole('button',{name:/^移动/}).count()!==4)throw new Error('four movable pieces required');
 const chair=page.locator('[data-furniture="chair"]'),table=page.locator('[data-furniture="table-chair"]');const before=await chair.getAttribute('transform');
 // Chair anchor (1145,810) to projected ground (.45,.35)=(890.65,854.5).
 await drag(1145,650,-254.35,44.5);if(await chair.getAttribute('transform')===before)throw new Error('chair did not move');let es=await events();if(es.filter(e=>e.action.type==='layout-move').length!==1)throw new Error('drag should commit once');
 const moved=await chair.getAttribute('transform');await drag(890.65,690,619.35,70.5);if(await chair.getAttribute('transform')===moved)throw new Error('overlap snapped back');await click('撤销移动');await drag(890.65,690,0,-400);if(await chair.getAttribute('transform')===moved)throw new Error('floating drop snapped back');await click('撤销移动');
 // Move combined table/seat, including attached keys and interaction hotspots.
 const tableBefore=await table.getAttribute('transform');await drag(1370,950,-639.85,-23.5);if(await table.getAttribute('transform')===tableBefore)throw new Error('table did not move');
 await click('撤销移动');if(await table.getAttribute('transform')!==tableBefore)throw new Error('undo failed '+JSON.stringify({errors,tableBefore,actual:await table.getAttribute('transform'),events:await events()}));await drag(1370,950,-639.85,-23.5);
 const tableMoved=await table.getAttribute('transform');await page.reload();await page.getByRole('button',{name:'确认摆放',exact:true}).waitFor();if(await table.getAttribute('transform')!==tableMoved)throw new Error('draft restore failed');
 await click('恢复初始摆放');await click('是，恢复初始');if(await chair.getAttribute('transform')!==before)throw new Error('reset failed');await click('撤销移动');if(await table.getAttribute('transform')!==tableMoved)throw new Error('undo reset failed');
 await click('确认摆放');await click('否，继续调整');await page.getByRole('button',{name:'移动窗边椅',exact:true}).focus();await page.keyboard.press('ArrowRight');await click('确认摆放');await click('是，保存摆放');await page.getByRole('button',{name:'整理家具',exact:true}).waitFor();if(await page.locator('[data-layer="cabinet"]').count()!==1)throw new Error('cabinet not restored');
 await page.screenshot({path:`output/playwright/l2-layout-${mobile?'mobile':'desktop'}.jpg`,type:'jpeg',quality:65});
 await page.getByRole('button',{name:'坐在桌前椅',exact:true}).click();await click('是，坐下');await page.getByRole('img',{name:'失联房间：坐在桌前',exact:true}).waitFor();await click('关闭提示，继续探索');await click('起身回大厅');if(await table.getAttribute('transform')!==tableMoved)throw new Error('layout lost after table view');
 await click('打开第二幕菜单');await click('查看本机选择');await page.getByText(/累计有效调整：/).waitFor();await page.getByText(/最近确认：靠墙／窗程度/).waitFor();await click('关闭菜单');
 es=await events();if(es.filter(e=>e.action.type==='layout-confirm').length!==1)throw new Error('confirmation duplicated');if(errors.length)throw new Error(errors.join(';'));results.push({mobile,status:'PASS',cases:['four pieces','real drag','free overlap and floating drops','table combination','undo/reset','reload','keyboard','confirm','moved seat hotspot']});
 }finally{await context.close();}
 }return results;
}
