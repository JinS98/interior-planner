import { describe, expect, it } from 'vitest';
import type { Viewport } from '../../types/layout';
import { layoutObjectFromPreset } from './catalog';
import { objectsInSelectionRect, selectionRectBetween } from './selection';

const viewport: Viewport = { x: 0, y: 0, scale: 80 };

describe('objectsInSelectionRect', () => {
  it('selects only the objects touched by a marquee in either drag direction', () => {
    const desk = layoutObjectFromPreset('floor', 'desk', { x: 1, y: 1 }, 'desk');
    const chair = layoutObjectFromPreset('floor', 'chair', { x: 3, y: 1 }, 'chair');
    const rect = selectionRectBetween({ x: 150, y: 120 }, { x: 100, y: 80 });
    expect(objectsInSelectionRect([desk, chair], rect, viewport)).toEqual(['desk']);
  });

  it('uses the rotated bounds rather than the unrotated rectangle', () => {
    const desk = {
      ...layoutObjectFromPreset('floor', 'desk', { x: 2, y: 2 }, 'desk'),
      rotation: 90,
    };
    const rect = selectionRectBetween({ x: 150, y: 110 }, { x: 165, y: 125 });
    expect(objectsInSelectionRect([desk], rect, viewport)).toEqual(['desk']);
    expect(objectsInSelectionRect([{ ...desk, rotation: 0 }], rect, viewport)).toEqual([]);
  });
});
