import type { LayoutObject, Point, Room, Viewport } from '../../types/layout';
import { objectCenter, rotatePoint } from '../object/edit';
import { hitTestLayoutObject } from '../object/hitTest';
import { hitTestRoom } from '../room/hitTest';

export type MeasurableElement =
  { kind: 'object'; object: LayoutObject } | { kind: 'room'; room: Room };

export interface ElementMeasurement {
  start: Point;
  end: Point;
  distanceMeters: number;
}

const ELLIPSE_SEGMENTS = 64;
const EPSILON = 1e-9;

export function elementOutline(element: MeasurableElement): Point[] {
  if (element.kind === 'room') return element.room.vertices;

  const object = element.object;
  const center = objectCenter(object);
  let points: Point[];
  if (object.shape === 'circle') {
    points = Array.from({ length: ELLIPSE_SEGMENTS }, (_, index) => {
      const angle = (index / ELLIPSE_SEGMENTS) * Math.PI * 2;
      return {
        x: center.x + (Math.cos(angle) * object.width) / 2,
        y: center.y + (Math.sin(angle) * object.height) / 2,
      };
    });
  } else if (object.shape === 'triangle') {
    points = [
      { x: center.x, y: object.y },
      { x: object.x + object.width, y: object.y + object.height },
      { x: object.x, y: object.y + object.height },
    ];
  } else {
    points = [
      { x: object.x, y: object.y },
      { x: object.x + object.width, y: object.y },
      { x: object.x + object.width, y: object.y + object.height },
      { x: object.x, y: object.y + object.height },
    ];
  }
  return points.map((point) => rotatePoint(point, center, object.rotation));
}

function projectToSegment(point: Point, start: Point, end: Point): Point {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  const fraction =
    lengthSquared < EPSILON
      ? 0
      : Math.max(
          0,
          Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared),
        );
  return { x: start.x + fraction * dx, y: start.y + fraction * dy };
}

function segmentIntersection(a: Point, b: Point, c: Point, d: Point): Point | null {
  const ab = { x: b.x - a.x, y: b.y - a.y };
  const cd = { x: d.x - c.x, y: d.y - c.y };
  const denominator = ab.x * cd.y - ab.y * cd.x;
  if (Math.abs(denominator) < EPSILON) return null;
  const ac = { x: c.x - a.x, y: c.y - a.y };
  const first = (ac.x * cd.y - ac.y * cd.x) / denominator;
  const second = (ac.x * ab.y - ac.y * ab.x) / denominator;
  if (first < -EPSILON || first > 1 + EPSILON || second < -EPSILON || second > 1 + EPSILON)
    return null;
  return { x: a.x + first * ab.x, y: a.y + first * ab.y };
}

function outlineCenter(points: Point[]): Point {
  return {
    x:
      (Math.min(...points.map((point) => point.x)) + Math.max(...points.map((point) => point.x))) /
      2,
    y:
      (Math.min(...points.map((point) => point.y)) + Math.max(...points.map((point) => point.y))) /
      2,
  };
}

/** Measures the shortest boundary gap, including clearance when one element contains another. */
export function measureElements(
  source: MeasurableElement,
  target: MeasurableElement,
): ElementMeasurement | null {
  const sourcePoints = elementOutline(source);
  const targetPoints = elementOutline(target);
  if (sourcePoints.length < 2 || targetPoints.length < 2) return null;
  const sourceCenter = outlineCenter(sourcePoints);
  const targetCenter = outlineCenter(targetPoints);
  const midpoint = {
    x: (sourceCenter.x + targetCenter.x) / 2,
    y: (sourceCenter.y + targetCenter.y) / 2,
  };
  const best: {
    current: { start: Point; end: Point; distanceSquared: number; centerDistance: number } | null;
  } = { current: null };

  function consider(start: Point, end: Point) {
    const distanceSquared = (start.x - end.x) ** 2 + (start.y - end.y) ** 2;
    const centerDistance =
      ((start.x + end.x) / 2 - midpoint.x) ** 2 + ((start.y + end.y) / 2 - midpoint.y) ** 2;
    if (
      !best.current ||
      distanceSquared < best.current.distanceSquared - EPSILON ||
      (Math.abs(distanceSquared - best.current.distanceSquared) <= EPSILON &&
        centerDistance < best.current.centerDistance)
    )
      best.current = { start, end, distanceSquared, centerDistance };
  }

  for (let sourceIndex = 0; sourceIndex < sourcePoints.length; sourceIndex += 1) {
    const a = sourcePoints[sourceIndex];
    const b = sourcePoints[(sourceIndex + 1) % sourcePoints.length];
    const sourceMiddle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    for (let targetIndex = 0; targetIndex < targetPoints.length; targetIndex += 1) {
      const c = targetPoints[targetIndex];
      const d = targetPoints[(targetIndex + 1) % targetPoints.length];
      const intersection = segmentIntersection(a, b, c, d);
      if (intersection) consider(intersection, intersection);
      for (const point of [a, b, sourceMiddle]) consider(point, projectToSegment(point, c, d));
      const targetMiddle = { x: (c.x + d.x) / 2, y: (c.y + d.y) / 2 };
      for (const point of [c, d, targetMiddle]) consider(projectToSegment(point, a, b), point);
    }
  }

  return best.current
    ? {
        start: best.current.start,
        end: best.current.end,
        distanceMeters: Math.sqrt(best.current.distanceSquared),
      }
    : null;
}

export function measureHoveredElement(
  source: MeasurableElement,
  objects: LayoutObject[],
  rooms: Room[],
  pointer: Point,
  viewport: Viewport,
): { target: MeasurableElement; measurement: ElementMeasurement } | null {
  const objectHit = hitTestLayoutObject(objects, pointer, viewport);
  if (objectHit && source.kind === 'object' && objectHit.id === source.object.id) return null;
  const roomHit = objectHit
    ? null
    : hitTestRoom(
        rooms.filter((room) => source.kind !== 'room' || room.id !== source.room.id),
        pointer,
        viewport,
      );
  const target: MeasurableElement | null = objectHit
    ? { kind: 'object', object: objectHit }
    : roomHit
      ? { kind: 'room', room: rooms.find((room) => room.id === roomHit.roomId)! }
      : null;
  if (!target) return null;
  const measurement = measureElements(source, target);
  return measurement ? { target, measurement } : null;
}
