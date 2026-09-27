import fills from "./fills.json";
// Original transparent image fills. Crop/flip/rotation remain independent SVG transforms.
export function Sprite({ id }: { id: string }) {
  const f = (
    fills as Record<
      string,
      {
        w: number;
        h: number;
        matrix: string;
        crop?: number[];
        opacity?: number;
        filter?: string;
      }
    >
  )[id];
  if (!f) return null;
  const [sx, sy, tx, ty] = f.crop || [1, 1, 0, 0];
  return (
    <g
      transform={`matrix(${f.matrix})`}
      opacity={f.opacity}
      style={{ filter: f.filter }}
    >
      <svg
        width={f.w}
        height={f.h}
        viewBox={`0 0 ${f.w} ${f.h}`}
        overflow="hidden"
      >
        <image
          href={`/game/l1/${id}.png`}
          x={(-tx / sx) * f.w}
          y={(-ty / sy) * f.h}
          width={f.w / sx}
          height={f.h / sy}
          preserveAspectRatio="none"
        />
      </svg>
    </g>
  );
}
