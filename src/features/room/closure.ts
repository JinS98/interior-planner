import { polygonArea, worldToScreen } from '../../domain/geometry/coordinates';
import type { Point, Viewport } from '../../types/layout';

export const ROOM_CLOSE_RADIUS_PX = 12;

/** 확대율과 무관하게 화면에서 일정한 거리 안의 시작점 클릭을 감지한다. */
export function isNearRoomStart(point: Point, vertices: Point[], viewport: Viewport): boolean {
  if (vertices.length === 0) return false;
  const start = worldToScreen(vertices[0], viewport);
  return Math.hypot(point.x - start.x, point.y - start.y) <= ROOM_CLOSE_RADIUS_PX;
}

export function shouldCloseRoomAt(point: Point, vertices: Point[], viewport: Viewport): boolean {
  return (
    vertices.length >= 3 &&
    polygonArea(vertices) >= 0.000001 &&
    isNearRoomStart(point, vertices, viewport)
  );
}
