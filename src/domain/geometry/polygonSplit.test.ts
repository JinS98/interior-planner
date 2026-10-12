import { describe, expect, it } from 'vitest';
import { polygonArea } from './coordinates';
import { canAddDivisionBend, splitPolygon } from './polygonSplit';

const lShapedRoom = [
  { x: 0, y: 0 },
  { x: 4, y: 0 },
  { x: 4, y: 2 },
  { x: 2, y: 2 },
  { x: 2, y: 5 },
  { x: 0, y: 5 },
];

describe('splitPolygon', () => {
  it('divides the pictured 14㎡ L shape into 4㎡, 4㎡, and 6㎡ rooms without overlap', () => {
    const firstCut = splitPolygon(lShapedRoom, [
      { x: 2, y: 0 },
      { x: 2, y: 2 },
    ]);
    expect(firstCut).not.toBeNull();
    const areasAfterFirstCut = firstCut!.map(polygonArea).sort((a, b) => a - b);
    expect(areasAfterFirstCut).toEqual([4, 10]);

    const remainingRoom = firstCut!.find((part) => polygonArea(part) === 10)!;
    const secondCut = splitPolygon(remainingRoom, [
      { x: 0, y: 2 },
      { x: 2, y: 2 },
    ]);
    expect(secondCut).not.toBeNull();
    expect([4, ...secondCut!.map(polygonArea)].sort((a, b) => a - b)).toEqual([4, 4, 6]);
    expect(4 + secondCut!.reduce((sum, part) => sum + polygonArea(part), 0)).toBe(14);
  });

  it('rejects a line along the boundary and a line crossing an exterior notch', () => {
    expect(
      splitPolygon(lShapedRoom, [
        { x: 0, y: 1 },
        { x: 0, y: 4 },
      ]),
    ).toBeNull();
    const notchedRoom = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 2 },
      { x: 3, y: 2 },
      { x: 3, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 4 },
      { x: 0, y: 4 },
    ];
    expect(
      splitPolygon(notchedRoom, [
        { x: 1, y: 1 },
        { x: 3, y: 1 },
      ]),
    ).toBeNull();
  });

  it('uses an interior bend to form a 1㎡ corner room instead of a 0.5㎡ triangle', () => {
    const rectangle = [
      { x: 0, y: 0 },
      { x: 3, y: 0 },
      { x: 3, y: 2 },
      { x: 0, y: 2 },
    ];
    const path = [
      { x: 2, y: 0 },
      { x: 2, y: 1 },
      { x: 3, y: 1 },
    ];
    expect(canAddDivisionBend(rectangle, path.slice(0, 1), path[1])).toBe(true);
    expect(
      splitPolygon(rectangle, path)
        ?.map(polygonArea)
        .sort((a, b) => a - b),
    ).toEqual([1, 5]);
    expect(
      splitPolygon(rectangle, [
        { x: 2, y: 0 },
        { x: 3, y: 1 },
      ])
        ?.map(polygonArea)
        .sort((a, b) => a - b),
    ).toEqual([0.5, 5.5]);
  });

  it('rejects a bend on the outer wall or outside the room', () => {
    const rectangle = [
      { x: 0, y: 0 },
      { x: 3, y: 0 },
      { x: 3, y: 2 },
      { x: 0, y: 2 },
    ];
    expect(canAddDivisionBend(rectangle, [{ x: 2, y: 0 }], { x: 2, y: -1 })).toBe(false);
    expect(
      splitPolygon(rectangle, [
        { x: 2, y: 0 },
        { x: 3, y: 0 },
        { x: 3, y: 1 },
      ]),
    ).toBeNull();
  });
});
