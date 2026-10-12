import type { Point } from '../../types/layout';

export interface WallSegment {
  start: Point;
  end: Point;
  lengthMeters: number;
}

export function getWallSegments(vertices: Point[], closed: boolean): WallSegment[] {
  const segments: WallSegment[] = [];
  const count = closed && vertices.length >= 3 ? vertices.length : vertices.length - 1;

  for (let index = 0; index < count; index += 1) {
    const start = vertices[index];
    const end = vertices[(index + 1) % vertices.length];
    segments.push({ start, end, lengthMeters: Math.hypot(end.x - start.x, end.y - start.y) });
  }

  return segments;
}
