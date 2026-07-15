export interface Positioned { id: string; x: number; y: number }

export class SpatialGrid<T extends Positioned> {
  private cells = new Map<string, T[]>();
  constructor(private readonly cellSize = 128) {}
  private key(x: number, y: number) { return `${Math.floor(x / this.cellSize)},${Math.floor(y / this.cellSize)}`; }
  rebuild(items: T[]) {
    this.cells.clear();
    items.forEach((item) => {
      const key = this.key(item.x, item.y);
      const cell = this.cells.get(key) ?? [];
      cell.push(item);
      this.cells.set(key, cell);
    });
  }
  nearby(x: number, y: number, radius: number): T[] {
    const result: T[] = [];
    const minX = Math.floor((x - radius) / this.cellSize);
    const maxX = Math.floor((x + radius) / this.cellSize);
    const minY = Math.floor((y - radius) / this.cellSize);
    const maxY = Math.floor((y + radius) / this.cellSize);
    for (let cx = minX; cx <= maxX; cx++) for (let cy = minY; cy <= maxY; cy++) {
      for (const item of this.cells.get(`${cx},${cy}`) ?? []) {
        if (Math.hypot(item.x - x, item.y - y) <= radius) result.push(item);
      }
    }
    return result;
  }
}
