import { describe, expect, it } from 'vitest';
import { getWallSegments } from './walls';

const vertices = [
  { x: 0, y: 0 },
  { x: 3, y: 0 },
  { x: 3, y: 4 },
];

describe('getWallSegments', () => {
  it('measures drawn walls in meters without an unfinished closing wall', () => {
    expect(getWallSegments(vertices, false).map((wall) => wall.lengthMeters)).toEqual([3, 4]);
  });

  it('includes the closing wall for a completed room', () => {
    expect(getWallSegments(vertices, true).map((wall) => wall.lengthMeters)).toEqual([3, 4, 5]);
  });

  it('does not create a wall from a single point', () => {
    expect(getWallSegments([vertices[0]], false)).toEqual([]);
  });
});
