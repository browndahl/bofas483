import type { BuildingState, Vec2 } from './worldState';
import { findPath, type GridPoint } from './pathfinding';

export const NAV_CELL_SIZE = 50;
const GRID_WIDTH = 32;
const GRID_HEIGHT = 20;
const SOCIAL_MEETING_CLEARANCE = 86;
const CREATURE_ESCAPE_CLEARANCE = 50;

interface CircleObstacle { x: number; y: number; radius: number }
export interface SocialMeeting { first: Vec2; second: Vec2 }

// Major rocks and pools visible in the habitat art. The outer forest is handled by world bounds.
export const HABITAT_OBSTACLES: CircleObstacle[] = [
  { x: 170, y: 105, radius: 82 }, { x: 1135, y: 115, radius: 92 },
  { x: 452, y: 180, radius: 42 }, { x: 760, y: 180, radius: 38 },
  { x: 866, y: 350, radius: 42 }, { x: 892, y: 520, radius: 52 },
  { x: 1055, y: 706, radius: 58 }, { x: 1230, y: 760, radius: 94 },
  { x: 1140, y: 910, radius: 80 }
];

const key = (point: GridPoint) => `${point.x},${point.y}`;
const clampGrid = (value: number, maximum: number) => Math.max(0, Math.min(maximum - 1, value));
const toGrid = (point: Vec2): GridPoint => ({ x: clampGrid(Math.floor(point.x / NAV_CELL_SIZE), GRID_WIDTH), y: clampGrid(Math.floor(point.y / NAV_CELL_SIZE), GRID_HEIGHT) });
const toWorld = (point: GridPoint): Vec2 => ({ x: point.x * NAV_CELL_SIZE + NAV_CELL_SIZE / 2, y: point.y * NAV_CELL_SIZE + NAV_CELL_SIZE / 2 });

let cachedBuildingSignature = '';
const cachedObstacleCells = new Map<string, Set<string>>();

function buildingSignature(buildings: BuildingState[]): string {
  return buildings.map((building) => `${building.id}:${Math.round(building.x)}:${Math.round(building.y)}`).join('|');
}

function obstacleCells(buildings: BuildingState[], destinationBuildingId?: string): Set<string> {
  const signature = buildingSignature(buildings);
  if (signature !== cachedBuildingSignature) {
    cachedBuildingSignature = signature;
    cachedObstacleCells.clear();
  }
  const cacheKey = destinationBuildingId ?? 'none';
  const cached = cachedObstacleCells.get(cacheKey);
  if (cached) return new Set(cached);
  const blocked = new Set<string>();
  const obstacles: CircleObstacle[] = [
    ...HABITAT_OBSTACLES,
    ...buildings.filter((building) => building.id !== destinationBuildingId).map((building) => ({ x: building.x, y: building.y, radius: 72 }))
  ];
  for (let y = 0; y < GRID_HEIGHT; y++) for (let x = 0; x < GRID_WIDTH; x++) {
    const world = toWorld({ x, y });
    if (world.x < 65 || world.x > 1535 || world.y < 85 || world.y > 925 || obstacles.some((obstacle) => {
      const dx = world.x - obstacle.x; const dy = world.y - obstacle.y; const clearance = obstacle.radius + 18;
      return dx * dx + dy * dy < clearance * clearance;
    })) blocked.add(`${x},${y}`);
  }
  cachedObstacleCells.set(cacheKey, blocked);
  return new Set(blocked);
}

function closestOpenGoal(goal: GridPoint, blocked: Set<string>): GridPoint {
  if (!blocked.has(key(goal))) return goal;
  for (let radius = 1; radius < 6; radius++) {
    for (let y = goal.y - radius; y <= goal.y + radius; y++) for (let x = goal.x - radius; x <= goal.x + radius; x++) {
      if (x < 0 || y < 0 || x >= GRID_WIDTH || y >= GRID_HEIGHT) continue;
      if ((Math.abs(x - goal.x) === radius || Math.abs(y - goal.y) === radius) && !blocked.has(`${x},${y}`)) return { x, y };
    }
  }
  return goal;
}

function simplify(path: GridPoint[]): GridPoint[] {
  if (path.length < 3) return path;
  const result = [path[0]];
  let previousDirection = { x: path[1].x - path[0].x, y: path[1].y - path[0].y };
  for (let index = 1; index < path.length - 1; index++) {
    const direction = { x: path[index + 1].x - path[index].x, y: path[index + 1].y - path[index].y };
    if (direction.x !== previousDirection.x || direction.y !== previousDirection.y) result.push(path[index]);
    previousDirection = direction;
  }
  result.push(path.at(-1)!);
  return result;
}

