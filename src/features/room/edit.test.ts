import { describe, expect, it } from 'vitest';
import { polygonArea } from '../../domain/geometry/coordinates';
import { getWallSegments } from '../../domain/geometry/walls';
import { translateRoomFromScreenDrag, translateRoomVertices } from './edit';

describe('translateRoomVertices', () => {
  it('moves every vertex together without changing area or wall lengths', () => {
    const vertices = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 1 },
      { x: 1, y: 1 },
      { x: 1, y: 3 },
      { x: 0, y: 3 },
    ];
    const moved = translateRoomVertices(vertices, { x: -2.5, y: 1.25 });

    expect(moved[0]).toEqual({ x: -2.5, y: 1.25 });
    expect(moved[3]).toEqual({ x: -1.5, y: 2.25 });
    expect(polygonArea(moved)).toBe(polygonArea(vertices));
    expect(getWallSegments(moved, true).map((wall) => wall.lengthMeters)).toEqual(
      getWallSegments(vertices, true).map((wall) => wall.lengthMeters),
    );
    expect(vertices[0]).toEqual({ x: 0, y: 0 });
  });

  it('converts pointer movement using zoom scale without including viewport offset', () => {
    expect(
      translateRoomFromScreenDrag(
        [{ x: 3, y: -2 }],
        { x: 150, y: 220 },
        { x: 230, y: 180 },
        { x: -75, y: 50, scale: 160 },
      ),
    ).toEqual([{ x: 3.5, y: -2.25 }]);
  });
});
