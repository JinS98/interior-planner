import { describe, expect, it } from 'vitest';
import { worldToScreen } from '../../domain/geometry/coordinates';
import type { Viewport } from '../../types/layout';
import { layoutObjectFromPaletteItem, layoutObjectFromPreset } from './catalog';
import { snapObjectPlacement } from './snap';

const viewport: Viewport = { x: 0, y: 0, scale: 80 };
const desk = layoutObjectFromPreset('floor-1', 'desk', { x: 1, y: 2 }, 'desk-1');
const chair = layoutObjectFromPreset('floor-1', 'chair', { x: 3, y: 2 }, 'chair-1');
const pcItem = {
  id: 'pc-custom',
  projectId: 'project-1',
  name: 'PC',
  category: 'electronics' as const,
  width: 0.6,
  height: 0.5,
  color: '#8494AD',
  shape: 'rectangle' as const,
  builtIn: false,
};
const pc = (center: { x: number; y: number }, id: string) =>
  layoutObjectFromPaletteItem('floor-1', pcItem, center, id);

describe('snapObjectPlacement', () => {
  it('aligns a new object to an existing center on either axis', () => {
    const horizontal = snapObjectPlacement(
      worldToScreen({ x: 4.18, y: 2.08 }, viewport),
      viewport,
      [desk],
      pcItem,
    );
    expect(horizontal.center).toEqual({ x: 4.18, y: 2 });
    expect(horizontal.horizontalReference).toEqual({ x: 1, y: 2 });

    const vertical = snapObjectPlacement(
      worldToScreen({ x: 1.08, y: 4.18 }, viewport),
      viewport,
      [desk],
      chair,
    );
    expect(vertical.center).toEqual({ x: 1, y: 4.18 });
    expect(vertical.verticalReference).toEqual({ x: 1, y: 2 });
  });

  it('extends two horizontally aligned objects with the same edge gap', () => {
    const snap = snapObjectPlacement(
      worldToScreen({ x: 4.67, y: 2.06 }, viewport),
      viewport,
      [desk, chair],
      pcItem,
    );
    expect(snap.center.x).toBeCloseTo(4.6);
    expect(snap.center.y).toBe(2);
    expect(snap.gapGuide?.meters).toBeCloseTo(1);
    expect(snap.gapGuide!.first[1].x - snap.gapGuide!.first[0].x).toBeCloseTo(1);
    expect(snap.gapGuide!.second[1].x - snap.gapGuide!.second[0].x).toBeCloseTo(1);

    const object = pc(snap.center, 'pc-1');
    expect(object.x - (chair.x + chair.width)).toBeCloseTo(1);
  });

  it('also extends the row to the left and works after zooming and panning', () => {
    const movedViewport: Viewport = { x: 35, y: -20, scale: 160 };
    const snap = snapObjectPlacement(
      worldToScreen({ x: -0.95, y: 2.04 }, movedViewport),
      movedViewport,
      [desk, chair],
      pcItem,
    );
    expect(snap.center.x).toBeCloseTo(-1);
    expect(snap.center.y).toBe(2);
    expect(snap.gapGuide?.meters).toBeCloseTo(1);
  });

  it('does not claim equal spacing for objects on different rows', () => {
    const lowerChair = layoutObjectFromPreset('floor-1', 'chair', { x: 3, y: 2.3 }, 'chair-2');
    const snap = snapObjectPlacement(
      worldToScreen({ x: 4.6, y: 2.05 }, viewport),
      viewport,
      [desk, lowerChair],
      pcItem,
    );
    expect(snap.gapGuide).toBeNull();
  });

  it('does not use a non-adjacent pair after a third object fills the row', () => {
    const third = pc({ x: 4.6, y: 2 }, 'pc-1');
    const snap = snapObjectPlacement(
      worldToScreen({ x: 7.8, y: 2 }, viewport),
      viewport,
      [desk, chair, third],
      chair,
    );
    expect(snap.gapGuide).toBeNull();
  });

  it('retains grid snapping when there is no nearby object guide', () => {
    const snap = snapObjectPlacement({ x: 82, y: 79 }, viewport, [], desk);
    expect(snap.center).toEqual({ x: 1, y: 1 });
    expect(snap.grid).toBe(true);
  });

  it('uses the selected custom width for equal edge spacing', () => {
    const snap = snapObjectPlacement(
      worldToScreen({ x: 5.3, y: 2 }, viewport),
      viewport,
      [desk, chair],
      { width: 2, height: 0.8 },
    );
    expect(snap.center.x).toBeCloseTo(5.3);
    expect(snap.gapGuide?.meters).toBeCloseTo(1);
  });
});
