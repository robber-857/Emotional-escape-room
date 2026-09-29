async original => {
 const context=await original.context().browser().newContext({viewport:{width:1280,height:720}});
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const url=original.url().split('/').slice(0,3).join('/')+'/l2?preview=1';
 const prompt='桌上有两把钥匙，你想先选哪一把？';
 const save=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('emotional:l2:preview:v2')));
 const check=(ok,msg)=>{if(!ok)throw new Error(msg);};
 async function ready(){await page.getByRole('button',{name:'走到桌边',exact:true}).waitFor();await page.waitForFunction(()=>document.querySelector('[aria-label="走到桌边"]').getAttribute('aria-disabled')==='false');}
 async function reset(){await page.getByRole('button',{name:'打开第二幕菜单'}).click();await page.getByRole('button',{name:'重新开始',exact:true}).click();await page.getByRole('button',{name:'确认重新开始'}).click();await ready();}
 try {
  await page.goto(url);await ready();check(await page.getByRole('button',{name:/坐在(单人椅|沙发)/}).count()===0,'sofa is interactive');check(await page.getByRole('heading',{name:prompt}).count()===0,'initial prompt');
  await page.getByRole('button',{name:'坐在窗边椅',exact:true}).click();await page.getByRole('button',{name:'关闭提示，继续探索'}).click();check(await save()===null,'close created event');
  await page.getByRole('button',{name:'坐在窗边椅',exact:true}).click();await page.getByRole('button',{name:'否',exact:true}).click();check(await page.getByRole('heading',{name:prompt}).count()===0,'decline unlocked keys');
  for(const seat of ['窗边椅','桌前椅']){
   await reset();await page.getByRole('button',{name:`坐在${seat}`,exact:true}).click();await page.getByRole('button',{name:'是，坐下'}).click();if(seat==='桌前椅'){await page.getByRole('img',{name:'失联房间：坐在桌前'}).waitFor();await page.getByRole('heading',{name:prompt}).waitFor();}else{check(await page.getByRole('heading',{name:prompt}).count()===0,'window chair showed keys');check(await page.getByRole('button',{name:'回到桌边拿钥匙',exact:true}).count()===0,'window chair unlocked table');}
   check((await save()).events.length===1,'seat added table/key event');check(await page.getByRole('button',{name:'物品栏：钥匙1',exact:true}).count()===0,'auto pickup');
   if(seat==='桌前椅'){await page.getByRole('button',{name:'关闭提示，继续探索'}).click();await page.getByRole('button',{name:'起身回大厅'}).click();}
  }
  await page.getByRole('button',{name:'走到桌边',exact:true}).click();await page.getByRole('button',{name:'选择钥匙1',exact:true}).click();await page.getByRole('button',{name:'物品栏：钥匙1',exact:true}).waitFor();check(await page.locator('[data-layer="key-1"]').count()===0,'key still on table');
  await page.reload();await ready();await page.getByRole('button',{name:'物品栏：钥匙1',exact:true}).click();await page.getByRole('button',{name:'选择钥匙2',exact:true}).click();await page.getByRole('button',{name:'物品栏：钥匙2',exact:true}).waitFor();check(await page.locator('[data-layer="key-2"]').count()===0,'key2 still on table');
  await reset();const table=page.getByRole('button',{name:'走到桌边',exact:true});await table.focus();await page.keyboard.press('Enter');await page.getByRole('heading',{name:prompt}).waitFor();await page.screenshot({path:'output/playwright/l2-keys-desktop.jpg',type:'jpeg',quality:65});await page.getByRole('button',{name:'选择钥匙2',exact:true}).click();check((await save()).events.every(e=>e.action.type!=='sit'),'table requires seat');
  check(errors.length===0,errors.join(';'));return {status:'PASS',cases:['close/decline','two chairs only; window chair does not unlock; table chair switches view and prompts','explicit pickup','refresh restore','two inventory keys','reset','table-only keyboard'],pageErrors:errors};
 }finally{await context.close();}
}
