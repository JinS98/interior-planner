import { describe, expect, it } from 'vitest';
import { areaFromSquareMeters, areaToSquareMeters, formatArea, formatAreaDifference } from './area';
import { polygonArea } from './coordinates';

describe('room area display', () => {
  it('formats the same Shoelace result in square meters and pyeong', () => {
    const room = [
      { x: 0, y: 0 },
      { x: 3.305785, y: 0 },
      { x: 3.305785, y: 1 },
      { x: 0, y: 1 },
    ];
    const areaSqm = polygonArea(room);

    expect(formatArea(areaSqm, 'sqm')).toBe('3.31 ㎡');
    expect(formatArea(areaSqm, 'pyeong')).toBe('1.00 평');
    expect(areaSqm).toBe(3.305785);
  });

  it('converts a pyeong target to square meters without changing the stored unit', () => {
    expect(areaToSquareMeters(1, 'pyeong')).toBeCloseTo(3.305785);
    expect(areaFromSquareMeters(3.305785, 'pyeong')).toBeCloseTo(1);
    expect(areaToSquareMeters(12, 'sqm')).toBe(12);
  });

  it('describes a shortage, an excess, and a display-level match', () => {
    expect(formatAreaDifference(8, 10, 'sqm')).toBe('2.00 ㎡ 부족');
    expect(formatAreaDifference(13.305785, 10, 'pyeong')).toBe('1.00 평 초과');
    expect(formatAreaDifference(10.001, 10, 'sqm')).toBe('목표와 일치');
  });
});
