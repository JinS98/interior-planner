import { describe, expect, it } from 'vitest';
import { snapRightAngle } from '../../domain/geometry/angles';
import { rotateRoomFromScreenDrag } from './rotation';

describe('right-angle rotation snapping', () => {
  it('snaps within eight degrees and preserves other angles', () => {
    expect(snapRightAngle(84)).toBe(90);
    expect(snapRightAngle(185)).toBe(180);
    expect(snapRightAngle(356)).toBe(0);
    expect(snapRightAngle(79)).toBe(79);
  });

  it('rotates room vertices around the room center and snaps a near-right-angle drag', () => {
    const vertices = [
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 2 },
      { x: 0, y: 2 },
    ];
    const rotated = rotateRoomFromScreenDrag(
      vertices,
      { x: 80, y: 0 },
      { x: 160, y: 88 },
      { x: 0, y: 0, scale: 80 },
    );
    expect(rotated[0].x).toBeCloseTo(2);
    expect(rotated[0].y).toBeCloseTo(0);
  });
});
