import {choiceLabels,type GameEvent} from "./model";

// State events are accepted story actions. Repeated mechanical clicks aren't choices.
export function journeyReview(events: GameEvent[]): string[] {
  const seen = new Set<string>();
  const rows: string[] = [];
  for (const {action} of events) {
    const key = action.type === "paddle" ? "paddle" : `${action.choice}:${action.yes}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(action.type === "paddle" ? "划桨驶向对岸" : `${choiceLabels[action.choice]} · ${action.yes ? "是" : "否"}`);
  }
  return rows;
}
