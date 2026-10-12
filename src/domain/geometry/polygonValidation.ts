import type { Point } from '../../types/layout';
import { polygonArea } from './coordinates';

export type PolygonValidationError =
  'too-few-vertices' | 'non-finite-coordinate' | 'short-wall' | 'self-intersection' | 'zero-area';

export const MIN_WALL_LENGTH_METERS = 0.01;
const EPSILON = 1e-9;

function cross(a: Point, b: Point, c: Point): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function onSegment(a: Point, b: Point, point: Point): boolean {
  return (
    Math.abs(cross(a, b, point)) <= EPSILON &&
    point.x >= Math.min(a.x, b.x) - EPSILON &&
    point.x <= Math.max(a.x, b.x) + EPSILON &&
    point.y >= Math.min(a.y, b.y) - EPSILON &&
    point.y <= Math.max(a.y, b.y) + EPSILON
  );
}

function segmentsIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
  const abC = cross(a, b, c);
  const abD = cross(a, b, d);
  const cdA = cross(c, d, a);
  const cdB = cross(c, d, b);
  const crossesAB = (abC > EPSILON && abD < -EPSILON) || (abC < -EPSILON && abD > EPSILON);
  const crossesCD = (cdA > EPSILON && cdB < -EPSILON) || (cdA < -EPSILON && cdB > EPSILON);
  if (crossesAB && crossesCD) return true;
  return onSegment(a, b, c) || onSegment(a, b, d) || onSegment(c, d, a) || onSegment(c, d, b);
}

export function validatePolygon(vertices: Point[]): PolygonValidationError | null {
  if (vertices.length < 3) return 'too-few-vertices';
  if (vertices.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) {
    return 'non-finite-coordinate';
  }

  for (let index = 0; index < vertices.length; index += 1) {
    const previous = vertices[(index - 1 + vertices.length) % vertices.length];
    const current = vertices[index];
    const next = vertices[(index + 1) % vertices.length];
    if (Math.hypot(next.x - current.x, next.y - current.y) < MIN_WALL_LENGTH_METERS) {
      return 'short-wall';
    }
    if (
      Math.abs(cross(previous, current, next)) <= EPSILON &&
      (current.x - previous.x) * (next.x - current.x) +
        (current.y - previous.y) * (next.y - current.y) <
        0
    ) {
      return 'self-intersection';
    }
  }

  for (let first = 0; first < vertices.length; first += 1) {
    for (let second = first + 2; second < vertices.length; second += 1) {
      if (first === 0 && second === vertices.length - 1) continue;
      if (
        segmentsIntersect(
          vertices[first],
          vertices[(first + 1) % vertices.length],
          vertices[second],
          vertices[(second + 1) % vertices.length],
        )
      ) {
        return 'self-intersection';
      }
    }
  }

  if (polygonArea(vertices) < 0.000001) return 'zero-area';
  return null;
}

/** Keeps a wall's start vertex fixed and moves its end vertex along the original direction. */
export function resizeWall(
  vertices: Point[],
  wallIndex: number,
  lengthMeters: number,
): Point[] | null {
  if (
    vertices.length < 3 ||
    !Number.isInteger(wallIndex) ||
    wallIndex < 0 ||
    wallIndex >= vertices.length ||
    !Number.isFinite(lengthMeters) ||
    lengthMeters < MIN_WALL_LENGTH_METERS
  ) {
    return null;
  }
  const start = vertices[wallIndex];
  const endIndex = (wallIndex + 1) % vertices.length;
  const end = vertices[endIndex];
  const currentLength = Math.hypot(end.x - start.x, end.y - start.y);
  if (currentLength < MIN_WALL_LENGTH_METERS) return null;
  return vertices.map((vertex, index) =>
    index === endIndex
      ? {
          x: start.x + ((end.x - start.x) * lengthMeters) / currentLength,
          y: start.y + ((end.y - start.y) * lengthMeters) / currentLength,
        }
      : { ...vertex },
  );
}
