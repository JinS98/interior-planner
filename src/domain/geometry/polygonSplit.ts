import type { Point } from '../../types/layout';
import { polygonArea } from './coordinates';
import { validatePolygon } from './polygonValidation';

const EPSILON = 1e-7;

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function boundaryPoint(vertices: Point[], point: Point): Point | null {
  for (const vertex of vertices) {
    if (distance(vertex, point) <= EPSILON) return vertex;
  }
  for (let index = 0; index < vertices.length; index += 1) {
    const start = vertices[index];
    const end = vertices[(index + 1) % vertices.length];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared === 0) continue;
    const fraction = ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared;
    if (fraction <= 0 || fraction >= 1) continue;
    const projected = { x: start.x + fraction * dx, y: start.y + fraction * dy };
    if (distance(projected, point) <= EPSILON) return projected;
  }
  return null;
}

function pointInsidePolygon(vertices: Point[], point: Point): boolean {
  let inside = false;
  for (let index = 0, previous = vertices.length - 1; index < vertices.length; previous = index++) {
    const start = vertices[previous];
    const end = vertices[index];
    if (
      start.y > point.y !== end.y > point.y &&
      point.x < ((end.x - start.x) * (point.y - start.y)) / (end.y - start.y) + start.x
    ) {
      inside = !inside;
    }
  }
  return inside;
}

function segmentInsidePolygon(vertices: Point[], start: Point, end: Point): boolean {
  if (distance(start, end) < 0.01) return false;
  const midpoint = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  return !boundaryPoint(vertices, midpoint) && pointInsidePolygon(vertices, midpoint);
}

/** Accepts an interior bend only when the new wall segment remains inside the room. */
export function canAddDivisionBend(vertices: Point[], path: Point[], bend: Point): boolean {
  if (path.length === 0 || boundaryPoint(vertices, bend) || !pointInsidePolygon(vertices, bend))
    return false;
  return segmentInsidePolygon(vertices, path[path.length - 1], bend);
}

function boundaryWithCutPoints(vertices: Point[], start: Point, end: Point): Point[] {
  const result: Point[] = [];
  for (let index = 0; index < vertices.length; index += 1) {
    const current = vertices[index];
    const next = vertices[(index + 1) % vertices.length];
    result.push(current);
    const dx = next.x - current.x;
    const dy = next.y - current.y;
    const lengthSquared = dx * dx + dy * dy;
    const inserted = [start, end]
      .map((point) => ({
        point,
        fraction: ((point.x - current.x) * dx + (point.y - current.y) * dy) / lengthSquared,
      }))
      .filter(
        ({ point, fraction }) =>
          fraction > EPSILON &&
          fraction < 1 - EPSILON &&
          distance(point, {
            x: current.x + fraction * dx,
            y: current.y + fraction * dy,
          }) <= EPSILON,
      )
      .sort((a, b) => a.fraction - b.fraction);
    result.push(...inserted.map(({ point }) => point));
  }
  return result;
}

function walkBoundary(vertices: Point[], from: number, to: number): Point[] {
  const result = [vertices[from]];
  for (
    let index = (from + 1) % vertices.length;
    index !== to;
    index = (index + 1) % vertices.length
  ) {
    result.push(vertices[index]);
  }
  result.push(vertices[to]);
  return result;
}

/** A wall path from boundary to boundary replaces one room with two non-overlapping rooms. */
export function splitPolygon(vertices: Point[], path: Point[]): [Point[], Point[]] | null {
  if (validatePolygon(vertices) || path.length < 2) return null;
  const start = boundaryPoint(vertices, path[0]);
  const end = boundaryPoint(vertices, path[path.length - 1]);
  if (!start || !end || distance(start, end) < 0.01) return null;
  const bends = path.slice(1, -1);
  const wallPath = [start, ...bends, end];
  if (bends.some((bend) => boundaryPoint(vertices, bend) || !pointInsidePolygon(vertices, bend)))
    return null;
  for (let index = 0; index < wallPath.length - 1; index += 1) {
    if (!segmentInsidePolygon(vertices, wallPath[index], wallPath[index + 1])) return null;
  }

  const boundary = boundaryWithCutPoints(vertices, start, end);
  const startIndex = boundary.findIndex((point) => distance(point, start) <= EPSILON);
  const endIndex = boundary.findIndex((point) => distance(point, end) <= EPSILON);
  if (startIndex < 0 || endIndex < 0 || startIndex === endIndex) return null;

  const first = [...walkBoundary(boundary, startIndex, endIndex), ...[...bends].reverse()];
  const second = [...walkBoundary(boundary, endIndex, startIndex), ...bends];
  if (validatePolygon(first) || validatePolygon(second)) return null;

  const originalArea = polygonArea(vertices);
  const splitArea = polygonArea(first) + polygonArea(second);
  if (Math.abs(splitArea - originalArea) > 1e-6 * Math.max(1, originalArea)) return null;
  return [first, second];
}
