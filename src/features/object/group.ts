import { snapRightAngle } from '../../domain/geometry/angles';
import type { LayoutObject, Point, Viewport } from '../../types/layout';
import { normalizeObjectRotation, objectCenter, rotatePoint } from './edit';

export function groupMemberIds(objects: LayoutObject[], groupId: string): string[] {
  return objects.filter((object) => object.groupId === groupId).map((object) => object.id);
}

export function groupBounds(objects: LayoutObject[]) {
  const corners = objects.flatMap((object) => {
    const center = objectCenter(object);
    return [
      { x: object.x, y: object.y },
      { x: object.x + object.width, y: object.y },
      { x: object.x + object.width, y: object.y + object.height },
      { x: object.x, y: object.y + object.height },
    ].map((point) => rotatePoint(point, center, object.rotation));
  });
  if (corners.length === 0) return null;
  return {
    left: Math.min(...corners.map((point) => point.x)),
    right: Math.max(...corners.map((point) => point.x)),
    top: Math.min(...corners.map((point) => point.y)),
    bottom: Math.max(...corners.map((point) => point.y)),
  };
}

export function groupCenter(objects: LayoutObject[]): Point | null {
  const bounds = groupBounds(objects);
  return bounds ? { x: (bounds.left + bounds.right) / 2, y: (bounds.top + bounds.bottom) / 2 } : null;
}

/** 각 물품의 중심을 그룹 중심 주위로 회전하고 물품 자체의 각도도 함께 바꾼다. */
export function rotateGroupObjects(objects: LayoutObject[], degrees: number): LayoutObject[] {
  const center = groupCenter(objects);
  if (!center || !Number.isFinite(degrees)) return objects;
  return objects.map((object) => {
    const nextCenter = rotatePoint(objectCenter(object), center, degrees);
    return {
      ...object,
      x: nextCenter.x - object.width / 2,
      y: nextCenter.y - object.height / 2,
      rotation: normalizeObjectRotation(object.rotation + degrees),
    };
  });
}

export function groupRotationFromScreenDrag(
  objects: LayoutObject[],
  start: Point,
  current: Point,
  viewport: Viewport,
): number {
  const center = groupCenter(objects);
  if (!center) return 0;
  const screen = { x: center.x * viewport.scale + viewport.x, y: center.y * viewport.scale + viewport.y };
  const first = Math.atan2(start.y - screen.y, start.x - screen.x);
  const last = Math.atan2(current.y - screen.y, current.x - screen.x);
  return snapRightAngle(Math.round(((last - first) * 180) / Math.PI));
}
