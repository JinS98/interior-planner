import type { Point, Viewport } from '../../types/layout';
import { screenToWorld, worldToScreen } from './coordinates';

export const GRID_SNAP_RADIUS_PX = 12;

export interface GridSnap {
  world: Point;
  screen: Point;
}

/** 포인터가 1m 격자 교차점에 가까우면 화면과 저장 좌표를 함께 보정한다. */
export function snapScreenPointToGrid(point: Point, viewport: Viewport): GridSnap | null {
  const world = screenToWorld(point, viewport);
  const snappedWorld = { x: Math.round(world.x), y: Math.round(world.y) };
  const snappedScreen = worldToScreen(snappedWorld, viewport);
  if (Math.hypot(point.x - snappedScreen.x, point.y - snappedScreen.y) > GRID_SNAP_RADIUS_PX)
    return null;
  return { world: snappedWorld, screen: snappedScreen };
}
