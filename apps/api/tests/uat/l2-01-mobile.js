async original=>{
 const context=await original.context().browser().newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{await page.goto(original.url().split('/').slice(0,3).join('/')+'/l2');await page.getByText('为了保证用户体验请翻转手机为横屏',{exact:true}).waitFor();await page.setViewportSize({width:844,height:390});await page.getByText('为了保证用户体验请翻转手机为横屏',{exact:true}).waitFor({state:'hidden'});await page.waitForFunction(()=>document.querySelector('[aria-label="走到桌边"]').getAttribute('aria-disabled')==='false');
 await page.getByRole('button',{name:'坐在桌前椅',exact:true}).tap();await page.getByRole('button',{name:'是，坐下'}).tap();await page.getByRole('button',{name:'选择钥匙1',exact:true}).waitFor();
 const box=await page.getByRole('region',{name:'场景提示'}).boundingBox();if(!box||box.x<0||box.y<0||box.x+box.width>844||box.y+box.height>390)throw new Error('prompt clipped');await page.screenshot({path:'output/playwright/l2-keys-mobile.jpg',type:'jpeg',quality:65});
 await page.getByRole('button',{name:'选择钥匙1',exact:true}).tap();await page.getByRole('button',{name:'物品栏：钥匙1',exact:true}).waitFor();await page.reload();await page.getByRole('button',{name:'物品栏：钥匙1',exact:true}).waitFor();
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth||document.documentElement.scrollHeight>innerHeight);if(overflow||errors.length)throw new Error(JSON.stringify({overflow,errors}));return {status:'PASS',cases:['portrait gate','touch seat and key','landscape fit','restore'],environment:'Chromium touch emulation, not physical device',pageErrors:errors};
 }finally{await context.close();}
}
