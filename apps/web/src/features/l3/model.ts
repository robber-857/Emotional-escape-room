export const SAVE_KEY = "emotional:l3:preview:v1";
export const MAX_EVENTS = 400;
export const items = {
  scarf: "围巾", lantern: "小灯笼", umbrella: "雨伞", compass: "指南针",
  doll: "小玩偶", key: "钥匙", journal: "日记本", rope: "登山绳", backpack: "背包",
} as const;
export type Item = keyof typeof items;
// Television is the canonical power action in both preview and server modes.
export const decisions = {
  open: "打开半开的门", close: "关上门", wait: "坐稳等待",
  curtain: "拉开右窗窗帘", window: "关闭左窗", television: "关掉电视机电源",
} as const;
export type Decision = keyof typeof decisions;
export type Segment = "storm" | "carry";
export type Action = {type: "decision"; slot: Decision; yes: boolean}
  | {type: "carry"; yes: boolean} | {type: "draft"; item: Item} | {type: "confirm"};
export type Event = {id: string; at: string; action: Action};
export type State = {
  segment: Segment; choices: Record<Decision, boolean | null>;
  carry: boolean | null; draft: Item | null; item: Item | null;
  events: Event[]; scoring: {status: "pending_configuration"; contributions: null};
};
export function initialState(segment: Segment = "storm"): State {
  return {segment, choices: {open:null,close:null,wait:null,curtain:null,window:null,television:null},
    carry:null,draft:null,item:null,events:[],scoring:{status:"pending_configuration",contributions:null}};
}
export function stormComplete(state: State): boolean {
  return state.segment === "storm" && Object.values(state.choices).every(choice => choice !== null);
}
export function canDecide(state: State, slot: Decision) {
  if (state.segment !== "storm" || state.choices[slot] === true) return false;
  if (slot === "open") return true;
  if (slot === "close") return state.choices.open !== null;
  return state.choices.close !== null;
}
// Repeating a refusal is a valid UI acknowledgement, not another scoring event.
// Keep the first event per decision/answer; a later first "yes" still changes the scene.
export function isRepeatedDecision(state: State, action: Action): boolean {
  return action.type === "decision" && canDecide(state, action.slot)
    && state.choices[action.slot] === action.yes;
}
export function transition(state: State, event: Event): State {
  if (state.events.length >= MAX_EVENTS || state.events.some(e => e.id === event.id)) return state;
  const a = event.action;
  let next = state;
  if (a.type === "decision") {
    if (!canDecide(state,a.slot) || state.choices[a.slot] === a.yes) return state;
    next = {...state,choices:{...state.choices,[a.slot]:a.yes}};
  } else if (state.segment === "carry" && state.item === null && state.carry !== false) {
    if (a.type === "carry" && state.carry === null) next = {...state,carry:a.yes};
    if (a.type === "draft" && state.carry === true && state.draft !== a.item) next = {...state,draft:a.item};
    if (a.type === "confirm" && state.carry === true && state.draft) next = {...state,item:state.draft};
  }
  return next === state ? state : {...next,events:[...state.events,event]};
}
export function serialize(state: State): string {
  return JSON.stringify({version:2,source:"local_preview",segment:state.segment,events:state.events});
}
function validAction(a: unknown): a is Action {
  if (!a || typeof a !== "object") return false;
  const v = a as Record<string,unknown>;
  switch(v.type) {
    case "decision": return typeof v.slot === "string" && Object.hasOwn(decisions,v.slot) && typeof v.yes === "boolean";
    case "carry": return typeof v.yes === "boolean";
    case "draft": return typeof v.item === "string" && Object.hasOwn(items,v.item);
    case "confirm": return true;
    default: return false;
  }
}
export function restore(raw: string, segment: Segment): State {
  const saved = JSON.parse(raw);
  if (![1,2].includes(saved?.version) || saved.source !== "local_preview" || saved.segment !== segment || !Array.isArray(saved.events) || saved.events.length > MAX_EVENTS) throw Error("Invalid preview save");
  let state = initialState(segment);
  for (const original of saved.events) {
    // Read-only compatibility for old local previews; every restored/new event is canonical.
    const e = saved.version === 1 && original?.action?.type === "decision" && original.action.slot === "fan"
      ? {...original,action:{...original.action,slot:"television"}} : original;
    if (!e || typeof e.id !== "string" || !e.id || e.id.length > 100 || typeof e.at !== "string" || !Number.isFinite(Date.parse(e.at)) || !validAction(e.action)) throw Error("Invalid preview event");
    const next = transition(state,e);
    if (next === state) throw Error("Invalid preview sequence");
    state = next;
  }
  return state;
}
export function describe(action: Action): string {
  if (action.type === "decision") return `${decisions[action.slot]}：${action.yes ? "是" : "否"}`;
  if (action.type === "carry") return `携带一件物品：${action.yes ? "是" : "否"}`;
  if (action.type === "draft") return `预选${items[action.item]}（草稿）`;
  return "确认携带预选物品";
}
