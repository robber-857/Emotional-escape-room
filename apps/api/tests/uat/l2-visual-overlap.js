async page=>{
 const base='http://127.0.0.1:3120';
 const enterCover = async () => {
   const cover = page.locator('[data-game-cover]');
   await page.waitForFunction(() => {
     const cover = document.querySelector('[data-game-cover]');
     return !cover || cover.getAttribute('data-stage') === '3';
   });
   await page.locator('body').ariaSnapshot();
   if (await cover.count() && await cover.getAttribute('data-mobile') === 'false')
     await page.getByRole('button', { name: '进入你的故事', exact: true }).click();
   await cover.waitFor({ state: 'hidden' });
   await page.locator('body').ariaSnapshot();
 };
 await page.goto(base);await enterCover();
 await page.setViewportSize({width:1440,height:900});
 await page.evaluate(async()=>{
  const auth=await(await fetch('/api/v1/sessions',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).json();
  localStorage.setItem('emotional:l1:server:v1',JSON.stringify(auth));
  const root=`/api/v1/sessions/${auth.id}`,headers={Authorization:`Bearer ${auth.token}`,'Content-Type':'application/json'};
  const post=async(path,data)=>{const r=await fetch(root+path,{method:'POST',headers,body:JSON.stringify(data)});if(!r.ok)throw Error(await r.text());return r.json();};
  let l1=await(await fetch(root,{headers})).json();
  for(const choice of ['swim','enter']){const r=await post('/actions',{action_id:crypto.randomUUID(),expected_version:l1.version,action:{type:'choose',choice,yes:true},positions:{}});l1=r.session;}
  let s=await post('/levels/l2',{});
  const act=async action=>{const r=await post('/levels/l2/actions',{action_id:crypto.randomUUID(),expected_version:s.version,action});s=r.session;};
  await act({type:'layout-start'});
  for(const [id,point] of Object.entries({armchair:{u:.1,v:.85},'table-chair':{u:.2,v:.65},chair:{u:.8,v:.2},sofa:{u:.75,v:.55}}))await act({type:'layout-move',id,point});
 });
 await page.goto(base+'/l2');
 await page.getByRole('button',{name:'确认摆放',exact:true}).click();
 const pending=page.waitForResponse(r=>r.url().endsWith('/actions')&&r.request().method()==='POST');
 await page.getByRole('button',{name:'是，保存摆放',exact:true}).click();
 const response=await pending,receipt=await response.json();
 const groups=receipt.session.state.furniture.assessment.placement.evidence.overlapGroups;
 if(groups.band!==2||groups.pairs.length!==2||groups.triples.length)throw Error(JSON.stringify(groups));
 const duplicate=await page.evaluate(async request=>{const a=JSON.parse(localStorage.getItem('emotional:l1:server:v1'));return(await fetch(`/api/v1/sessions/${a.id}/levels/l2/actions`,{method:'POST',headers:{Authorization:`Bearer ${a.token}`,'Content-Type':'application/json'},body:JSON.stringify(request)})).json();},response.request().postDataJSON());
 if(!duplicate.duplicate)throw Error('retry was not deduplicated');
 await page.screenshot({path:'output/l2-overlap-scene.png'});
 await page.getByRole('button',{name:'进入第三幕',exact:true}).click();
 const entered=page.waitForResponse(r=>r.url().endsWith('/levels/l3')&&r.request().method()==='POST');
 await page.getByRole('link',{name:'是，进入第三幕',exact:true}).click();
 await page.waitForURL('**/l3?from=l2');
 await entered;
 await page.goto(base+'/l2');
 const panel=page.getByRole('complementary',{name:'服务端计分测试'});
 await panel.getByRole('button',{name:/^服务端计分/}).click();
 const detail=panel.getByText('整齐度计算明细：第 2/4 档',{exact:true});await detail.click();
 await panel.getByText('两两重叠 2 对：单人沙发＋桌椅组合；窗边椅＋双人沙发。',{exact:true}).waitFor();
 await page.screenshot({path:'output/l2-overlap-settled-desktop.png'});
 await page.reload();
 await panel.getByRole('button',{name:/^服务端计分/}).click();
 await detail.click();
 await panel.getByText(/两两重叠 2 对/).waitFor();
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:'output/l2-overlap-settled-mobile.png'});
 const score=await page.evaluate(async()=>{const a=JSON.parse(localStorage.getItem('emotional:l1:server:v1'));return(await fetch(`/api/v1/sessions/${a.id}/scoring`,{headers:{Authorization:`Bearer ${a.token}`}})).json();});
 const row=score.ledger.find(e=>e.group_id==='l2.furniture.tidiness');
 if(row.option_id!=='2'||row.vector.F!==-1)throw Error('wrong settled score');
 console.log(JSON.stringify({status:'PASS',session:score.session_id,groups,score:row.vector,retry:duplicate.duplicate}));
}
