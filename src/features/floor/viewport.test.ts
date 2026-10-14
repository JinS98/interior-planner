import { describe, expect, it } from 'vitest';
import { worldToScreen } from '../../domain/geometry/coordinates';
import type { Floor, LayoutObject, Room } from '../../types/layout';
import { centeredFloorViewport, floorContentBounds } from './viewport';

const floor: Floor = {
  id: 'floor-2',
  projectId: 'project',
  name: '2F',
  roomIds: ['room'],
  objectIds: [],
};
const room: Room = {
  id: 'room',
  floorId: floor.id,
  name: '공간 1',
  vertices: [
    { x: 10, y: 5 },
    { x: 14, y: 5 },
    { x: 14, y: 8 },
    { x: 10, y: 8 },
  ],
};

describe('floor viewport', () => {
  it('centers a copied room inside the new half-width editor without clipping', () => {
    const bounds = floorContentBounds(floor, { room }, {});
    const viewport = centeredFloorViewport(bounds, { width: 500, height: 400 }, 140)!;
    const center = worldToScreen({ x: 12, y: 6.5 }, viewport);
    const topLeft = worldToScreen({ x: 10, y: 5 }, viewport);
    const bottomRight = worldToScreen({ x: 14, y: 8 }, viewport);
    expect(center).toEqual({ x: 250, y: 200 });
    expect(topLeft.x).toBeGreaterThanOrEqual(48);
    expect(topLeft.y).toBeGreaterThanOrEqual(48);
    expect(bottomRight.x).toBeLessThanOrEqual(452);
    expect(bottomRight.y).toBeLessThanOrEqual(352);
  });

  it('includes rotated furniture when fitting a floor', () => {
    const object: LayoutObject = {
      id: 'desk',
      floorId: floor.id,
      category: 'furniture',
      type: 'desk',
      name: '책상',
      x: 0,
      y: 0,
      width: 4,
      height: 2,
      color: '#ffffff',
      shape: 'rectangle',
      rotation: 45,
      locked: false,
    };
    const bounds = floorContentBounds(
      { ...floor, roomIds: [], objectIds: ['desk'] },
      {},
      { desk: object },
    )!;
    expect(bounds.minX).toBeLessThan(0);
    expect(bounds.maxX).toBeGreaterThan(4);
    expect(centeredFloorViewport(bounds, { width: 0, height: 400 }, 80)).toBeNull();
  });
});
