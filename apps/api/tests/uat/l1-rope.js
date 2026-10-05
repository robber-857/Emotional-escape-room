async original => {
  const results = [];
  for (const mobile of [false, true]) {
    const context = await original.context().browser().newContext({viewport:mobile ? {width:844,height:390} : {width:1280,height:720},hasTouch:mobile,isMobile:mobile});
    const page = await context.newPage();
    const errors=[]; page.on('pageerror',e=>errors.push(e.message));
    const check=(ok,message)=>{if(!ok)throw new Error(message);};
    const button=name=>page.getByRole('button',{name,exact:true});
    const click=async name=>mobile ? button(name).tap() : button(name).click();
    const idle=()=>page.waitForFunction(()=>document.querySelector('[data-layer="rope-bush"]')?.getAttribute('aria-disabled')==='false');
    const state=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('emotional:l1:server:v1')).state);
    const step=async name=>{
      const response=page.waitForResponse(r=>r.url().endsWith('/actions')&&r.request().method()==='POST');
      await click(name); const result=await(await response).json();
      check(result.accepted,result.code); await idle(); return result.session;
    };
    try {
      await page.goto('http://127.0.0.1:3104/'); await click('开始探索'); await idle();
      const rope=page.locator('[data-layer="rope"]');
      check(await rope.count()===0,'rope visible initially');
      await click('小船');
      check((await page.locator('[data-game-prompt]').innerText()).includes('小船还缺一支船桨'),'boat prompt missing');
      await click('关闭提示，继续探索');
      for(let i=0;i<5;i++)await click('上方草丛');
      check((await state()).ropeClicks===0,'boat unlocked rope');
      check(await rope.count()===0,'rope appeared before bridge');
      await step('木桥'); await click('关闭提示，继续探索');
      // Place the wood first: this is cosmetic until both materials reach the gap.
      const drag=async(x,y)=>{
        const points=await page.getByRole('img',{name:'分离之河：河岸'}).evaluate((el,[x,y])=>{
          const m=el.getScreenCTM();return [[x,y],[960,1160]].map(([a,b])=>{const p=new DOMPoint(a,b).matrixTransform(m);return {x:p.x,y:p.y};});
        },[x,y]);
        await page.mouse.move(points[0].x,points[0].y);await page.mouse.down();
        await page.mouse.move(points[1].x,points[1].y,{steps:15});await page.mouse.up();
      };
      if(!mobile){
        await drag(2446.355,1426.75);
        await page.getByText('木板就位，还缺绳子。',{exact:true}).waitFor();
        await click('关闭提示，继续探索');
      }
      await page.screenshot({path:`output/playwright/l1-hidden-rope-${mobile?'touch':'desktop'}-hidden.png`});
      for(let n=1;n<=3;n++){
        check((await step('上方草丛')).state.ropeClicks===n,'wrong click count');
        check(await rope.count()===0,'rope released early');
      }
      await page.reload();await click('继续上次旅程');await idle();
      check((await state()).bridgeInspected,'bridge inspection lost after refresh');
      check((await step('上方草丛')).state.ropeClicks===4,'fourth click incorrect');
      check(await rope.count()===0,'rope visible on fourth click');
      check((await step('上方草丛')).state.ropeClicks===5,'fifth click failed');
      check(await rope.getAttribute('transform')==='translate(0 0)','rope not on bank');
      check(await button('绳子，可拖动；方向键微调位置').count()===1,'rope not draggable');
      await page.screenshot({path:`output/playwright/l1-hidden-rope-${mobile?'touch':'desktop'}-released.png`});
      await page.reload();await click('继续上次旅程');await idle();
      check(await rope.count()===1,'rope hidden after refresh');
      if(!mobile){
        const repaired=page.waitForResponse(r=>r.url().endsWith('/actions')&&r.request().postDataJSON()?.action?.choice==='repair');
        await drag(2104.5,1413.5);const result=await(await repaired).json();
        check(result.accepted&&result.session.state.repaired&&result.session.state.scene==='river','repair failed');
        await page.getByRole('heading',{name:'要从桥上走过去吗？'}).waitFor();
      }
      const receipts=await page.evaluate(async()=>{
        const s=JSON.parse(localStorage.getItem('emotional:l1:server:v1'));
        return(await fetch(`/api/v1/sessions/${s.id}/events`,{headers:{Authorization:`Bearer ${s.token}`}})).json();
      });
      check(receipts.filter(r=>r.accepted&&r.action.choice==='take-rope').length===5,'wrong rope receipt count');
      check(errors.length===0,errors.join('\n'));
      results.push({mode:mobile?'touch':'desktop',status:'PASS',boatGate:true,fifthClick:true,refresh:true,repair:!mobile});
    } finally {await context.close();}
  }
  return results;
}
