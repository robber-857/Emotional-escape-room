"use client";

import {useEffect,useRef,useState} from "react";
import styles from "./act-opening.module.css";

export function ActOpening({act,title,prompt,ready,onEnter}:{act:string;title:string;prompt:string;ready:boolean;onEnter:()=>void}) {
  const dialog=useRef<HTMLDialogElement>(null);
  const [portrait,setPortrait]=useState(true);
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
      <button className="gameYes" onClick={onEnter}>开始探索 <span aria-hidden="true">→</span></button>
    </div>
  </dialog>;
}
