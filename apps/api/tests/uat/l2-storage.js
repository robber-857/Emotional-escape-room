async original => {
 const results=[];
 for(const mobile of [false,true]){
  const context=await original.context().browser().newContext({viewport:mobile?{width:844,height:390}:{width:1280,height:720},hasTouch:mobile,isMobile:mobile});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const url=original.url().split('/').slice(0,3).join('/')+'/l2?preview=1',key='emotional:l2:preview:v2';
  const click=async name=>{const button=page.getByRole('button',{name,exact:true});if(mobile)await button.tap();else await button.click();};
  const saved=()=>page.evaluate(key=>localStorage.getItem(key),key);
  const ready=()=>page.waitForFunction(()=>document.querySelector('[aria-label="走到桌边"]')?.getAttribute('aria-disabled')==='false');
  const check=(ok,message)=>{if(!ok)throw new Error(message);};
  try{
   await page.goto(url);await ready();
   // Explicit edge-case fixture in an isolated browser profile, not a gameplay/UAT result.
   await page.evaluate(key=>localStorage.setItem(key,JSON.stringify({version:1,events:Array.from({length:999},(_,i)=>({id:`capacity-${i}`,at:'2026-09-28T00:00:00Z',action:{type:'sit',seat:'chair',yes:false}}))})),key);
   await page.reload();await ready();await click('坐在窗边椅');await click('否');
   await page.getByRole('alert').filter({hasText:'本机记录已满'}).waitFor();
   const full=await saved();check(JSON.parse(full).events.length===1000,'last permitted action missing');
   check(await page.getByRole('button',{name:'走到桌边',exact:true}).getAttribute('aria-disabled')==='true','full journal still interactive');
   await page.reload();await page.getByRole('alert').filter({hasText:'本机记录已满'}).waitFor();check(await saved()===full,'reload changed full journal');
   await click('打开第二幕菜单');await click('查看本机选择');await page.getByRole('heading',{name:'本机选择记录'}).waitFor();await click('关闭菜单');
   await click('重新开始');await page.getByText(/全部 L2 进度，包括座位、钥匙与开门、耳环寻找、家具摆放及事件记录/).waitFor();await click('保留当前进度');check(await saved()===full,'cancel reset changed journal');
   await click('重新开始');await click('确认重新开始');await ready();check(JSON.parse(await saved()).events.length===0,'reset failed');
   await page.evaluate(key=>localStorage.setItem(key,'{broken'),key);await page.reload();await page.getByRole('alert').filter({hasText:'本机存档无法读取'}).waitFor();check(await saved()==='{broken','corrupt journal overwritten');
   await click('重新开始');await click('确认重新开始');await ready();
   const peer=await context.newPage();await peer.goto(url);await peer.waitForFunction(()=>document.querySelector('[aria-label="走到桌边"]')?.getAttribute('aria-disabled')==='false');
   await peer.getByRole('button',{name:'走到桌边',exact:true}).click();
   await page.getByRole('alert').filter({hasText:'另一标签页更新了进度'}).waitFor();const latest=await saved();
   check(await page.getByRole('button',{name:'走到桌边',exact:true}).getAttribute('aria-disabled')==='true','stale tab not blocked');
   await click('载入最新进度');await ready();check(await saved()===latest,'reload overwrote peer progress');await peer.close();
   // Deny writes after load to verify the UI does not claim an unsaved key was collected.
   await page.evaluate(()=>{Storage.prototype.setItem=function(){throw new DOMException('Test storage denied','QuotaExceededError');};});
   await click('走到桌边');await click('选择钥匙1');await page.getByRole('alert').filter({hasText:'保存失败'}).waitFor();
   check(await saved()===latest,'failed write changed journal');check(await page.getByRole('button',{name:'物品栏：钥匙1',exact:true}).count()===0,'unsaved key shown as collected');
   check(errors.length===0,errors.join(';'));results.push({mobile,status:'PASS',cases:['capacity fixture and final real action','full reload','inspect records','cancel and confirm reset','corrupt journal','cross-tab conflict','write failure']});
  }finally{await context.close();}
 }
 return results;
}
