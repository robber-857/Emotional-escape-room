"use client";
import Link from "next/link";
import styles from "./restartJourney.module.css";
export function RestartJourney({floating=false}:{floating?:boolean}) {
 return <Link className={floating?styles.floating:styles.button} href="/?restart=1">从第一幕重新开始</Link>;
}
