import test from "node:test";
import assert from "node:assert/strict";
import { initialState } from "./model";
import { prepare, submit, readPending, RejectedAction, readDraft, type Session } from "./api";
const session: Session = { id:"test", token:"test-token", version:0, rules_version:"l1-rules-v1", state:initialState(), positions:{} };
function storage() {
  const values = new Map<string,string>();
  Object.defineProperty(globalThis, "localStorage", { configurable:true, value:{ getItem:(k:string)=>values.get(k) ?? null, setItem:(k:string,v:string)=>values.set(k,v), removeItem:(k:string)=>values.delete(k) } });
}
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
