import {
  initialState,
  transition,
  type GameEvent,
  type L1State,
  choiceLabels,
} from "./model";

export const SAVE_KEY = "emotional:l1:preview:v2";
export type Position = { x: number; y: number };
export type Positions = Record<string, Position>;
export type SavedGame = {
  version: 2;
  events: GameEvent[];
  positions: Positions;
  savedAt: string;
};
const movable = new Set(["planks", "rope", "ring", "oar"]);

/** Replay validated actions rather than trusting a stored 'completed' flag. */
export function restore(raw: string): { state: L1State; positions: Positions } {
  const value = JSON.parse(raw);
  if (
    !value ||
    value.version !== 2 ||
    !Array.isArray(value.events) ||
    value.events.length > 1000
  )
    throw new Error("不兼容的本机存档");
  let state = initialState();
  for (const e of value.events) {
    if (
      !e ||
      typeof e.id !== "string" ||
      !e.id ||
      typeof e.at !== "string" ||
      !Number.isFinite(Date.parse(e.at)) ||
      !e.action
    )
      throw new Error("存档动作无效");
    const a = e.action;
    if (
      a.type !== "paddle" &&
      !(
        a.type === "choose" &&
        Object.hasOwn(choiceLabels, a.choice) &&
        typeof a.yes === "boolean"
      )
    )
      throw new Error("未知的存档动作");
    const next = transition(state, e);
    if (next === state) throw new Error("存档动作顺序无效");
    state = next;
  }
  const positions: Positions = {};
  if (
    !value.positions ||
    typeof value.positions !== "object" ||
    Array.isArray(value.positions)
  )
    throw new Error("存档位置无效");
  for (const [key, p] of Object.entries(value.positions)) {
    const point = p as Position;
    if (
      !movable.has(key) ||
      !point ||
      !Number.isFinite(point.x) ||
      !Number.isFinite(point.y) ||
      Math.abs(point.x) > 1 ||
      Math.abs(point.y) > 1
    )
      throw new Error("存档位置无效");
    positions[key] = { x: point.x, y: point.y };
  }
  return { state, positions };
}
