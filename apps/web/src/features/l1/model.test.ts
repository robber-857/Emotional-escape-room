import test from "node:test";
import assert from "node:assert/strict";
import {
  initialState,
  transition,
  promptFor,
  type Action,
  type Choice,
  type L1State,
} from "./model";
import { woodAtGap, repairMaterialsReady } from "./geometry";
import { restore } from "./save";

let counter = 0;
const event = (action: Action) => ({
  id: `test-${++counter}`,
  at: "2026-09-26T00:00:00Z",
  action,
});
const choose = (s: L1State, choice: Choice, yes = true) =>
  transition(s, event({ type: "choose", choice, yes }));
const paddle = (s: L1State) => transition(s, event({ type: "paddle" }));
const saved = (s: L1State) =>
  JSON.stringify({
    version: 2,
    events: s.events,
    positions: { ring: { x: -0.1, y: 0.1 } },
  });

test("bridge requires wood and repair; repairing alone does not cross", () => {
  let s = initialState();
  assert.equal(choose(s, "cross-bridge"), s);
  assert.equal(choose(s, "repair"), s);
  s = choose(s, "collect-wood");
  assert.equal(s.wood, true);
  s = choose(s, "repair");
  assert.equal(s.scene, "river");
  assert.equal(s.repaired, true);
  assert.equal(s.wood, false);
  s = choose(s, "cross-bridge");
  assert.equal(s.scene, "shore");
  assert.equal(s.route, "bridge");
  assert.equal(choose(s, "swim"), s);
});

test("explicit no records refusal without locking subsequent yes", () => {
  let s = choose(initialState(), "swim", false);
  assert.equal(s.scene, "river");
  assert.equal(s.events.length, 1);
  assert.equal(s.events[0].action.type, "choose");
  s = choose(s, "swim");
  assert.equal(s.scene, "shore");
  assert.equal(s.route, "swim");
});

test("ring is a separate crossing route", () => {
  const s = choose(initialState(), "use-ring");
  assert.equal(s.scene, "shore");
  assert.equal(s.route, "ring");
  assert.equal(s.strokes, 0);
});

test("boat requires oar; exactly five valid, unique strokes, including after resume", () => {
  let s = initialState();
  assert.equal(choose(s, "board"), s);
  assert.equal(paddle(s), s);
  for (let i = 0; i < 5; i++) s = choose(s, "search");
  s = choose(s, "board");
  assert.equal(choose(s, "swim"), s);
  for (let i = 1; i <= 4; i++) {
    const e = event({ type: "paddle" });
    s = transition(s, e);
    assert.equal(s.strokes, i);
    assert.equal(s.scene, "river");
    assert.equal(transition(s, e), s);
  }
  s = restore(saved(s)).state;
  assert.equal(s.strokes, 4);
  const fifth = event({ type: "paddle" });
  s = transition(s, fifth);
  assert.equal(s.scene, "shore");
  assert.equal(s.route, "boat");
  assert.equal(s.strokes, 5);
  assert.equal(transition(s, fifth), s);
  assert.equal(paddle(s), s);
});

test("lamp and person order is preserved; direct entry is possible without invented refusal", () => {
  const shore = choose(initialState(), "swim");
  const direct = choose(shore, "enter");
  assert.equal(direct.scene, "complete");
  assert.equal(direct.events.length, 2);
  assert.equal(direct.greeted, false);
  assert.equal(direct.lampTaken, false);
  let s = choose(shore, "take-lamp");
  assert.equal(s.lampTaken, true);
  assert.equal(s.lampLit, false);
  s = choose(choose(s, "light-lamp", false), "greet");
  assert.equal(s.greeted, true);
  assert.equal(s.lampLit, false);
  s = choose(s, "enter");
  assert.equal(s.lampTaken, true);
  assert.equal(s.lampLit, false);
  assert.equal(choose(s, "light-lamp"), s);
});

test("light in place, take later, greet later are independent", () => {
  let s = choose(initialState(), "use-ring");
  s = choose(s, "light-lamp");
  assert.equal(s.lampLit, true);
  assert.equal(s.lampTaken, false);
  s = choose(choose(s, "take-lamp"), "greet");
  assert.equal(s.lampLit, true);
  assert.equal(s.lampTaken, true);
  assert.equal(s.greeted, true);
  assert.equal(choose(s, "greet"), s);
});

test("prompts follow actual prerequisites instead of offering impossible yes actions", () => {
  const s = initialState();
  assert.equal(promptFor(s, "bridge").choice, undefined);
  assert.equal(promptFor(s, "bridge").next, "planks");
  assert.equal(promptFor(s, "boat").next, "bush");
  assert.equal(
    promptFor(choose(s, "collect-wood"), "bridge").choice,
    undefined,
  );
  assert.equal(promptFor(choose(s, "search"), "boat").choice, undefined);
});

