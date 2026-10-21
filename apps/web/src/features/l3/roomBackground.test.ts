import test from "node:test";
import assert from "node:assert/strict";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {RoomBackground} from "./RoomBackground";
import {initialState,transition,serialize,restore,type Action} from "./model";

test("prepared room visuals survive carry transition and saved journey reload",()=>{
  for(const door of ["ajar","open","closed"]){
    for(const left of [false,true])for(const curtain of [false,true])for(const right of [false,true])for(const television of [false,true]){
      if(!curtain&&right)continue;
      let state=initialState();
      let id=0;
      const apply=(action:Action)=>{state=transition(state,{id:String(++id),at:"2026-10-22T00:00:00Z",action});};
      apply({type:"decision",slot:"open",yes:door!=="ajar"});
      apply({type:"decision",slot:"close",yes:door==="closed"});
      apply({type:"decision",slot:"window",yes:left});
      apply({type:"decision",slot:"curtain",yes:curtain});
      if(curtain)apply({type:"decision",slot:"right-window",yes:right});
      apply({type:"decision",slot:"television",yes:television});
      const render=()=>renderToStaticMarkup(createElement("svg",null,createElement(RoomBackground,{choices:state.choices})));
      const before=render();
      assert.ok(before.includes(`data-television-power="${television?"off":"on"}"`));
      assert.ok(before.includes(`data-layer="${door==="closed"?(left?"closed-window":"storm"):door==="open"?"outside":"entry"}"`));
      if(left)assert.ok(before.includes('data-layer="closed-window"'));
      if(curtain)assert.ok(before.includes(`data-layer="${right?"open-curtain":"open-curtain-window-open"}"`));
      apply({type:"finish-preparation"});
      assert.equal(state.segment,"carry");
      assert.equal(render(),before);
      state=restore(serialize(state),"storm");
      assert.equal(state.segment,"carry");
      assert.equal(render(),before);
    }
  }
});
