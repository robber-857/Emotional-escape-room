import type {Metadata} from "next";
import {L4Game} from "../../features/l4/L4Game";

export const metadata:Metadata={title:"门的选择 · 情感密室",description:"第四幕，在四扇门之间选择你的出口。"};
export default async function Page({searchParams}:{searchParams:Promise<{preview?:string}>}) {
  const params=await searchParams;
  return <L4Game key={params.preview==="1"?"preview":"server"} preview={params.preview==="1"}/>;
}
