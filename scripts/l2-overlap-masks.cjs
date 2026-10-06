// Rebuild scene-space alpha masks from the same SVG image crops as Scene.tsx.
const sharp=require('sharp');
const fs=require('node:fs');
const crypto=require('node:crypto');
const specs={armchair:[42,585,470,422,0,0,1,1],chair:[1059,574,173,247,-.3095,-.1535,1.571,1.2876],sofa:[1176,581,768,370,-.0548,-.2011,1.099,1.3554],'table-chair':[637,594,850*.76,850*2/3*.8,0,0,1,1]};
(async()=>{
 const result={method:'scene-alpha-strips-v4-resized-table',step:4,alphaThreshold:128,pieces:{}};
 for(const [id,[x,y,w,h,cx,cy,cw,ch]] of Object.entries(specs)){
  const file=fs.readFileSync(`apps/web/public/game/l2/${id}.png`);
  const {data,info}=await sharp(file).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const rows=[];
  for(let dy=0;dy<h;dy+=4){
   let start=null;const runs=[];
   for(let dx=0;dx<w;dx+=4){
    const sx=Math.floor(((dx+Math.min(4,w-dx)/2)/w-cx)/cw*info.width);
    const sy=Math.floor(((dy+Math.min(4,h-dy)/2)/h-cy)/ch*info.height);
    const filled=sx>=0&&sx<info.width&&sy>=0&&sy<info.height&&data[(sy*info.width+sx)*4+3]>=128;
    if(filled&&start===null)start=dx;
    if(!filled&&start!==null){runs.push([x+start,x+dx]);start=null;}
   }
   if(start!==null)runs.push([x+start,x+w]);
   if(runs.length)rows.push([y+dy,y+Math.min(dy+4,h),runs]);
  }
  result.pieces[id]={sha256:crypto.createHash('sha256').update(file).digest('hex'),rows};
 }
 fs.writeFileSync('apps/api/app/config/l2-overlap-masks.json',JSON.stringify(result)+'\n');
})();
