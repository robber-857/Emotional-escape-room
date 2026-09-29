"use client";
import {useEffect,useRef,useState} from "react";
import {SESSION_KEY} from "../l1/api";
import {initialState,type Action} from "./model";
import * as api from "./api";

export function useServerL3(enabled:boolean){
 const [state,setState]=useState(initialState),[loaded,setLoaded]=useState(false);
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[conflict,setConflict]=useState(false);
 const session=useRef<api.Session|null>(null),locked=useRef(false),epoch=useRef(0);
 function apply(s:api.Session){session.current=s;setState(api.toView(s));setLoaded(true);}
 async function run(action?:Action):Promise<boolean>{
  if(!enabled||locked.current)return false;
  locked.current=true;const ticket=++epoch.current;setBusy(true);setError("");
  try{
   const auth=api.credentials();
   const next=await api.withSessionLock(auth.id,async()=>{
    if(ticket!==epoch.current)throw Error("页面进度已改变，请重新同步。");
    api.assertCurrent(auth);
    if(action){
     if(!session.current||session.current.id!==auth.id)throw Error("旅程已切换，请重新载入。");
     return api.submit(auth,api.prepare(session.current,action));
    }
    const saved=await api.start(auth),pending=api.readPending(auth.id);
    return pending?api.submit(auth,pending):saved;
   });
   if(ticket!==epoch.current)return false;
   apply(next);setConflict(false);return true;
  }catch(e){
   if(ticket===epoch.current){
    if(e instanceof api.RejectedAction){apply(e.session);setConflict(false);setError(e.code==="VERSION_CONFLICT"?"进度已由其他页面更新，本次操作未生效。请重试同步后继续。":e.code==="CONFIRM_SLOT_RESERVED"?"更换物品的记录额度已满，当前预选已保留。请重试同步后确认携带。":`服务器未接受本次操作（${e.code}），请重试同步。`);}
    else setError(e instanceof Error?e.message:"无法连接服务器，请重试同步。");
   }
   return false;
  }finally{if(ticket===epoch.current){locked.current=false;setBusy(false);}}
 }
 useEffect(()=>{
  if(!enabled)return;
  void run();
  const changed=(e:StorageEvent)=>{
   if(e.key===null||e.key===SESSION_KEY||(session.current&&e.key===api.changeKey(session.current.id))){
    // A stale response must not change a newly selected journey or acknowledge a choice.
    epoch.current++;locked.current=false;setBusy(false);setConflict(true);
   }
  };
  window.addEventListener("storage",changed);
  return()=>{epoch.current++;locked.current=false;window.removeEventListener("storage",changed);};
 },[enabled]);
 return {state,loaded,busy,error,conflict,sessionId:session.current?.id,sync:()=>run(),act:(a:Action)=>run(a)};
}
