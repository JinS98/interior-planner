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
