import { describe, expect, it } from 'vitest';
import type { Point, Viewport } from '../../types/layout';
import { shouldCloseRoomAt } from './closure';

const vertices: Point[] = [
  { x: 1, y: 2 },
  { x: 4, y: 2 },
  { x: 4, y: 5 },
];

describe('shouldCloseRoomAt', () => {
  it('requires three vertices before closing', () => {
    expect(
      shouldCloseRoomAt({ x: 80, y: 160 }, vertices.slice(0, 2), { x: 0, y: 0, scale: 80 }),
    ).toBe(false);
  });

  it('uses a fixed screen distance after zooming and panning', () => {
    const viewport: Viewport = { x: 30, y: -40, scale: 160 };
    const start = { x: 190, y: 280 };
    expect(shouldCloseRoomAt({ x: start.x + 12, y: start.y }, vertices, viewport)).toBe(true);
    expect(shouldCloseRoomAt({ x: start.x + 13, y: start.y }, vertices, viewport)).toBe(false);
  });

  it('does not offer closure for collinear vertices', () => {
    expect(
      shouldCloseRoomAt(
        { x: 80, y: 160 },
        [
          { x: 1, y: 2 },
          { x: 2, y: 2 },
          { x: 3, y: 2 },
        ],
        { x: 0, y: 0, scale: 80 },
      ),
    ).toBe(false);
  });
});
