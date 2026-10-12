import { describe, expect, it } from 'vitest';
import { snapScreenPointToGrid } from './gridSnap';

describe('snapScreenPointToGrid', () => {
  it('snaps a nearby pointer to a grid intersection', () => {
    expect(snapScreenPointToGrid({ x: 153, y: 122 }, { x: 72, y: 44, scale: 80 })).toEqual({
      world: { x: 1, y: 1 },
      screen: { x: 152, y: 124 },
    });
  });

  it('keeps points outside the snap radius free', () => {
    expect(snapScreenPointToGrid({ x: 140, y: 110 }, { x: 72, y: 44, scale: 80 })).toBeNull();
  });

  it('uses screen distance after zooming and panning, including negative coordinates', () => {
    expect(snapScreenPointToGrid({ x: -128, y: 303 }, { x: 30, y: -10, scale: 160 })).toEqual({
      world: { x: -1, y: 2 },
      screen: { x: -130, y: 310 },
    });
  });
});
