import { objectCenter, rotatePoint } from '../object/edit';
import type { Floor, LayoutObject, Point, Room, Viewport } from '../../types/layout';

export interface FloorBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** 공간과 회전된 물품이 차지하는 World 좌표 범위. */
export function floorContentBounds(
  floor: Floor,
  roomsById: Record<string, Room>,
  objectsById: Record<string, LayoutObject>,
): FloorBounds | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const include = (point: Point) => {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  };

  for (const id of floor.roomIds) {
    for (const vertex of roomsById[id]?.vertices ?? []) include(vertex);
  }
  for (const id of floor.objectIds) {
    const object = objectsById[id];
    if (!object) continue;
    const center = objectCenter(object);
    for (const corner of [
      { x: object.x, y: object.y },
      { x: object.x + object.width, y: object.y },
      { x: object.x + object.width, y: object.y + object.height },
      { x: object.x, y: object.y + object.height },
    ]) {
      include(rotatePoint(corner, center, object.rotation));
    }
  }

  return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null;
}

/** 층 선택 직후 새 편집 영역의 실제 크기에 맞춰 도면 전체를 중앙에 놓는다. */
export function centeredFloorViewport(
  bounds: FloorBounds | null,
  size: { width: number; height: number },
  preferredScale: number,
): Viewport | null {
  if (!bounds || size.width <= 0 || size.height <= 0) return null;
  const padding = Math.min(48, size.width / 8, size.height / 8);
  const scale = Math.min(
    Math.max(preferredScale, 80),
    (size.width - padding * 2) / Math.max(bounds.maxX - bounds.minX, 0.1),
    (size.height - padding * 2) / Math.max(bounds.maxY - bounds.minY, 0.1),
    400,
  );
  return {
    scale,
    x: size.width / 2 - ((bounds.minX + bounds.maxX) / 2) * scale,
    y: size.height / 2 - ((bounds.minY + bounds.maxY) / 2) * scale,
  };
}
