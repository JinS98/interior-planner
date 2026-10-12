import { METERS_TO_PYEONG } from './coordinates';

export type AreaUnit = 'sqm' | 'pyeong';

export function areaFromSquareMeters(areaSqm: number, unit: AreaUnit): number {
  return unit === 'pyeong' ? areaSqm * METERS_TO_PYEONG : areaSqm;
}

export function areaToSquareMeters(area: number, unit: AreaUnit): number {
  return unit === 'pyeong' ? area / METERS_TO_PYEONG : area;
}

const areaFormatter = new Intl.NumberFormat('ko-KR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatArea(areaSqm: number, unit: AreaUnit): string {
  const value = areaFromSquareMeters(areaSqm, unit);
  return `${areaFormatter.format(value)} ${unit === 'pyeong' ? '평' : '㎡'}`;
}

export function formatAreaDifference(actualSqm: number, targetSqm: number, unit: AreaUnit): string {
  const differenceSqm = actualSqm - targetSqm;
  if (Math.abs(areaFromSquareMeters(differenceSqm, unit)) < 0.005) return '목표와 일치';
  return `${formatArea(Math.abs(differenceSqm), unit)} ${differenceSqm > 0 ? '초과' : '부족'}`;
}
