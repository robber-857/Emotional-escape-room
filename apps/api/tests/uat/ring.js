async page => {
 const check=(ok,msg)=>{if(!ok)throw new Error(msg)};
 const snap=async()=>console.log(await page.locator('body').ariaSnapshot());
 const click=async name=>{await page.getByRole('button',{name,exact:true}).click();await snap();};
 const action=async name=>{const wait=page.waitForResponse(r=>r.url().endsWith('/actions')&&r.request().method()==='POST');await click(name);const r=await(await wait).json();check(r.accepted,r.code);return r;};
 await click('打开游戏菜单');await click('重新开始旅程');await click('确认重新开始');await page.getByRole('button',{name:'开始探索'}).waitFor({state:'hidden'});
 await click('救生圈，可拖动；方向键微调位置');const ring=await action('是');check(ring.session.state.route==='ring','ring route');
 await click('灯');const wait=page.waitForResponse(r=>r.url().endsWith('/actions'));await page.getByRole('button',{name:'是',exact:true}).nth(1).click();await snap();const lit=await(await wait).json();check(lit.session.state.lampLit&&!lit.session.state.lampTaken,'light in place');
 const taken=await action('是');check(taken.session.state.lampTaken&&taken.session.state.lampLit,'take lit lamp');
 await click('关闭提示，继续探索');await click('房门');const end=await action('是');check(end.session.state.scene==='complete','ring complete');
 await page.getByRole('heading',{name:'你来到了门前'}).waitFor();await page.screenshot({path:'output/playwright/uat/ring-complete.png'});
 return {case:'ring-light-before-take',status:'PASS',session_id:end.session.id,version:end.session.version};
}
