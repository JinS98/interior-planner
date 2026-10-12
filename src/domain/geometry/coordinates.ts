import type { Point, Viewport } from '../../types/layout';

export const METERS_TO_PYEONG = 1 / 3.305785;

export function worldToScreen(point: Point, viewport: Viewport): Point {
  return { x: point.x * viewport.scale + viewport.x, y: point.y * viewport.scale + viewport.y };
}

export function screenToWorld(point: Point, viewport: Viewport): Point {
  return { x: (point.x - viewport.x) / viewport.scale, y: (point.y - viewport.y) / viewport.scale };
}

/** Shoelace formula; vertices may be clockwise or counterclockwise. */
export function polygonArea(vertices: Point[]): number {
  if (vertices.length < 3) return 0;
  let doubledArea = 0;
  for (let i = 0; i < vertices.length; i++) {
    const next = vertices[(i + 1) % vertices.length];
    doubledArea += vertices[i].x * next.y - next.x * vertices[i].y;
  }
  return Math.abs(doubledArea) / 2;
}

/** Returns a point inside a simple polygon for its canvas area label. */
export function polygonInteriorPoint(vertices: Point[]): Point {
  if (vertices.length === 0) return { x: 0, y: 0 };
  const yValues = vertices.map((vertex) => vertex.y);
  const scanY = (Math.min(...yValues) + Math.max(...yValues)) / 2;
  const crossings: number[] = [];

  for (let index = 0; index < vertices.length; index += 1) {
    const start = vertices[index];
    const end = vertices[(index + 1) % vertices.length];
    if ((start.y <= scanY && end.y > scanY) || (end.y <= scanY && start.y > scanY)) {
      crossings.push(start.x + ((scanY - start.y) * (end.x - start.x)) / (end.y - start.y));
    }
  }

  crossings.sort((a, b) => a - b);
  let widest = -1;
  let labelX = vertices[0].x;
  for (let index = 0; index + 1 < crossings.length; index += 2) {
    const width = crossings[index + 1] - crossings[index];
    if (width > widest) {
      widest = width;
      labelX = (crossings[index] + crossings[index + 1]) / 2;
    }
  }
  return { x: labelX, y: scanY };
}
