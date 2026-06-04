// Utility functions for SpaghettiMap

export function getMidpoint(from, to, waypoints) {
  if (!waypoints || waypoints.length === 0) {
    return { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  }
  const pts = [from, ...waypoints, to];
  const mid = Math.floor((pts.length - 1) / 2);
  return {
    x: (pts[mid].x + pts[mid + 1].x) / 2,
    y: (pts[mid].y + pts[mid + 1].y) / 2,
  };
}

export const buildEdgePath = (from, to, waypoints) => {
  if (!waypoints || waypoints.length === 0) {
    const dx = to.x - from.x;
    const cx1 = from.x + dx * 0.4;
    const cx2 = to.x - dx * 0.4;
    return `M ${from.x} ${from.y} C ${cx1} ${from.y} ${cx2} ${to.y} ${to.x} ${to.y}`;
  }
  const pts = [from, ...waypoints, to];
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const t = 0.4;
    const cp1x = p1.x + (p2.x - p0.x) * t;
    const cp1y = p1.y + (p2.y - p0.y) * t;
    const cp2x = p2.x - (p3.x - p1.x) * t;
    const cp2y = p2.y - (p3.y - p1.y) * t;
    d += ` C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${p2.x} ${p2.y}`;
  }
  return d;
};

export function dist(a, b) { 
  return Math.hypot(a.x - b.x, a.y - b.y); 
}

export function totalPathDist(stepsWithPos) {
  let total = 0;
  for (let i = 0; i < stepsWithPos.length - 1; i++) {
    total += dist(stepsWithPos[i].pos, stepsWithPos[i + 1].pos);
  }
  return Math.round(total);
}

export function nearestNeighbourTSP(stepsWithPos) {
  if (stepsWithPos.length <= 2) return [...stepsWithPos];
  const remaining = [...stepsWithPos];
  const result = [remaining.splice(0, 1)[0]];
  while (remaining.length > 0) {
    const last = result[result.length - 1];
    let bestIdx = 0; let bestD = Infinity;
    remaining.forEach((s, i) => { const d = dist(last.pos, s.pos); if (d < bestD) { bestD = d; bestIdx = i; } });
    result.push(remaining.splice(bestIdx, 1)[0]);
  }
  return result;
}