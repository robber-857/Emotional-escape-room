"use client";
import {useEffect,useRef,useState} from "react";
import {SESSION_KEY} from "../l1/api";
import * as api from "./api";

export function useServerL4(enabled:boolean){
  const [session,setSession]=useState<api.Session|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(""),[conflict,setConflict]=useState(false);
  const current=useRef<api.Session|null>(null),locked=useRef(false),epoch=useRef(0);
  function apply(s:api.Session){current.current=s;setSession(s);}
  async function run(action?:api.Action):Promise<boolean>{
    if(!enabled||locked.current)return false;
    locked.current=true;const ticket=++epoch.current;setBusy(true);setError("");
    try{
      const auth=api.credentials();
      const next=await api.withSessionLock(auth.id,async()=>{
        if(ticket!==epoch.current)throw Error("页面进度已改变，请重新同步。");
        api.assertCurrent(auth);
        if(action){
          if(!current.current||current.current.id!==auth.id)throw Error("旅程已切换，请重新同步。");
          return api.submit(auth,api.prepare(current.current,action));
        }
        const saved=await api.start(auth),pending=api.readPending(auth.id);
        return pending?api.submit(auth,pending):saved;
      });
      if(ticket!==epoch.current)return false;
      apply(next);setConflict(false);return true;
    }catch(e){
      if(ticket===epoch.current){
        if(e instanceof api.RejectedAction){apply(e.session);setConflict(false);setError(e.code==="VERSION_CONFLICT"?"旅程已在其他页面更新，请重试同步后继续。":e.code==="L4_COMPLETE"?"本关已确认出口，请同步最新选择。":`服务器未接受选择（${e.code}），请重试同步。`);}
        else setError(e instanceof Error?e.message:"无法连接服务器，请重试同步。");
      }
      return false;
    }finally{if(ticket===epoch.current){locked.current=false;setBusy(false);}}
  }
  useEffect(()=>{
    if(!enabled)return;
    void run();
    const changed=(event:StorageEvent)=>{
      if(event.key===null||event.key===SESSION_KEY||(current.current&&event.key===api.changeKey(current.current.id))){
        epoch.current++;locked.current=false;setBusy(false);setConflict(true);
      }
    };
    window.addEventListener("storage",changed);
    return()=>{epoch.current++;locked.current=false;window.removeEventListener("storage",changed);};
  },[enabled]);
  return {session,loaded:session!==null,busy,error,conflict,sync:()=>run(),confirm:(door:api.DoorId)=>run({type:"confirm",door})};
}
