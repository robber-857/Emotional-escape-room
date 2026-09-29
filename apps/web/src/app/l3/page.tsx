import type {Metadata} from "next";
import Link from "next/link";
import {L3Game} from "../../features/l3/L3Game";
import styles from "../../features/l3/l3.module.css";
export const metadata:Metadata = {title:"风暴大厅 · 情感密室",description:"第三幕前端独立预览；尚未接入服务器存档。"};
export default async function Page({searchParams}:{searchParams:Promise<{preview?:string;segment?:string}>}) {
  const params = await searchParams;
  if (params.preview !== "1") return <main className={styles.gate}>
    <p>第三幕 · 风暴大厅</p><h1>L3 尚未接入正式旅程</h1>
    <p>在 L2 合理摆放家具并确认后，可从打开的另一扇门进入本地预览。L3 服务器存档尚未接入。</p>
    <Link href="/l2">返回第二幕</Link><Link href="/l3?preview=1">打开独立本地预览</Link>
  </main>;
  return <L3Game key={params.segment === "carry" ? "carry" : "storm"} segment={params.segment === "carry" ? "carry" : "storm"}/>;
}
