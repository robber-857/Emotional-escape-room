// Local-only fault/host-style harness. Never include in deployment startup.
// node tools/local-game-qa-proxy.mjs [upstream port=3004] [listen port=3015]
import http from 'node:http';
const upstream=`http://127.0.0.1:${Number(process.argv[2]||3004)}`;
const port=Number(process.argv[3]||3015);
let fault='none';const events=[];
http.createServer(async(req,res)=>{
  try {
    if(req.url==='/__qa/status') {res.setHeader('Content-Type','application/json');res.end(JSON.stringify({fault,events}));return;}
    if(req.url?.startsWith('/__qa/fault/')&&req.method==='POST') {
      fault=req.url.slice('/__qa/fault/'.length);res.end('ok');return;
    }
    const chunks=[];for await(const chunk of req)chunks.push(chunk);
    const body=Buffer.concat(chunks);
    const headers={...req.headers,host:new URL(upstream).host,'accept-encoding':'identity'};
    delete headers.connection;
    const isAction=/\/levels\/l2\/actions$/.test(req.url)&&req.method==='POST';
    const action=isAction?JSON.parse(body.toString()):null;
    if(isAction&&fault==='unavailable') {
      events.push({type:'unavailable',id:action.action_id});res.writeHead(503);res.end('Temporary unavailable');return;
    }
    const response=await fetch(upstream+req.url,{method:req.method,headers,body:body.length?body:undefined});
    let data=Buffer.from(await response.arrayBuffer());
    if(isAction) {
      const receipt=JSON.parse(data.toString());
      events.push({type:'action',id:action.action_id,action:action.action.type,accepted:receipt.accepted,duplicate:receipt.duplicate,version:receipt.session?.version});
      if(fault==='lose-response') {fault='none';res.destroy();return;}
    }
    if(/\/scoring$/.test(req.url))events.push({type:'scoring'});
    if(req.url?.startsWith('/game/'))events.push({type:'asset',url:req.url,bytes:data.length});
    const out=Object.fromEntries(response.headers);
    delete out['content-encoding'];delete out['transfer-encoding'];delete out['content-length'];
    if((out['content-type']||'').includes('text/html')){
      // Same reset responsible for the host integration regression, even loaded last.
      data=Buffer.from(data.toString().replace('</head>','<style data-qa-host-reset>*,::before,::after,::backdrop{margin:0;padding:0;box-sizing:border-box;border:0 solid}</style></head>'));
    }
    res.writeHead(response.status,out);res.end(data);
  } catch(error) {res.writeHead(502);res.end(String(error));}
}).listen(port,'127.0.0.1',()=>console.log(`Local QA proxy on ${port} -> ${upstream}`));
