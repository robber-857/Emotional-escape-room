import test from "node:test";
import assert from "node:assert/strict";
import {initialState,transition,restore,type State,type Action} from "./model";
let id=0;
const act=(s:State,action:Action)=>transition(s,{id:`choice-${++id}`,at:"2026-10-21T00:00:00Z",action});

test("two distinct choices unlock; furniture edits and repeated confirmations do not farm progress",()=>{
 let s=act(initialState(),{type:"layout-start"});
 s=act(s,{type:"layout-confirm"});assert.equal(s.exitDoorOpen,false);
 s=act(s,{type:"layout-start"});s=act(s,{type:"layout-confirm"});
 assert.deepEqual(s.choiceActions,["furniture"]);assert.equal(s.exitDoorOpen,false);
 s=act(s,{type:"arrive-table"});assert.equal(s.exitDoorOpen,false);
 s=act(s,{type:"select-key",key:"key-1"});assert.equal(s.exitDoorOpen,true);
 assert.deepEqual(restore(JSON.stringify({version:1,events:s.events})),s);
});

test("taking a key then trying the door unlocks without furniture; repeated IDs don't count",()=>{
 let s=act(initialState(),{type:"arrive-table"});
 s=act(s,{type:"select-key",key:"key-1"});assert.equal(s.exitDoorOpen,false);
 assert.equal(transition(s,s.events.at(-1)!),s);
 s=act(s,{type:"try-door",key:"key-1"});assert.equal(s.exitDoorOpen,true);
 assert.deepEqual(s.attempts,["key-1"]);assert.equal(s.doorOpen,false);
});
