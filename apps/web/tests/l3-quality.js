async original => {
 const base=original.url().split('/').slice(0,3).join('/');const ctx=await original.context().browser().newContext({viewport:{width:1280,height:720},reducedMotion:'reduce'});const page=await ctx.newPage();
 try {
  await ctx.route('**/game/l3/entry.png',r=>r.abort());await page.goto(base+'/l3?preview=1');await page.getByText('场景素材加载失败。',{exact:true}).waitFor();
  if(!await page.getByRole('button',{name:'查看半开的门',exact:true}).isDisabled())throw Error('assets failed but actions enabled');
  await ctx.unroute('**/game/l3/entry.png');await page.getByRole('button',{name:'重新加载素材'}).click();
  const open=page.getByRole('button',{name:'查看半开的门',exact:true});await page.waitForFunction(()=>document.querySelector('[aria-label="查看半开的门"]')?.getAttribute('aria-disabled')==='false');await open.focus();await open.press('Enter');await page.getByRole('button',{name:'是',exact:true}).click();
  await page.getByRole('button',{name:'查看敞开的门',exact:true}).click();await page.getByRole('button',{name:'是',exact:true}).click();
  await page.getByRole('button',{name:'查看左窗',exact:true}).click();await page.getByRole('button',{name:'是',exact:true}).click();
  await page.locator('[data-layer="curtain"]').waitFor();await page.screenshot({path:'output/playwright/l3-closed-curtain-desktop.png'});
  if(await page.locator('svg[aria-label="风暴大厅场景"]').evaluate(e=>getComputedStyle(e).animationName)!=='none')throw Error('reduced motion not applied');
  const geometry=await page.locator('svg[aria-label="风暴大厅场景"] image').evaluateAll(nodes=>nodes.filter(e=>!e.closest('defs')).map(e=>({src:e.getAttribute('href'),width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height})));
  if(geometry.some(e=>!e.src.startsWith('/game/l3/')||e.width<=0||e.height<=0))throw Error('invalid image geometry '+JSON.stringify(geometry));
  await page.goto(base+'/l3?preview=1&segment=carry');await page.getByRole('button',{name:'查看可携带的物品'}).click();await page.getByRole('button',{name:'是',exact:true}).click();
  await page.evaluate(()=>{const events=[{id:'full-0',at:'2026-09-29T00:00:00Z',action:{type:'carry',yes:true}}];for(let i=1;i<400;i++)events.push({id:'full-'+i,at:'2026-09-29T00:00:00Z',action:{type:'draft',item:i%2?'key':'scarf'}});localStorage.setItem('emotional:l3:preview:v1:carry',JSON.stringify({version:1,source:'local_preview',segment:'carry',events}));});
  await page.reload();await page.getByText('本地记录已满，请查看记录或重新开始此片段。',{exact:true}).waitFor();
  if(!await page.getByRole('button',{name:'确认携带钥匙',exact:true}).isDisabled())throw Error('full log still allows confirmation');
  return {status:'PASS',coverage:'asset load failure/retry; keyboard hotspot; reduced motion; closed-window/closed-curtain composition; positive local image geometry; full log blocks confirmation',geometry};
 } finally {await ctx.close();}
}
