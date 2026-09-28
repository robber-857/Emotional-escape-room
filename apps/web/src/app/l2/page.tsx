import type { Metadata } from "next";
import { L2Game } from "../../features/l2/L2Game";
export const metadata: Metadata = {title:"失联房间 · 情感密室",description:"第二幕：桌边、座位和钥匙选择。"};
export default function Page(){return <L2Game/>;}
