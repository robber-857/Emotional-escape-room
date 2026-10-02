async original => {
  const base = new URL(original.url()).origin;
  const results = [];
  for (const mobile of [false, true]) {
    for (const [option, v, t] of [['direct', -2, 1], ['returned', 0, -2], ['stayed', 2, 1]]) {
      const context = await original.context().browser().newContext({ viewport: mobile ? {width:956,height:440} : {width:1440,height:900}, hasTouch:mobile, isMobile:mobile });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', e => errors.push(e.message));
      const check = (ok, message) => { if (!ok) throw new Error(message); };
      try {
        // Prepare only the prerequisite journey and unlocked door via the real API.
        const auth = await (await context.request.post(base+'/api/v1/sessions', {data:{}})).json();
        const headers = {Authorization:`Bearer ${auth.token}`};
        let version = 0;
        const send = async (url, action) => {
          const r = await (await context.request.post(url+'/actions', {headers,data:{action_id:crypto.randomUUID(),expected_version:version,action}})).json();
          check(r.accepted, r.code); version = r.version; return r;
        };
        const root = base+`/api/v1/sessions/${auth.id}`;
        await send(root,{type:'choose',choice:'swim',yes:true});
        await send(root,{type:'choose',choice:'enter',yes:true});
        await context.request.post(root+'/levels/l2',{headers,data:{}}); version = 0;
        for (const action of [{type:'arrive-table'},{type:'select-key',key:'key-1'},{type:'try-door',key:'key-1'},{type:'select-key',key:'key-2'},{type:'try-door',key:'key-2'}]) await send(root+'/levels/l2',action);
        await page.goto(base);
        await page.evaluate(s => localStorage.setItem('emotional:l1:server:v1',JSON.stringify(s)),auth);
        await page.goto(base+'/l2');
        await page.getByRole('navigation',{name:'房间探索操作'}).waitFor();
        await page.locator('body').ariaSnapshot();
        const click = async name => {
          const prompt = page.getByRole('region',{name:'场景提示'}).getByRole('button',{name,exact:true});
          const nav = page.getByRole('navigation',{name:'房间探索操作'}).getByRole('button',{name,exact:true});
          const button = await prompt.count() ? prompt : await nav.count() ? nav : page.getByRole('button',{name,exact:true});
          if (mobile) await button.tap(); else await button.click();
          await page.locator('body').ariaSnapshot();
        };
        const act = async name => {
          const wait = page.waitForResponse(r=>r.url().endsWith('/actions') && r.request().method()==='POST');
          await click(name); const r = await (await wait).json(); check(r.accepted,r.code); return r;
        };
        const ledger = async () => (await (await context.request.get(root+'/scoring',{headers})).json()).ledger.filter(e=>e.group_id==='l2.explore');
        await click('查看半开的门');
        if (option !== 'direct') {
          await act('否'); check((await ledger()).length===0,'premature refusal scoring');
          await page.reload(); await page.locator('body').ariaSnapshot();
          await page.getByRole('navigation',{name:'房间探索操作'}).waitFor();
          if (option==='returned') await click('查看半开的门');
        }
        if (option!=='stayed') {
          const r = await act('是，进去探索');
          check(r.score_effect.delta.V===v && r.score_effect.delta.T===t && r.score_effect.delta.A===null,'entry vector');
          await click('返回大厅'); await act('是，返回大厅');
        }
        await act('整理家具'); await click('确认摆放'); await act('是，保存摆放');
        await click('进入第三幕');
        const started = page.waitForResponse(r=>r.url().endsWith('/levels/l3') && r.request().method()==='POST');
        await page.getByRole('link',{name:'是，进入第三幕',exact:true}).click();
        check((await started).ok(),'L3 not started');
        const rows = await ledger();
        check(rows.length===1 && rows[0].option_id===option,'wrong mutually exclusive outcome');
        check(rows[0].vector.V===v && rows[0].vector.T===t && rows[0].vector.A===null && rows[0].vector.F===null,'wrong final score');
        await page.screenshot({path:`output/playwright/l2-explore/${mobile?'touch':'desktop'}-${option}.png`});
        check(errors.length===0,errors.join(';'));
        results.push({environment:mobile?'touch-956x440':'desktop',option,vector:rows[0].vector,status:'PASS'});
      } finally { await context.close(); }
    }
  }
  return {status:'PASS',results,prerequisites:'L1 completion and key unlock prepared by API; door decisions and L2 exit exercised through UI'};
}
