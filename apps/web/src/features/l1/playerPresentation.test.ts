import test from "node:test";
import assert from "node:assert/strict";
import {journeyReview} from "./journeyReview";
import {playerMessage} from "../shared/playerMessage";
import {initialState,transition,type Action} from "./model";

test("player review uses accepted story actions, with no identifiers or mechanical duplicates",()=>{
 let state=initialState();
 const actions:Action[]=[{type:"choose",choice:"inspect-boat",yes:true},{type:"choose",choice:"search",yes:true},{type:"choose",choice:"search",yes:true},{type:"choose",choice:"swim",yes:false},{type:"choose",choice:"swim",yes:true},{type:"choose",choice:"board",yes:true}];
 for(const [i,action] of actions.entries())state=transition(state,{id:`private-id-${i}`,at:"2026-10-19",action});
 assert.deepEqual(journeyReview(state.events),["查看小船 · 是","拨开草丛 · 是","直接游泳 · 否","直接游泳 · 是"]);
});

test("technical failures are replaced without exposing codes or response details",()=>{
 for(const text of ["Failed to fetch","HTTP 503","L2_FINALIZED","服务器回执不完整或与当前操作不一致。","响应无效","事件格式错误"]){
  assert.equal(playerMessage(text),"暂时无法继续，请检查网络后重试。");
 }
});

test("player errors retain useful prerequisite and recovery instructions",()=>{
 assert.equal(playerMessage("请先完成第一幕，再进入第二幕。"),"请先完成第一幕，再进入第二幕。");
 assert.match(playerMessage("VERSION_CONFLICT"),/其他页面更新.*重新载入/);
 assert.match(playerMessage("SESSION_NOT_FOUND"),/返回第一幕重新开始/);
 assert.match(playerMessage("保存失败，请检查浏览器存储权限"),/检查浏览器.*重试/);
 assert.equal(playerMessage("连接中断，请重试同步。"),"连接中断，请重试。");
});