export function buildNavigationPath(start: Vec2, target: Vec2, buildings: BuildingState[], destinationBuildingId?: string): Vec2[] {
  const blocked = obstacleCells(buildings, destinationBuildingId);
  const startCell = toGrid(start);
  const requestedGoal = toGrid(target);
  blocked.delete(key(startCell));
  if (destinationBuildingId) blocked.delete(key(requestedGoal));
  const goalCell = destinationBuildingId ? requestedGoal : closestOpenGoal(requestedGoal, blocked);
  blocked.delete(key(goalCell));
  const path = findPath(startCell, goalCell, blocked, GRID_WIDTH, GRID_HEIGHT);
  if (!path.length) return [];
  const points = simplify(path).slice(1).map(toWorld);
  const requestedGoalIsOpen = goalCell.x === requestedGoal.x && goalCell.y === requestedGoal.y;
  if (requestedGoalIsOpen || destinationBuildingId) points.push({ ...target });
  else points.push(toWorld(goalCell));
  return points;
}

export function findSocialMeeting(
  firstCreature: Vec2,
  secondCreature: Vec2,
  buildings: BuildingState[],
  unavailableTargets: Vec2[] = []
): SocialMeeting | undefined {
  const midpoint = { x: (firstCreature.x + secondCreature.x) / 2, y: (firstCreature.y + secondCreature.y) / 2 };
  const pairDx = secondCreature.x - firstCreature.x; const pairDy = secondCreature.y - firstCreature.y;
  const pairLength = Math.hypot(pairDx, pairDy);
  const perpendicular = pairLength > 0 ? { x: -pairDy / pairLength, y: pairDx / pairLength } : { x: 0, y: 1 };
  const candidates: Vec2[] = [midpoint];
  for (const radius of [70, 120, 175]) {
    for (let index = 0; index < 8; index++) {
      const angle = index / 8 * Math.PI * 2;
      candidates.push({ x: midpoint.x + Math.cos(angle) * radius, y: midpoint.y + Math.sin(angle) * radius });
    }
  }
  for (const center of candidates) {
    const first = { x: center.x + perpendicular.x * 30, y: center.y + perpendicular.y * 30 };
    const second = { x: center.x - perpendicular.x * 30, y: center.y - perpendicular.y * 30 };
    if (isNavigationBlocked(first, buildings) || isNavigationBlocked(second, buildings)) continue;
    if ([first, second].some((target) => unavailableTargets.some((reserved) => Math.hypot(target.x - reserved.x, target.y - reserved.y) < SOCIAL_MEETING_CLEARANCE))) continue;
    const firstReachable = Math.hypot(first.x - firstCreature.x, first.y - firstCreature.y) < 12 || buildNavigationPath(firstCreature, first, buildings).length > 0;
    const secondReachable = Math.hypot(second.x - secondCreature.x, second.y - secondCreature.y) < 12 || buildNavigationPath(secondCreature, second, buildings).length > 0;
    if (firstReachable && secondReachable) return { first, second };
  }
  return undefined;
}

export function buildRecoveryPath(
  start: Vec2,
  target: Vec2,
  buildings: BuildingState[],
  occupied: Vec2[],
  seed: number,
  destinationBuildingId?: string
): Vec2[] {
  const basePath = buildNavigationPath(start, target, buildings, destinationBuildingId);
  const phase = ((seed * 2.399963229728653) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
  for (const radius of [58, 86, 118]) {
    for (let index = 0; index < 12; index++) {
      const angle = phase + index / 12 * Math.PI * 2;
      const escape = { x: start.x + Math.cos(angle) * radius, y: start.y + Math.sin(angle) * radius };
      if (isNavigationBlocked(escape, buildings)) continue;
      if (occupied.some((point) => Math.hypot(escape.x - point.x, escape.y - point.y) < CREATURE_ESCAPE_CLEARANCE)) continue;
      const escapePath = buildNavigationPath(start, escape, buildings);
      if (!escapePath.length) continue;
      const destinationPath = buildNavigationPath(escape, target, buildings, destinationBuildingId);
      if (!destinationPath.length && Math.hypot(escape.x - target.x, escape.y - target.y) > 14) continue;
      return [...escapePath, ...destinationPath];
    }
  }
  return basePath;
}

export function isNavigationBlocked(point: Vec2, buildings: BuildingState[], destinationBuildingId?: string): boolean {
  if (point.x < 60 || point.x > 1540 || point.y < 80 || point.y > 930) return true;
  if (isHabitatObstacle(point)) return true;
  return buildings.some((building) => {
    if (building.id === destinationBuildingId) return false;
    const dx = point.x - building.x; const dy = point.y - building.y;
    return dx * dx + dy * dy < 66 * 66;
  });
}

export function isHabitatObstacle(point: Vec2, padding = 16): boolean {
  return HABITAT_OBSTACLES.some((obstacle) => {
    const dx = point.x - obstacle.x; const dy = point.y - obstacle.y; const clearance = obstacle.radius + padding;
    return dx * dx + dy * dy < clearance * clearance;
  });
}
