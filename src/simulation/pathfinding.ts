export interface GridPoint { x: number; y: number }

export function findPath(start: GridPoint, goal: GridPoint, blocked: Set<string>, width: number, height: number): GridPoint[] {
  const queue: GridPoint[] = [start];
  const cameFrom = new Map<string, GridPoint | null>([[`${start.x},${start.y}`, null]]);
  const directions = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];
  while (queue.length) {
    const current = queue.shift()!;
    if (current.x === goal.x && current.y === goal.y) break;
    const next = directions
      .map((d) => ({ x: current.x + d.x, y: current.y + d.y }))
      .filter((p) => p.x >= 0 && p.y >= 0 && p.x < width && p.y < height && !blocked.has(`${p.x},${p.y}`))
      .sort((a, b) => (Math.abs(a.x - goal.x) + Math.abs(a.y - goal.y)) - (Math.abs(b.x - goal.x) + Math.abs(b.y - goal.y)));
    for (const point of next) {
      const key = `${point.x},${point.y}`;
      if (!cameFrom.has(key)) { cameFrom.set(key, current); queue.push(point); }
    }
  }
  if (!cameFrom.has(`${goal.x},${goal.y}`)) return [];
  const path: GridPoint[] = [];
  let cursor: GridPoint | null = goal;
  while (cursor) { path.unshift(cursor); cursor = cameFrom.get(`${cursor.x},${cursor.y}`) ?? null; }
  return path;
}
