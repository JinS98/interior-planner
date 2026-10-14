/** 직각에서 8° 이내면 정확한 0°·90°·180°·270°로 맞춘다. */
export function snapRightAngle(degrees: number, tolerance = 8): number {
  const normalized = ((degrees % 360) + 360) % 360;
  const nearest = Math.round(normalized / 90) * 90;
  return Math.abs(normalized - nearest) <= tolerance ? nearest % 360 : normalized;
}
