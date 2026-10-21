"use client";

import {useEffect,useRef,useState} from "react";
import styles from "./act-opening.module.css";

export function ActOpening({act,title,prompt,ready,onEnter,resume=false,journeyId}:{act:string;title:string;prompt:string;ready:boolean;onEnter:()=>void;resume?:boolean;journeyId?:string}) {
  const dialog=useRef<HTMLDialogElement>(null);
  const [portrait,setPortrait]=useState(true);
  const [visited,setVisited]=useState(false);
  const visitKey=journeyId?`emotional:opening:${journeyId}:${act}`:null;
  useEffect(()=>{
    try{setVisited(!!visitKey&&localStorage.getItem(visitKey)==="entered");}catch{setVisited(false);}
  },[visitKey]);
  function enter(){
    try{if(visitKey)localStorage.setItem(visitKey,"entered");}catch{/* Opening history is optional; gameplay remains available. */}
    onEnter();
  }
  const continuing=resume||visited;
  useEffect(()=>{
    const query=matchMedia("(orientation: portrait) and (max-width: 700px), (pointer: coarse) and (orientation: portrait) and (max-width: 900px)");
    const update=()=>setPortrait(query.matches);
    update();query.addEventListener("change",update);
    return()=>query.removeEventListener("change",update);
  },[]);
  useEffect(()=>{
    const element=dialog.current;
    if(ready&&!portrait)element?.showModal();else element?.close();
    return()=>element?.close();
  },[ready,portrait]);
  return <dialog ref={dialog} className={styles.opening} aria-label={`${act}开场`} onCancel={event=>event.preventDefault()}>
    <div className={styles.content}>
      <p className={styles.eyebrow}>{act}</p>
      <h2>{title}</h2>
      <p className={styles.prompt}>{prompt}</p>
      <button className={`gameYes ${continuing?styles.resume:""}`} onClick={enter}>{continuing?"继续上次旅程":"开始探索"} <span aria-hidden="true">→</span></button>
    </div>
  </dialog>;
}
