import { describe, expect, it } from 'vitest';
import { polygonArea } from './coordinates';
import { resizeWall, validatePolygon } from './polygonValidation';

const rectangle = [
  { x: 0, y: 0 },
  { x: 4, y: 0 },
  { x: 4, y: 3 },
  { x: 0, y: 3 },
];

describe('validatePolygon', () => {
  it('accepts a rectangle and a concave room', () => {
    expect(validatePolygon(rectangle)).toBeNull();
    expect(
      validatePolygon([
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 4, y: 1 },
        { x: 1, y: 1 },
        { x: 1, y: 3 },
        { x: 0, y: 3 },
      ]),
    ).toBeNull();
  });

  it('rejects collapsed and self-crossing rooms', () => {
    expect(validatePolygon([rectangle[0], rectangle[1], rectangle[1], rectangle[3]])).toBe(
      'short-wall',
    );
    expect(
      validatePolygon([
        { x: 0, y: 0 },
        { x: 3, y: 3 },
        { x: 0, y: 3 },
        { x: 3, y: 0 },
      ]),
    ).toBe('self-intersection');
    expect(
      validatePolygon([
        { x: 0, y: 0 },
        { x: 2, y: 0.00001 },
        { x: 0, y: 0.00001 },
        { x: 2, y: 0 },
      ]),
    ).toBe('self-intersection');
    expect(
      validatePolygon([
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 2, y: 0 },
      ]),
    ).toBe('self-intersection');
    expect(
      validatePolygon([
        { x: 0, y: 0 },
        { x: 2, y: 0 },
        { x: 1, y: 0.0000001 },
      ]),
    ).toBe('zero-area');
  });
});

describe('resizeWall', () => {
  it('moves only the end vertex and changes the measured area', () => {
    const resized = resizeWall(rectangle, 0, 6)!;
    expect(resized[0]).toEqual(rectangle[0]);
    expect(resized[1]).toEqual({ x: 6, y: 0 });
    expect(resized[2]).toEqual(rectangle[2]);
    expect(polygonArea(resized)).toBe(15);
    expect(validatePolygon(resized)).toBeNull();
  });

  it('supports the closing wall and rejects invalid lengths', () => {
    const resized = resizeWall(rectangle, 3, 5)!;
    expect(resized[0]).toEqual({ x: 0, y: -2 });
    expect(resized[3]).toEqual(rectangle[3]);
    expect(resizeWall(rectangle, 0, 0)).toBeNull();
  });
});
