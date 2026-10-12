import { describe, expect, it } from 'vitest';
import { polygonArea, screenToWorld, worldToScreen } from './coordinates';

describe('world/screen coordinates', () => {
  it('preserves a point across both transforms', () => {
    const viewport = { x: -140, y: 230, scale: 96 };
    const point = { x: 4.25, y: -3 };
    expect(screenToWorld(worldToScreen(point, viewport), viewport)).toEqual(point);
  });
});

describe('polygonArea', () => {
  it('returns area in square meters for either winding order', () => {
    const room = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 3 },
      { x: 0, y: 3 },
    ];
    expect(polygonArea(room)).toBe(12);
    expect(polygonArea([...room].reverse())).toBe(12);
  });
});
