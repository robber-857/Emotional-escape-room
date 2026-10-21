"use client";

import {useEffect,useState,type ReactNode} from "react";
import styles from "./level-heading.module.css";

export function LevelHeading({ready,className,children,after}:{ready:boolean;className:string;children:ReactNode;after?:ReactNode}) {
  const [faded,setFaded]=useState(false);
  useEffect(()=>{
    if(!ready)return;
    const timer=window.setTimeout(()=>setFaded(true),3000);
    return()=>window.clearTimeout(timer);
  },[ready]);
  return <><header className={`${className} ${styles.title}`} data-level-heading data-faded={faded} aria-hidden={faded}>{children}</header>{faded&&after&&<div className={`${className} ${styles.task}`} data-level-task>{after}</div>}</>;
}
