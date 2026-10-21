import type {Metadata} from "next";
import {L3Game} from "../../features/l3/L3Game";
export const metadata:Metadata = {title:"风暴大厅 · 情感密室",description:"走进风暴大厅，作出你的选择，挑选陪伴旅程的物品。"};
export default async function Page({searchParams}:{searchParams:Promise<{preview?:string;segment?:string}>}) {
  const params = await searchParams;
  const preview=params.preview==="1";
  const segment=preview&&params.segment==="carry"?"carry":"storm";
  return <L3Game key={preview?`preview-${segment}`:"server"} segment={segment} preview={preview}/>;
}
