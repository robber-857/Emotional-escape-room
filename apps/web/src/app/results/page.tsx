import type {Metadata} from 'next';
import {ResultPage} from '../../features/results/ResultPage';
export const metadata:Metadata={title:'你的恋爱性格 · 情感密室'};
export default async function Page({searchParams}:{searchParams:Promise<{preview?:string}>}){const p=await searchParams;return <ResultPage key={p.preview==='1'?'preview':'server'} preview={p.preview==='1'}/>;}
