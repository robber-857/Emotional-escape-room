import type { Position, Positions } from "./save";
/** Scene-space drop target; use the wood centre, not the pointer grab offset. */
export function woodAtGap(p: Position) {
  const x = 2446.355 + p.x * 2944,
    y = 1426.75 + p.y * 1568;
  return x >= 760 && x <= 1160 && y >= 1060 && y <= 1260;
}

export function ropeAtGap(p: Position) {
  const x = 2104.5 + p.x * 2944,
    y = 1413.5 + p.y * 1568;
  return x >= 760 && x <= 1160 && y >= 1060 && y <= 1260;
}
export function repairMaterialsReady(positions: Positions): boolean {
  return (
    !!positions.planks &&
    !!positions.rope &&
    woodAtGap(positions.planks) &&
    ropeAtGap(positions.rope)
  );
}
