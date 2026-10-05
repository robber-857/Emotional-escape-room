import test from "node:test";
import assert from "node:assert/strict";
import { initialState } from "./model";
import { prepare, submit, readPending, RejectedAction, readDraft, hasJourneyProgress, type Session } from "./api";
const session: Session = { id:"test", token:"test-token", version:0, rules_version:"l1-rules-v1", state:initialState(), positions:{} };
function storage() {
  const values = new Map<string,string>();
  Object.defineProperty(globalThis, "localStorage", { configurable:true, value:{ getItem:(k:string)=>values.get(k) ?? null, setItem:(k:string,v:string)=>values.set(k,v), removeItem:(k:string)=>values.delete(k) } });
}
test("first visit and unused sessions do not offer a previous journey", () => {
  storage();
  assert.equal(hasJourneyProgress(null, null), false);
  assert.equal(hasJourneyProgress(session, null), false);
  localStorage.setItem("emotional:l1:draft:test", JSON.stringify({ring:{x:0,y:0}}));
  assert.equal(hasJourneyProgress(session, null), false);
  // Legacy rules initialize these fields even before a player makes a choice.
  assert.equal(hasJourneyProgress({...session,state:{...initialState(),bridgeInspected:true,ropeClicks:5}}, null), false);
});

test("saved choices, including refusals, and completed scenes remain resumable", () => {
  storage();
  assert.equal(hasJourneyProgress({...session,version:1}, null), true);
  const refusal = {id:"refusal",at:"2026-10-06T00:00:00Z",action:{type:"choose",choice:"swim",yes:false}} as const;
  assert.equal(hasJourneyProgress({...session,state:{...initialState(),events:[refusal]}}, null), true);
  assert.equal(hasJourneyProgress({...session,state:{...initialState(),scene:"complete"}}, null), true);
});

test("valid cosmetic movement preserves a journey without advancing server state", () => {
  storage();
  localStorage.setItem("emotional:l1:draft:test", JSON.stringify({ring:{x:0.1,y:0}}));
  assert.equal(hasJourneyProgress(session, null), true);
  assert.equal(session.version, 0);
  assert.deepEqual(session.state, initialState());
  localStorage.setItem("emotional:l1:draft:test", JSON.stringify({scene:"complete"}));
  assert.equal(hasJourneyProgress(session, null), false);
});

test("only pending actions belonging to the saved journey make it resumable", () => {
  storage();
  const pending = prepare(session, {type:"choose",choice:"swim",yes:true}, {});
  assert.equal(hasJourneyProgress(session, pending), true);
  assert.equal(hasJourneyProgress(session, {...pending,sessionId:"other"}), false);
  assert.equal(hasJourneyProgress(null, pending), false);
});

test("lost response preserves the same pending ID for deduplicated retry", async () => {
  storage(); const original = globalThis.fetch;
  try {
    const p = prepare(session, {type:"choose",choice:"search",yes:true}, {});
    globalThis.fetch = async () => { throw new Error("response lost"); };
    await assert.rejects(submit(session, p));
    assert.equal(readPending()?.action_id,p.action_id);
    assert.throws(()=>prepare(session,{type:"paddle"},{}));
    globalThis.fetch = async (_url, init) => {
      assert.equal(JSON.parse(init!.body as string).action_id,p.action_id);
      return Response.json({accepted:true,code:"ACCEPTED",version:1,duplicate:true,session:{...session,version:1}});
    };
    const result = await submit(session, readPending()!);
    assert.equal(result.receipt.duplicate,true);
    assert.equal(readPending(),null);
  } finally { globalThis.fetch = original; }
});
test("server rejection restores server state and clears the rejected request", async () => {
  storage(); const original = globalThis.fetch;
  try {
    const p = prepare(session,{type:"paddle"},{});
    globalThis.fetch = async () => Response.json({accepted:false,code:"PADDLE_NOT_ALLOWED",version:0,session}, {status:409});
    await assert.rejects(submit(session,p),RejectedAction);
    assert.equal(readPending(),null);
  } finally { globalThis.fetch = original; }
});
test("draft only contains bounded cosmetic positions", () => {
  storage();
  localStorage.setItem("emotional:l1:draft:test",JSON.stringify({planks:{x:-0.5,y:-0.1}}));
  assert.equal(readDraft(session).planks.x,-0.5);
  localStorage.setItem("emotional:l1:draft:test",JSON.stringify({scene:"complete"}));
  assert.deepEqual(readDraft(session),{});
});