test("restore rejects corrupt, incompatible or out-of-order journals and invalid positions", () => {
  assert.throws(() => restore("{}"));
  assert.throws(() => restore("broken json"));
  assert.throws(() =>
    restore(JSON.stringify({ version: 99, events: [], positions: {} })),
  );
  assert.throws(() =>
    restore(
      JSON.stringify({
        version: 2,
        events: [event({ type: "paddle" })],
        positions: {},
      }),
    ),
  );
  assert.throws(() =>
    restore(
      JSON.stringify({
        version: 2,
        events: [],
        positions: { ring: { x: 999, y: 0 } },
      }),
    ),
  );
  const s = choose(initialState(), "swim");
  assert.deepEqual(restore(saved(s)).state, s);
  assert.deepEqual(restore(saved(s)).positions.ring, { x: -0.1, y: 0.1 });
});

test("five bush clicks survive resume; no and duplicate clicks do not advance", () => {
  let s = initialState();
  s = choose(s, "search", false);
  assert.equal(s.bushClicks, 0);
  for (let i = 1; i <= 4; i++) {
    const e = event({ type: "choose", choice: "search", yes: true });
    s = transition(s, e);
    assert.equal(s.bushClicks, i);
    assert.equal(s.oar, false);
    assert.equal(transition(s, e), s);
  }
  s = restore(saved(s)).state;
  s = choose(s, "search");
  assert.equal(s.oar, true);
  assert.equal(s.bushClicks, 5);
  assert.equal(choose(s, "search"), s);
  assert.equal(s.strokes, 0);
});

test("wood drop target requires centre inside gap, rejects other ground and invalid coordinates", () => {
  assert.equal(woodAtGap({ x: 0, y: 0 }), false);
  assert.equal(
    woodAtGap({ x: (960 - 2446.355) / 2944, y: (1160 - 1426.75) / 1568 }),
    true,
  );
  assert.equal(
    woodAtGap({ x: (1200 - 2446.355) / 2944, y: (1160 - 1426.75) / 1568 }),
    false,
  );
  assert.equal(woodAtGap({ x: NaN, y: 0 }), false);
});

test("repair requires both materials currently at gap, in either order and after resume", () => {
  const planks = { x: (880 - 2446.355) / 2944, y: (1160 - 1426.75) / 1568 };
  const rope = { x: (1080 - 2104.5) / 2944, y: (1160 - 1413.5) / 1568 };
  assert.equal(repairMaterialsReady({ planks }), false);
  assert.equal(repairMaterialsReady({ rope }), false);
  assert.equal(repairMaterialsReady({ planks, rope }), true);
  assert.equal(repairMaterialsReady({ rope, planks }), true);
  assert.equal(repairMaterialsReady({ planks, rope: { x: 0, y: 0 } }), false);
  assert.equal(repairMaterialsReady({ rope, planks: { x: 0, y: 0 } }), false);
  const restored = restore(
    JSON.stringify({ version: 2, events: [], positions: { rope } }),
  );
  assert.deepEqual(restored.positions.rope, rope);
  assert.equal(repairMaterialsReady({ ...restored.positions, planks }), true);
});

test("L1-02 greetings are independent, refusals retryable, both survive resume", () => {
  let s = choose(initialState(), "swim");
  s = choose(s, "greet-woman", false);
  assert.equal(s.greetedWoman, false);
  assert.equal(s.greeted, false);
  s = choose(s, "greet");
  assert.equal(s.greeted, true);
  assert.equal(s.greetedWoman, false);
  s = choose(s, "greet-woman");
  assert.equal(s.greetedWoman, true);
  assert.equal(choose(s, "greet-woman"), s);
  const restored = restore(saved(s)).state;
  assert.equal(restored.greeted, true);
  assert.equal(restored.greetedWoman, true);
  assert.equal(promptFor(restored, "woman").choice, undefined);
  assert.equal(promptFor(restored, "person").choice, undefined);
});

test("L1-02 lamp refusals do not imply taking or lighting, either order is allowed", () => {
  const shore = choose(initialState(), "swim");
  let s = choose(choose(shore, "take-lamp", false), "light-lamp", false);
  assert.equal(s.lampTaken, false);
  assert.equal(s.lampLit, false);
  s = choose(choose(s, "light-lamp"), "take-lamp");
  assert.equal(s.lampTaken, true);
  assert.equal(s.lampLit, true);
  const reverse = choose(choose(shore, "take-lamp"), "light-lamp");
  assert.equal(reverse.lampTaken, true);
  assert.equal(reverse.lampLit, true);
  assert.equal(choose(s, "light-lamp"), s);
});

test("L1-02 direct entry records no invented greetings; shore actions blocked at river", () => {
  const river = initialState();
  for (const choice of [
    "greet",
    "greet-woman",
    "take-lamp",
    "light-lamp",
    "enter",
  ] as Choice[])
    assert.equal(choose(river, choice), river);
  const s = choose(choose(river, "swim"), "enter");
  assert.equal(s.greeted, false);
  assert.equal(s.greetedWoman, false);
  assert.equal(s.lampTaken, false);
  assert.equal(s.events.length, 2);
});
