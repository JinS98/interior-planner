import { worldToScreen } from '../../domain/geometry/coordinates';
import type { LayoutObject, Point, Viewport } from '../../types/layout';
import { objectCenter, rotatePoint } from './edit';

export interface SelectionRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export function selectionRectBetween(start: Point, end: Point): SelectionRect {
  return {
    left: Math.min(start.x, end.x),
    top: Math.min(start.y, end.y),
    right: Math.max(start.x, end.x),
    bottom: Math.max(start.y, end.y),
  };
}

function projectionsOverlap(first: Point[], second: Point[], axis: Point): boolean {
  const project = (points: Point[]) => points.map((point) => point.x * axis.x + point.y * axis.y);
  const firstValues = project(first);
  const secondValues = project(second);
  return (
    Math.max(...firstValues) >= Math.min(...secondValues) &&
    Math.max(...secondValues) >= Math.min(...firstValues)
  );
}

/** 선택 사각형과 회전된 물품의 Bounding Box가 닿는지 검사한다. */
export function objectsInSelectionRect(
  objects: LayoutObject[],
  rect: SelectionRect,
  viewport: Viewport,
): string[] {
  const marquee = [
    { x: rect.left, y: rect.top },
    { x: rect.right, y: rect.top },
    { x: rect.right, y: rect.bottom },
    { x: rect.left, y: rect.bottom },
  ];
  return objects
    .filter((object) => {
      const center = objectCenter(object);
      const corners = [
        { x: object.x, y: object.y },
        { x: object.x + object.width, y: object.y },
        { x: object.x + object.width, y: object.y + object.height },
        { x: object.x, y: object.y + object.height },
      ].map((point) => worldToScreen(rotatePoint(point, center, object.rotation), viewport));
      const edgeA = { x: corners[1].x - corners[0].x, y: corners[1].y - corners[0].y };
      const edgeB = { x: corners[3].x - corners[0].x, y: corners[3].y - corners[0].y };
      const axes = [
        { x: 1, y: 0 },
        { x: 0, y: 1 },
        { x: -edgeA.y, y: edgeA.x },
        { x: -edgeB.y, y: edgeB.x },
      ];
      return axes.every((axis) => projectionsOverlap(marquee, corners, axis));
    })
    .map((object) => object.id);
}
