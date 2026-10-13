import { worldToScreen } from '../../domain/geometry/coordinates';
import type { LayoutObject, Point, Viewport } from '../../types/layout';
import { objectCenter, rotatePoint } from './edit';

export function objectResizeHandlePoint(object: LayoutObject, viewport: Viewport): Point {
  const corner = rotatePoint(
    { x: object.x + object.width, y: object.y + object.height },
    objectCenter(object),
    object.rotation,
  );
  return worldToScreen(corner, viewport);
}

export function objectRotationHandlePoint(object: LayoutObject, viewport: Viewport): Point {
  const center = worldToScreen(objectCenter(object), viewport);
  const point = { x: center.x, y: center.y - (object.height * viewport.scale) / 2 - 24 };
  return rotatePoint(point, center, object.rotation);
}

export function isNearObjectRotationHandle(
  object: LayoutObject,
  point: Point,
  viewport: Viewport,
  radius = 11,
): boolean {
  const handle = objectRotationHandlePoint(object, viewport);
  return Math.hypot(point.x - handle.x, point.y - handle.y) <= radius;
}

export function isNearObjectResizeHandle(
  object: LayoutObject,
  point: Point,
  viewport: Viewport,
  radius = 11,
): boolean {
  const handle = objectResizeHandlePoint(object, viewport);
  return Math.hypot(point.x - handle.x, point.y - handle.y) <= radius;
}

/** 화면에서 보이는 모양을 우선 판정하고, 뒤에 그린 가구를 먼저 선택한다. */
export function hitTestLayoutObject(
  objects: LayoutObject[],
  point: Point,
  viewport: Viewport,
): LayoutObject | null {
  for (const object of [...objects].reverse()) {
    const unrotatedWorld = rotatePoint(
      { x: (point.x - viewport.x) / viewport.scale, y: (point.y - viewport.y) / viewport.scale },
      objectCenter(object),
      -object.rotation,
    );
    const topLeft = worldToScreen({ x: object.x, y: object.y }, viewport);
    const width = object.width * viewport.scale;
    const height = object.height * viewport.scale;
    const unrotated = worldToScreen(unrotatedWorld, viewport);
    const x = (unrotated.x - topLeft.x) / width;
    const y = (unrotated.y - topLeft.y) / height;
    if (x < 0 || x > 1 || y < 0 || y > 1) continue;
    if (object.shape === 'circle' && (2 * x - 1) ** 2 + (2 * y - 1) ** 2 > 1) continue;
    if (object.shape === 'triangle' && (x < (1 - y) / 2 || x > (1 + y) / 2)) continue;
    return object;
  }
  return null;
}
