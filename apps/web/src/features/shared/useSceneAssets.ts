"use client";
import {useEffect, useState} from "react";
import {gameAsset} from "./gameAsset";

const loaded = new Set<string>();
const pending = new Map<string,Promise<void>>();
function loadAsset(path:string):Promise<void> {
  const url=gameAsset(path);
  if(loaded.has(url)) return Promise.resolve();
  const existing=pending.get(url);
  if(existing) return existing;
  const request=new Promise<void>((resolve,reject)=>{
    const image=new Image();
    const timer=setTimeout(()=>{image.onload=null;image.onerror=null;reject(Error("素材加载超时"));},20000);
    image.onload=()=>{clearTimeout(timer);loaded.add(url);resolve();};
    image.onerror=()=>{clearTimeout(timer);reject(Error("素材加载失败"));};
    image.src=url;
  }).finally(()=>pending.delete(url));
  pending.set(url,request);
  return request;
}

export function useSceneAssets(paths:string[], attempt:number) {
  const key=JSON.stringify(paths);
  const [result,setResult]=useState({key:"",attempt:-1,ready:false,error:false});
  useEffect(()=>{
    let active=true;
    Promise.all((JSON.parse(key) as string[]).map(loadAsset))
      .then(()=>{if(active)setResult({key,attempt,ready:true,error:false});})
      .catch(()=>{if(active)setResult({key,attempt,ready:false,error:true});});
    return()=>{active=false;};
  },[key,attempt]);
  const matches=result.key===key&&result.attempt===attempt;
  return {ready:matches&&result.ready,error:matches&&result.error};
}
