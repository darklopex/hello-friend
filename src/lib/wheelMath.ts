export interface TileAngle {
  id: number;
  startDegrees: number;
  endDegrees: number;
  middleDegrees: number;
  labelX: number;
  labelY: number;
  path: string;
}

const Q = 290; // Center coordinate
const Mr = 270; // Outer radius
const Nr = 176; // Inner radius
const Pr = 223; // Middle radius for label positioning
const Fr = 193; // Inside middle
const Ir = 1.6; // Spacer angle in degrees

export function Lr(radius: number, degrees: number) {
  const radians = (degrees - 90) * Math.PI / 180;
  return {
    x: Q + radius * Math.cos(radians),
    y: Q + radius * Math.sin(radians)
  };
}

export function Rr(e: { endDegrees: number; innerRadius: number; outerRadius: number; startDegrees: number }): string {
  const { endDegrees: t, innerRadius: n, outerRadius: r, startDegrees: i } = e;
  const a = Lr(r, i);
  const o = Lr(r, t);
  const s = Lr(n, i);
  const c = Lr(n, t);
  const l = +(t - i > 180);
  return `M${a.x.toFixed(2)},${a.y.toFixed(2)} A${r},${r} 0 ${l} 1 ${o.x.toFixed(2)},${o.y.toFixed(2)} L${c.x.toFixed(2)},${c.y.toFixed(2)} A${n},${n} 0 ${l} 0 ${s.x.toFixed(2)},${s.y.toFixed(2)} Z`;
}

export function generateTileAngles(count: number): TileAngle[] {
  const step = 360 / count;
  const size = step - Ir;
  return Array.from({ length: count }, (_, idx) => {
    const startDegrees = idx * step + Ir / 2;
    const endDegrees = startDegrees + size;
    const middleDegrees = startDegrees + size / 2;
    const labelPos = Lr(Pr, middleDegrees);
    return {
      id: idx,
      startDegrees,
      endDegrees,
      middleDegrees,
      labelX: labelPos.x,
      labelY: labelPos.y,
      path: Rr({ startDegrees, endDegrees, innerRadius: Nr, outerRadius: Mr })
    };
  });
}

// Global cached array of 30 positions (matches ti in Board-DS51wa53.js)
export const TILE_ANGLES = generateTileAngles(30);
