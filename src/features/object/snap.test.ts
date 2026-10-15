import { describe, expect, it } from 'vitest';
import { worldToScreen } from '../../domain/geometry/coordinates';
import type { Viewport } from '../../types/layout';
import {
  defaultObjectAppearance,
  layoutObjectFromPaletteItem,
  layoutObjectFromPreset,
} from './catalog';
import { objectArrayCenters, objectArrayFootprint } from './array';
import { snapObjectPlacement } from './snap';

const viewport: Viewport = { x: 0, y: 0, scale: 80 };
// These spacing scenarios use fixed footprints so palette default changes do not alter the geometry.
const deskAt = (center: { x: number; y: number }, id: string) =>
  layoutObjectFromPreset('floor-1', 'desk', center, id, {
    ...defaultObjectAppearance('desk'),
    width: 1.4,
    height: 0.7,
  });
const chairAt = (center: { x: number; y: number }, id: string) =>
  layoutObjectFromPreset('floor-1', 'chair', center, id, {
    ...defaultObjectAppearance('chair'),
    width: 0.6,
    height: 0.6,
  });
const desk = deskAt({ x: 1, y: 2 }, 'desk-1');
const chair = chairAt({ x: 3, y: 2 }, 'chair-1');
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

  it('keeps horizontal spacing when different sized objects share a top edge', () => {
    const right = pc({ x: 3, y: 1.9 }, 'pc-right');
    const snap = snapObjectPlacement(
      worldToScreen({ x: 4.64, y: 1.96 }, viewport),
      viewport,
      [desk, right],
      pcItem,
    );
    expect(snap.center.x).toBeCloseTo(4.6);
    expect(snap.center.y).toBeCloseTo(1.9);
    expect(snap.gapGuide?.meters).toBeCloseTo(1);
  });

  it('does not claim equal spacing for objects on different rows', () => {
    const lowerChair = chairAt({ x: 3, y: 2.3 }, 'chair-2');
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

  it('keeps the same outside gap when placing two objects together', () => {
    const options = { columns: 2, rows: 1, gapX: 0.2, gapY: 0 };
    const snap = snapObjectPlacement(
      worldToScreen({ x: 5.08, y: 2.04 }, viewport),
      viewport,
      [desk, chair],
      objectArrayFootprint(pcItem, options),
    );
    expect(snap.center.x).toBeCloseTo(5);
    expect(snap.gapGuide?.meters).toBeCloseTo(1);
    const first = pc(objectArrayCenters(snap.center, pcItem, options)[0], 'array-1');
    expect(first.x - (chair.x + chair.width)).toBeCloseTo(1);
  });

  it('aligns the first edge of a new horizontal array beneath an existing row', () => {
    const first = deskAt({ x: 1.35, y: 1.1 }, 'row-1');
    const second = deskAt({ x: 3.35, y: 1.1 }, 'row-2');
    const options = { columns: 2, rows: 1, gapX: 0.6, gapY: 0 };
    const snap = snapObjectPlacement(
      worldToScreen({ x: 2.43, y: 2.55 }, viewport),
      viewport,
      [first, second],
      objectArrayFootprint(first, options),
    );
    const placed = objectArrayCenters(snap.center, first, options);
    expect(placed[0].x - first.width / 2).toBeCloseTo(first.x);
    expect(snap.startLineGuide?.[0].x).toBeCloseTo(first.x);
    expect(snap.startLineGuide?.[1].x).toBeCloseTo(first.x);

    const away = snapObjectPlacement(
      worldToScreen({ x: 2.7, y: 2.55 }, viewport),
      viewport,
      [first, second],
      objectArrayFootprint(first, options),
    );
    expect(away.startLineGuide).toBeUndefined();
  });

  it('also aligns a single item left edge below a row without changing its height', () => {
    const first = deskAt({ x: 1.35, y: 1.1 }, 'row-1');
    const second = deskAt({ x: 3.35, y: 1.1 }, 'row-2');
    const snap = snapObjectPlacement(
      worldToScreen({ x: 1.03, y: 2.55 }, viewport),
      viewport,
      [first, second],
      pcItem,
    );
    expect(snap.center.x - pcItem.width / 2).toBeCloseTo(first.x);
    expect(snap.center.y).toBeCloseTo(2.55);
    expect(snap.startLineGuide).toBeDefined();
  });

  it('extends a column with equal spacing when placing one object', () => {
    const bottom = deskAt({ x: 1, y: 4 }, 'desk-2');
    const snap = snapObjectPlacement(
      worldToScreen({ x: 1.03, y: 5.99 }, viewport),
      viewport,
      [desk, bottom],
      chair,
    );
    expect(snap.center.x).toBe(1);
    expect(snap.center.y).toBeCloseTo(5.95);
    expect(snap.gapGuide?.meters).toBeCloseTo(1.3);
  });

  it('keeps vertical spacing when different sized objects share a left edge', () => {
    const lower = pc({ x: 0.6, y: 4 }, 'pc-lower');
    const snap = snapObjectPlacement(
      worldToScreen({ x: 0.64, y: 5.95 }, viewport),
      viewport,
      [desk, lower],
      pcItem,
    );
    expect(snap.center.x).toBeCloseTo(0.6);
    expect(snap.center.y).toBeCloseTo(5.9);
    expect(snap.gapGuide?.meters).toBeCloseTo(1.4);
    expect(snap.gapGuide!.first[1].y - snap.gapGuide!.first[0].y).toBeCloseTo(1.4);
    expect(snap.gapGuide!.second[1].y - snap.gapGuide!.second[0].y).toBeCloseTo(1.4);
  });

  it('uses the entire array footprint for vertical equal spacing', () => {
    const lower = pc({ x: 0.6, y: 4 }, 'pc-lower');
    const options = { columns: 1, rows: 2, gapX: 0, gapY: 0.2 };
    const snap = snapObjectPlacement(
      worldToScreen({ x: 0.61, y: 6.3 }, viewport),
      viewport,
      [desk, lower],
      objectArrayFootprint(pcItem, options),
    );
    expect(snap.center.x).toBeCloseTo(0.6);
    expect(snap.center.y).toBeCloseTo(6.25);
    expect(snap.gapGuide?.meters).toBeCloseTo(1.4);
    const first = pc(objectArrayCenters(snap.center, pcItem, options)[0], 'array-first');
    expect(first.y - (lower.y + lower.height)).toBeCloseTo(1.4);
  });

  it('keeps zero spacing after an adjacent two-object placement', () => {
    const first = pc({ x: 1, y: 2 }, 'pc-1');
    const second = pc({ x: 1.6, y: 2 }, 'pc-2');
    const snap = snapObjectPlacement(
      worldToScreen({ x: 2.27, y: 2.03 }, viewport),
      viewport,
      [first, second],
      pcItem,
    );
    expect(snap.center.x).toBeCloseTo(2.2);
    expect(snap.gapGuide?.meters).toBe(0);
  });

  it('snaps an object footprint to a room wall and corner before grid guides', () => {
    const room = {
      id: 'room-1',
      floorId: 'floor-1',
      name: '방',
      vertices: [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 4, y: 3 },
        { x: 0, y: 3 },
      ],
    };
    const wall = snapObjectPlacement(
      worldToScreen({ x: 2, y: 0.48 }, viewport),
      viewport,
      [],
      { width: 1, height: 1 },
      [room],
    );
    expect(wall.roomBoundary).toBe(true);
    expect(wall.center).toEqual({ x: 2, y: 0.5 });

    const corner = snapObjectPlacement(
      worldToScreen({ x: 0.02, y: 0.03 }, viewport),
      viewport,
      [],
      { width: 1, height: 1 },
      [room],
    );
    expect(corner.center).toEqual({ x: 0.5, y: 0.5 });
  });

  it('offsets the object inward from a diagonal wall', () => {
    const room = {
      id: 'diagonal-room',
      floorId: 'floor-1',
      name: '삼각형 방',
      vertices: [
        { x: 0, y: 0 },
        { x: 4, y: 4 },
        { x: 0, y: 4 },
      ],
    };
    const snap = snapObjectPlacement(
      worldToScreen({ x: 2, y: 2 }, viewport),
      viewport,
      [],
      { width: 1, height: 1 },
      [room],
    );
    expect(snap.roomBoundary).toBe(true);
    expect(snap.center.x).toBeCloseTo(1.5);
    expect(snap.center.y).toBeCloseTo(2.5);
  });
});
