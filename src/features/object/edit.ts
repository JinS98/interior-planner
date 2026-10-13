import type { LayoutObject, Point, Viewport } from '../../types/layout';
import { MAX_OBJECT_SIZE_METERS, MIN_OBJECT_SIZE_METERS } from './catalog';

export function objectCenter(object: LayoutObject): Point {
  return { x: object.x + object.width / 2, y: object.y + object.height / 2 };
}

export function rotatePoint(point: Point, center: Point, degrees: number): Point {
  const radians = (degrees * Math.PI) / 180;
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  return {
    x: center.x + dx * Math.cos(radians) - dy * Math.sin(radians),
    y: center.y + dx * Math.sin(radians) + dy * Math.cos(radians),
  };
}

export function normalizeObjectRotation(degrees: number): number {
  return ((degrees % 360) + 360) % 360;
}

/** 드래그 중 화면 픽셀 이동량을 시작 배율(px/m)로 나눠 저장 좌표(m)에 적용한다. */
export function translateObjectFromScreenDrag(
  object: LayoutObject,
  start: Point,
  current: Point,
  viewport: Viewport,
): LayoutObject {
  return {
    ...object,
    x: object.x + (current.x - start.x) / viewport.scale,
    y: object.y + (current.y - start.y) / viewport.scale,
  };
}

export function rotateObjectFromScreenDrag(
  object: LayoutObject,
  start: Point,
  current: Point,
  viewport: Viewport,
): LayoutObject {
  const center = objectCenter(object);
  const screenCenter = {
    x: center.x * viewport.scale + viewport.x,
    y: center.y * viewport.scale + viewport.y,
  };
  const startAngle = Math.atan2(start.y - screenCenter.y, start.x - screenCenter.x);
  const currentAngle = Math.atan2(current.y - screenCenter.y, current.x - screenCenter.x);
  return {
    ...object,
    rotation: normalizeObjectRotation(
      Math.round(object.rotation + ((currentAngle - startAngle) * 180) / Math.PI),
    ),
  };
}

/** 회전된 물품에서도 반대쪽 왼쪽 위 꼭짓점을 고정해 크기를 바꾼다. */
export function resizeObjectFromScreenDrag(
  object: LayoutObject,
  start: Point,
  current: Point,
  viewport: Viewport,
): LayoutObject {
  const clamp = (size: number) =>
    Math.min(MAX_OBJECT_SIZE_METERS, Math.max(MIN_OBJECT_SIZE_METERS, size));
  const radians = (object.rotation * Math.PI) / 180;
  const dx = (current.x - start.x) / viewport.scale;
  const dy = (current.y - start.y) / viewport.scale;
  const width = clamp(object.width + dx * Math.cos(radians) + dy * Math.sin(radians));
  const height = clamp(object.height - dx * Math.sin(radians) + dy * Math.cos(radians));
  if (object.rotation % 360 === 0) return { ...object, width, height };
  const fixedCorner = rotatePoint(
    { x: object.x, y: object.y },
    objectCenter(object),
    object.rotation,
  );
  const halfDiagonal = rotatePoint(
    { x: width / 2, y: height / 2 },
    { x: 0, y: 0 },
    object.rotation,
  );
  const center = { x: fixedCorner.x + halfDiagonal.x, y: fixedCorner.y + halfDiagonal.y };
  return {
    ...object,
    x: center.x - width / 2,
    y: center.y - height / 2,
    width,
    height,
  };
}
