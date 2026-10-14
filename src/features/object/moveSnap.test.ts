import { describe, expect, it } from 'vitest';
import type { Viewport } from '../../types/layout';
import { layoutObjectFromPreset } from './catalog';
import { snapObjectMove } from './moveSnap';

const viewport: Viewport = { x: 30, y: -20, scale: 80 };
const desk = layoutObjectFromPreset('floor', 'desk', { x: 1, y: 1 }, 'desk');
const chair = layoutObjectFromPreset('floor', 'chair', { x: 2.5, y: 1 }, 'chair');

describe('snapObjectMove', () => {
  it('snaps the primary center to the grid while keeping group spacing', () => {
    const snapped = snapObjectMove([desk, chair], 'desk', [], { x: 1.92, y: 0.08 }, viewport);
    expect(snapped.delta.x).toBeCloseTo(2);
    expect(snapped.delta.y).toBeCloseTo(0);
    expect(snapped.xGuide).toEqual({ world: 3, kind: 'grid' });
    expect(snapped.yGuide).toEqual({ world: 1, kind: 'grid' });
    expect(chair.x + snapped.delta.x - (desk.x + snapped.delta.x)).toBeCloseTo(chair.x - desk.x);
  });

  it('prioritizes another object center and ignores the selected group itself', () => {
    const other = layoutObjectFromPreset('floor', 'desk', { x: 4.1, y: 2.1 }, 'other');
    const snapped = snapObjectMove([desk, chair], 'desk', [other], { x: 3.03, y: 1.02 }, viewport);
    expect(snapped.delta.x).toBeCloseTo(3.1);
    expect(snapped.delta.y).toBeCloseTo(1.1);
    expect(snapped.xGuide).toEqual({ world: 4.1, kind: 'object' });
    expect(snapped.yGuide).toEqual({ world: 2.1, kind: 'object' });
  });

  it('leaves a free move unsnapped when no guide is close', () => {
    const snapped = snapObjectMove([desk], 'desk', [], { x: 0.4, y: 0.4 }, viewport);
    expect(snapped.delta).toEqual({ x: 0.4, y: 0.4 });
    expect(snapped.xGuide).toBeNull();
    expect(snapped.yGuide).toBeNull();
  });
});
