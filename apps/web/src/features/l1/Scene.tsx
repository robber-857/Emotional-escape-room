"use client";

import { useRef, useState, type PointerEvent } from "react";
import { Sprite } from "./Sprite";
import { labels, type L1State, type Subject } from "./model";
import type { Positions } from "./save";

export const assetNames = [
  "rope",
  "river-broken",
  "river-repaired",
  "plant-back",
  "plant-right",
  "plant-mid",
  "plant-left",
  "plant-low",
  "boat",
  "post",
  "ring",
  "lilies",
  "oar",
  "bush",
  "sparkles",
  "planks",
  "shore-base",
  "shore-middle",
  "shore",
  "woman",
  "person",
  "lamp-off",
  "lamp-on",
  "sparkles-small",
];
export const asset = (name: string) => `/game/l1/${name}.png`;
const W = 2944,
  H = 1568;
type Rect = { x: number; y: number; w: number; h: number };
const slots: Record<string, Rect> = {
  "plant-back": { x: 2371.84, y: 700.36, w: 384.74, h: 510.78 },
  "plant-right": { x: 2403, y: 848.32, w: 274, h: 364 },
  "plant-mid": { x: 2202.45, y: 687.25, w: 384.74, h: 510.78 },
  "plant-left": { x: 2136.88, y: 805.97, w: 274, h: 364 },
  "plant-low": { x: 2088.12, y: 848.32, w: 274, h: 276.32 },
  rope: { x: 1999, y: 1312, w: 211, h: 203 },
  boat: { x: 1852.89, y: 889.09, w: 524.59, h: 429.02 },
  post: { x: 2376.55, y: 925.76, w: 36.54, h: 249.52 },
  ring: { x: 2333.08, y: 1045.01, w: 175, h: 157.04 },
  lilies: { x: 0, y: 1364.73, w: 428.2, h: 203.27 },
  oar: { x: 2677, y: 970.82, w: 223, h: 217.56 },
  bush: { x: 2540, y: 848.32, w: 404, h: 494.18 },
  sparkles: { x: 1109.38, y: 781.77, w: 818.39, h: 560.73 },
  "sparkles-small": { x: 1348, y: 770, w: 480, h: 480 },
  planks: { x: 2209.5, y: 1285.5, w: 473.71, h: 282.5 },
  person: { x: 1795, y: 949, w: 96, h: 309 },
  woman: { x: 390, y: 910, w: 150, h: 500 },
  "lamp-off": { x: 311, y: 1291, w: 146, h: 216 },
  "lamp-on": { x: 311, y: 1291, w: 146, h: 216 },
};

