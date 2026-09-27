async page => {
 const check=(ok,msg)=>{if(!ok)throw new Error(msg)};
 const snap=async()=>console.log(await page.locator('body').ariaSnapshot());
 const click=async name=>{await page.getByRole('button',{name,exact:true}).click(); await snap();};
 const action=async name=>{const wait=page.waitForResponse(r=>r.url().endsWith('/actions')&&r.request().method()==='POST');await click(name);const r=await (await wait).json();check(r.accepted,JSON.stringify(r));return r;};
 await click('打开游戏菜单');await click('重新开始旅程');const start=page.waitForResponse(r=>r.url().endsWith('/sessions')&&r.request().method()==='POST');await click('确认重新开始');const created=await(await start).json();console.log('SESSION_SWIM',created.id);
 await click('河面');const no=await action('否');check(no.session.state.scene==='river','refusal moved scene');
 await click('河面');const swim=await action('是');check(swim.session.state.route==='swim','swim route');
 await click('门边的男子');const man=await action('是');check(man.session.state.greeted&&!man.session.state.greetedWoman,'greetings coupled');
 await click('关闭提示，继续探索');await click('门边的女子');const womanNo=await action('否');check(!womanNo.session.state.greetedWoman,'woman refusal ignored');
 await click('门边的女子');const woman=await action('是');check(woman.session.state.greetedWoman,'woman greeting failed');
 await click('关闭提示，继续探索');await click('灯');
 const lampWait=page.waitForResponse(r=>r.url().endsWith('/actions'));await page.getByRole('button',{name:'是',exact:true}).first().click();await snap();const lamp=await(await lampWait).json();check(lamp.session.state.lampTaken&&!lamp.session.state.lampLit,'take lamp');
 const unlit=await action('否');check(!unlit.session.state.lampLit,'lamp refusal');
 await click('物品栏：未点亮的灯');const lit=await action('是');check(lit.session.state.lampLit,'light lamp');
 await click('关闭提示，继续探索');await click('打开游戏菜单');await click('保存并返回');await click('继续上次旅程');
 await page.getByRole('button',{name:'物品栏：亮着的灯',exact:true}).waitFor();
 await click('房门');await action('否');await click('房门');const end=await action('是');check(end.session.state.scene==='complete','completion');
 await page.getByRole('heading',{name:'你来到了门前'}).waitFor();await page.screenshot({path:'output/playwright/uat/swim-complete.png'});
 return {case:'swim-refusal-greetings-lamp-save',status:'PASS',session_id:end.session.id,version:end.session.version};
}
