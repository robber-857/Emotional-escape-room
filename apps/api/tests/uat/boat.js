async page => {
 const check=(ok,msg)=>{if(!ok)throw new Error(msg)};
 const snap=async()=>await page.locator('body').ariaSnapshot();
 const click=async name=>{await page.getByRole('button',{name,exact:true}).click();await snap();};
 const action=async name=>{const wait=page.waitForResponse(r=>r.url().endsWith('/actions')&&r.request().method()==='POST');await click(name);const r=await(await wait).json();check(r.accepted,r.code);return r;};
 await click('打开游戏菜单');await click('重新开始旅程');await click('确认重新开始');
 await click('小船');check((await snap()).includes('小船还缺一支船桨'),'missing oar prompt');await click('关闭提示，继续探索');
 const first=await action('草丛');check(first.session.state.bushClicks===1&&!first.session.state.oar,'first search');
 let originalId; let serverProcessed=false;
 await page.route('**/actions',async route=>{originalId=route.request().postDataJSON().action_id;const real=await route.fetch();const result=await real.json();check(result.accepted&&result.session.state.bushClicks===2,'lost response server commit');serverProcessed=true;await route.abort('failed');},{times:1});
 await click('拨开草丛 · 1 / 5');await page.getByRole('button',{name:'重试同步 / 载入服务器进度'}).waitFor();check(serverProcessed,'did not commit');
 const retry=await action('重试同步 / 载入服务器进度');check(retry.duplicate&&retry.session.state.bushClicks===2,'duplicate counted twice');check(retry.session.state.events.at(-1).id===originalId,'retry id changed');
 const third=await action('草丛');check(third.session.state.bushClicks===3,'third');await action('拨开草丛 · 3 / 5');
 await page.reload();await snap();await click('继续上次旅程');await page.getByRole('button',{name:'草丛',exact:true}).waitFor();
 const fifth=await action('草丛');check(fifth.session.state.bushClicks===5&&fifth.session.state.oar,'fifth search');
 await page.getByRole('button',{name:'是',exact:true}).click({trial:true});
 const board=await action('是');check(board.session.state.rowing&&board.session.state.strokes===0,'board strokes');
 for(let i=1;i<=5;i++){const wait=page.waitForResponse(r=>r.url().endsWith('/actions'));await page.getByRole('button',{name:/^划桨一次/}).click();const r=await(await wait).json();check(r.accepted&&r.session.state.strokes===i,'stroke '+i);check(r.session.state.scene===(i===5?'shore':'river'),'early shore');await snap();}
 await click('房门');const end=await action('是');check(end.session.state.route==='boat'&&!end.session.state.lampTaken,'boat result');await page.getByRole('heading',{name:'你来到了门前'}).waitFor();await page.screenshot({path:'output/playwright/uat/boat-complete.png'});
 return {case:'boat-response-loss-resume',status:'PASS',session_id:end.session.id,version:end.session.version};
}