export function Scene({
  state,
  selected,
  positions,
  onSelect,
  onMove,
  disabled,
  effect,
}: {
  state: L1State;
  selected: Subject | null;
  positions: Positions;
  onSelect: (subject: Subject) => void;
  onMove: (positions: Positions) => void;
  disabled: boolean;
  effect: "oar" | "repair" | "rope" | null;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{
    id: string;
    startX: number;
    startY: number;
    baseX: number;
    baseY: number;
    moved: boolean;
    subject: Subject;
  } | null>(null);
  const suppressClick = useRef<string | null>(null);
  const [draft, setDraft] = useState<Positions>({});
  const [shake, setShake] = useState<string | null>(null);
  function select(subject: Subject) {
    if (disabled) return;
    setShake(null);
    requestAnimationFrame(() => setShake(subject));
    onSelect(subject);
  }
  function point(event: PointerEvent<SVGGElement>) {
    const matrix = svg.current?.getScreenCTM();
    if (!matrix) return { x: 0, y: 0 };
    return new DOMPoint(event.clientX, event.clientY).matrixTransform(
      matrix.inverse(),
    );
  }
  function start(
    event: PointerEvent<SVGGElement>,
    id: string,
    subject: Subject,
  ) {
    if (disabled || event.button !== 0) return;
    suppressClick.current = null;
    const p = point(event),
      offset = positions[id] || { x: 0, y: 0 };
    drag.current = {
      id,
      subject,
      startX: p.x,
      startY: p.y,
      baseX: offset.x,
      baseY: offset.y,
      moved: false,
    };
    onSelect(subject);
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function move(event: PointerEvent<SVGGElement>) {
    const d = drag.current;
    if (!d || disabled) return;
    const p = point(event),
      slot = slots[d.id];
    if (Math.hypot(p.x - d.startX, p.y - d.startY) > 16) d.moved = true;
    if (!d.moved) return;
    const x = Math.max(
      -slot.x / W,
      Math.min((W - slot.x - slot.w) / W, d.baseX + (p.x - d.startX) / W),
    );
    const y = Math.max(
      -slot.y / H,
      Math.min((H - slot.y - slot.h) / H, d.baseY + (p.y - d.startY) / H),
    );
    setDraft({ [d.id]: { x, y } });
  }
  function end(event: PointerEvent<SVGGElement>, cancel = false) {
    const d = drag.current;
    if (!d) return;
    if (d.moved && !cancel && draft[d.id])
      onMove({ ...positions, [d.id]: draft[d.id] });
    suppressClick.current = d.moved || cancel ? d.id : null;
    drag.current = null;
    setDraft({});
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function layer(id: string, subject?: Subject, movable = false) {
    const r = slots[id],
      delta = id === "rope" && state.ropeClicks < 5
        ? { x: 350 / W, y: -490 / H }
        : draft[id] || positions[id] || { x: 0, y: 0 };
    const isBoat = (id === "boat" || id === "oar") && state.rowing;
    const dx = delta.x * W + (isBoat ? -state.strokes * 60 : 0);
    const dy = delta.y * H + (isBoat ? -state.strokes * 22 : 0);
    return (
      <g
        key={id}
        data-layer={id}
        transform={`translate(${dx} ${dy})`}
        role={subject ? "button" : undefined}
        aria-disabled={subject ? disabled : undefined}
        tabIndex={subject && !disabled ? 0 : undefined}
        aria-label={
          subject
            ? `${id === "oar" ? "船桨（草丛中）" : labels[subject]}${movable ? "，可拖动；方向键微调位置" : ""}`
            : undefined
        }
        className={`${subject ? "sceneObject" : "decoration"}${id === "rope" && effect === "rope" ? " ropeDrop" : ""}`}
        onClick={
          subject
            ? () => {
                if (suppressClick.current === id) {
                  suppressClick.current = null;
                  return;
                }
                select(subject);
              }
            : undefined
        }
        onKeyDown={
          subject
            ? (e) => {
                if (disabled) return;
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  select(subject);
                }
                if (
                  movable &&
                  ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
                    e.key,
                  )
                ) {
                  e.preventDefault();
                  onMove({
                    ...positions,
                    [id]: {
                      x: Math.max(
                        -r.x / W,
                        Math.min(
                          (W - r.x - r.w) / W,
                          delta.x +
                            (e.key === "ArrowLeft"
                              ? -0.01
                              : e.key === "ArrowRight"
                                ? 0.01
                                : 0),
                        ),
                      ),
                      y: Math.max(
                        -r.y / H,
                        Math.min(
                          (H - r.y - r.h) / H,
                          delta.y +
                            (e.key === "ArrowUp"
                              ? -0.01
                              : e.key === "ArrowDown"
                                ? 0.01
                                : 0),
                        ),
                      ),
                    },
                  });
                }
              }
            : undefined
        }
        onPointerDown={
          movable && subject ? (e) => start(e, id, subject) : undefined
        }
        onPointerMove={movable ? move : undefined}
        onPointerUp={movable ? (e) => end(e) : undefined}
        onPointerCancel={movable ? (e) => end(e, true) : undefined}
      >
        <g
          className={shake === subject && subject ? "shake" : undefined}
          onAnimationEnd={() => setShake(null)}
        >
          <g transform={id === "rope" ? "translate(2104.5 1413.5) scale(0.75) translate(-2104.5 -1413.5)" : undefined}>
          <Sprite id={id} />
          {subject && (
            <rect
              className={`objectOutline ${selected === subject ? "selected" : ""}`}
              x={r.x}
              y={r.y}
              width={r.w}
              height={r.h}
              rx="20"
            />
          )}
          </g>
        </g>
      </g>
    );
  }
  function hotspot(
    subject: Subject,
    x: number,
    y: number,
    w: number,
    h: number,
  ) {
    return (
      <g
        className="sceneObject hotspot"
        role="button"
        aria-disabled={disabled}
        aria-label={labels[subject]}
        tabIndex={disabled ? -1 : 0}
        onClick={() => select(subject)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            select(subject);
          }
        }}
      >
        <rect
          className={`objectOutline ${selected === subject ? "selected" : ""}`}
          x={x}
          y={y}
          width={w}
          height={h}
          rx="24"
        />
      </g>
    );
  }
  const river = state.scene === "river";
  return (
    <svg
      ref={svg}
      className="scene"
      viewBox={`0 0 ${W} ${H}`}
      aria-label={river ? "分离之河：河岸" : "分离之河：对岸"}
    >
      <g data-layer="background">
        {!river && (
          <>
            <image
              href={asset("shore-base")}
              width={W}
              height={H}
              preserveAspectRatio="none"
            />
            <image
              href={asset("shore-middle")}
              width={W}
              height={H}
              preserveAspectRatio="none"
            />
          </>
        )}
        <image
          href={asset(
            river
              ? state.repaired && effect !== "repair"
                ? "river-repaired"
                : "river-broken"
              : "shore",
          )}
          width={W}
          height={H}
          preserveAspectRatio="none"
        />
      </g>
      {river ? (
        <>
          {state.repaired && effect === "repair" && (
            <image
              className="bridgeReveal"
              href={asset("river-repaired")}
              width={W}
              height={H}
            />
          )}
          {!state.repaired &&
            (selected === "planks" || selected === "rope" || state.wood) && (
              <rect
                className="gapTarget"
                x="760"
                y="1060"
                width="400"
                height="200"
                rx="20"
                pointerEvents="none"
              />
            )}
          <g data-layer="water-effects" className="decoration">
            <g className="glimmerSlow">{layer("sparkles")}</g>
            <g className="glimmerFast">{layer("sparkles-small")}</g>
          </g>
          <g data-layer="scenery">
            <image
              className="decoration"
              href="/game/l1/lilies-shadow.svg"
              x="-16.94"
              y="1475.16"
              width="326.377"
              height="122.505"
              opacity=".7"
            />
            {[
              "plant-back",
              "plant-right",
              "plant-mid",
              "plant-left",
              "plant-low",
              "post",
              "lilies",
            ].map((id) => layer(id))}
          </g>
          <g data-layer="hit-regions">
            {hotspot("water", 1170, 900, 620, 430)}
            {hotspot("bridge", 740, 1010, 490, 260)}
          </g>
          <g data-layer="props">
            {layer("boat", "boat")}
            {!state.repaired && layer("rope", "rope", state.ropeClicks === 5)}
            {layer("ring", "ring", true)}
            {state.oar && (
              <g
                className={effect === "oar" ? "oarFlight" : undefined}
                transform="translate(-660 70)"
              >
                {layer("oar")}
              </g>
            )}
            {layer("bush", "bush")}
            {!state.repaired && layer("planks", "planks", true)}
          </g>
        </>
      ) : (
        <>
          <g data-layer="characters">
            {layer("person", "person")}
            {layer("woman", "woman")}
          </g>
          <g data-layer="props">
            {!state.lampTaken &&
              layer(state.lampLit ? "lamp-on" : "lamp-off", "lamp")}
          </g>
          <g data-layer="hit-regions">{hotspot("door", 1087, 610, 355, 565)}</g>
        </>
      )}
    </svg>
  );
}
