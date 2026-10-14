import { snapRightAngle } from '../../domain/geometry/angles';
import { worldToScreen } from '../../domain/geometry/coordinates';
import { rotatePoint } from '../object/edit';
import type { Point, Viewport } from '../../types/layout';

export function roomRotationCenter(vertices: Point[]): Point {
  const xs = vertices.map((point) => point.x);
  const ys = vertices.map((point) => point.y);
  return {
    x: (Math.min(...xs) + Math.max(...xs)) / 2,
    y: (Math.min(...ys) + Math.max(...ys)) / 2,
  };
}

export function roomRotationHandlePoint(vertices: Point[], viewport: Viewport): Point {
  const center = worldToScreen(roomRotationCenter(vertices), viewport);
  const top = Math.min(...vertices.map((point) => worldToScreen(point, viewport).y));
  return { x: center.x, y: top - 26 };
}

export function isNearRoomRotationHandle(
  vertices: Point[],
  point: Point,
  viewport: Viewport,
  radius = 11,
): boolean {
  const handle = roomRotationHandlePoint(vertices, viewport);
  return Math.hypot(point.x - handle.x, point.y - handle.y) <= radius;
}

export function rotateRoomVertices(vertices: Point[], degrees: number): Point[] {
  const center = roomRotationCenter(vertices);
  return vertices.map((vertex) => rotatePoint(vertex, center, degrees));
}

export function rotateRoomFromScreenDrag(
  vertices: Point[],
  start: Point,
  current: Point,
  viewport: Viewport,
): Point[] {
  const center = worldToScreen(roomRotationCenter(vertices), viewport);
  const startAngle = Math.atan2(start.y - center.y, start.x - center.x);
  const currentAngle = Math.atan2(current.y - center.y, current.x - center.x);
  const degrees = snapRightAngle(Math.round(((currentAngle - startAngle) * 180) / Math.PI));
  return rotateRoomVertices(vertices, degrees);
}
