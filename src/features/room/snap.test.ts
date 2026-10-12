import { describe, expect, it } from 'vitest';
import { snapRoomPoint } from './snap';

const viewport = { x: 30, y: -10, scale: 160 };
const last = { x: 0.3, y: 0.5 };

describe('snapRoomPoint', () => {
  it('aligns a new point horizontally with the last vertex', () => {
    expect(snapRoomPoint({ x: 240, y: 77 }, last, viewport)).toEqual({
      kind: 'horizontal',
      world: { x: 1.3125, y: 0.5 },
      screen: { x: 240, y: 70 },
    });
  });

  it('aligns a new point vertically with the last vertex', () => {
    expect(snapRoomPoint({ x: 84, y: 233 }, last, viewport)).toEqual({
      kind: 'vertical',
      world: { x: 0.3, y: 1.51875 },
      screen: { x: 78, y: 233 },
    });
  });

  it('uses the grid when it also keeps the wall horizontal', () => {
    expect(snapRoomPoint({ x: 192, y: 156 }, { x: 0.3, y: 1 }, viewport)).toEqual({
      kind: 'grid',
      world: { x: 1, y: 1 },
      screen: { x: 190, y: 150 },
    });
  });

  it('uses the closer axis when a grid point would bend the wall', () => {
    expect(snapRoomPoint({ x: 190, y: 156 }, { x: 0.3, y: 1.05 }, viewport)).toEqual({
      kind: 'horizontal',
      world: { x: 1, y: 1.05 },
      screen: { x: 190, y: 158 },
    });
  });

  it('does not snap a free point when it is away from guides', () => {
    expect(snapRoomPoint({ x: 260, y: 100 }, last, viewport)).toBeNull();
  });
});
