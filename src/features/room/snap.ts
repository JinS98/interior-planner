import { screenToWorld, worldToScreen } from '../../domain/geometry/coordinates';
import { snapScreenPointToGrid } from '../../domain/geometry/gridSnap';
import type { Point, Viewport } from '../../types/layout';

export const AXIS_SNAP_RADIUS_PX = 12;

export interface RoomSnap {
  kind: 'grid' | 'horizontal' | 'vertical';
  world: Point;
  screen: Point;
}

function snapToLastAxis(point: Point, last: Point, viewport: Viewport): RoomSnap | null {
  const lastScreen = worldToScreen(last, viewport);
  const dx = Math.abs(point.x - lastScreen.x);
  const dy = Math.abs(point.y - lastScreen.y);
  if (dy <= AXIS_SNAP_RADIUS_PX && dx > AXIS_SNAP_RADIUS_PX) {
    return {
      kind: 'horizontal',
      world: { x: screenToWorld(point, viewport).x, y: last.y },
      screen: { x: point.x, y: lastScreen.y },
    };
  }
  if (dx <= AXIS_SNAP_RADIUS_PX && dy > AXIS_SNAP_RADIUS_PX) {
    return {
      kind: 'vertical',
      world: { x: last.x, y: screenToWorld(point, viewport).y },
      screen: { x: lastScreen.x, y: point.y },
    };
  }
  return null;
}

/** 격자와 축이 모두 가까우면 함께 맞추거나 더 가까운 보정점을 선택한다. */
export function snapRoomPoint(
  point: Point,
  last: Point | undefined,
  viewport: Viewport,
): RoomSnap | null {
  const grid = snapScreenPointToGrid(point, viewport);
  const gridSnap: RoomSnap | null = grid ? { kind: 'grid', ...grid } : null;
  const axisSnap = last ? snapToLastAxis(point, last, viewport) : null;
  if (!gridSnap) return axisSnap;
  if (!axisSnap || !last) return gridSnap;

  const gridKeepsAxis =
    (axisSnap.kind === 'horizontal' && gridSnap.world.y === last.y) ||
    (axisSnap.kind === 'vertical' && gridSnap.world.x === last.x);
  if (gridKeepsAxis) return gridSnap;

  const gridDistance = Math.hypot(point.x - gridSnap.screen.x, point.y - gridSnap.screen.y);
  const axisDistance = Math.hypot(point.x - axisSnap.screen.x, point.y - axisSnap.screen.y);
  return gridDistance <= axisDistance ? gridSnap : axisSnap;
}
