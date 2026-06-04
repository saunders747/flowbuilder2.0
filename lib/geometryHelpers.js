// Geometry helpers for spaghetti map path routing

export function segmentIntersectsRect(ax, ay, bx, by, r) {
  const inside = (px, py) => px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
  if (inside(ax, ay) || inside(bx, by)) return true;
  const cross = (p, q, s, t) => (q.x - p.x) * (t.y - s.y) - (q.y - p.y) * (t.x - s.x);
  const edges = [
    [r.x, r.y, r.x + r.w, r.y],
    [r.x + r.w, r.y, r.x + r.w, r.y + r.h],
    [r.x + r.w, r.y + r.h, r.x, r.y + r.h],
    [r.x, r.y + r.h, r.x, r.y],
  ];
  const A = { x: ax, y: ay }, B = { x: bx, y: by };
  return edges.some(([cx, cy, dx, dy]) => {
    const C = { x: cx, y: cy }, D = { x: dx, y: dy };
    const d1 = cross(C, D, A, B), d2 = cross(C, D, B, A);
    const d3 = cross(A, B, C, D), d4 = cross(A, B, D, C);
    if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
    return false;
  });
}

export function computeAvoidanceWaypoints(from, to, blockedRects, margin = 30) {
  if (!blockedRects || !blockedRects.length) return [];
  const blocking = blockedRects.find(r =>
    segmentIntersectsRect(from.x, from.y, to.x, to.y, r)
  );
  if (!blocking) return [];
  const { x, y, w, h } = blocking;
  const mx = (from.x + to.x) / 2, my = (from.y + to.y) / 2;
  const dTop = Math.abs(my - y), dBottom = Math.abs(my - (y + h));
  const dLeft = Math.abs(mx - x), dRight = Math.abs(mx - (x + w));
  const minD = Math.min(dTop, dBottom, dLeft, dRight);
  const clampX = v => Math.max(x - margin, Math.min(x + w + margin, v));
  const clampY = v => Math.max(y - margin, Math.min(y + h + margin, v));
  if (minD === dTop) return [{ x: clampX(mx), y: y - margin }];
  else if (minD === dBottom) return [{ x: clampX(mx), y: y + h + margin }];
  else if (minD === dLeft) return [{ x: x - margin, y: clampY(my) }];
  else return [{ x: x + w + margin, y: clampY(my) }];
}