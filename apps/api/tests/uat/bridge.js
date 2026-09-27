async page => {
 const check=(ok,msg)=>{if(!ok)throw new Error(msg)};
 const snap=async()=>await page.locator('body').ariaSnapshot();
 const click=async name=>{await page.getByRole('button',{name,exact:true}).click();await snap();};
 const action=async name=>{const wait=page.waitForResponse(r=>r.url().endsWith('/actions')&&r.request().method()==='POST');await click(name);const r=await(await wait).json();check(r.accepted,r.code);return r;};
 const drag=async (x,y)=>{const svg=page.getByRole('img',{name:'分离之河：河岸'});const points=await svg.evaluate((el,[x,y])=>{const m=el.getScreenCTM();return [[x,y],[960,1160]].map(([a,b])=>{const p=new DOMPoint(a,b).matrixTransform(m);return {x:p.x,y:p.y};});},[x,y]);await page.mouse.move(points[0].x,points[0].y);await page.mouse.down();await page.mouse.move(points[1].x,points[1].y,{steps:15});await page.mouse.up();await snap();};
 await click('打开游戏菜单');await click('重新开始旅程');await click('确认重新开始');
 await drag(2446.355,1426.75);check((await snap()).includes('还需要把绳子移过来'),'single material repaired');
 await page.reload();await snap();await click('继续上次旅程');await page.getByRole('button',{name:'木板，可拖动；方向键微调位置',exact:true}).waitFor();
 const repairWait=page.waitForResponse(r=>r.url().endsWith('/actions')&&r.request().postDataJSON()?.action?.choice==='repair');await drag(2104.5,1413.5);const repair=await(await repairWait).json();check(repair.accepted&&repair.session.state.repaired&&repair.session.state.scene==='river','repair should not cross');
 await page.getByRole('heading',{name:'从桥上走过去？'}).waitFor();await action('否');await click('木桥');const crossed=await action('是');check(crossed.session.state.route==='bridge','bridge route');
 await click('房门');const end=await action('是');check(end.session.state.scene==='complete','bridge complete');await page.getByRole('heading',{name:'你来到了门前'}).waitFor();await page.screenshot({path:'output/playwright/uat/bridge-complete.png'});
 return {case:'bridge-drag-draft-resume-refusal',status:'PASS',session_id:end.session.id,version:end.session.version};
}
