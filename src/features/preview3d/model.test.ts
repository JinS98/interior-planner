import { describe, expect, it } from 'vitest';
import type { Room } from '../../types/layout';
import { createFloorPreviewModel } from './model';

const room = (id: string, vertices: Room['vertices']): Room => ({
  id,
  floorId: 'floor-1',
  name: id,
  vertices,
});

describe('createFloorPreviewModel', () => {
  it('keeps the Room world coordinates for the 3D floor and wall bounds', () => {
    const vertices = [
      { x: -2, y: 1 },
      { x: 3, y: 1 },
      { x: 3, y: 2 },
      { x: 0, y: 2 },
      { x: 0, y: 4 },
      { x: -2, y: 4 },
    ];
    const model = createFloorPreviewModel([room('l-room', vertices)]);
    expect(model.rooms[0].vertices).toEqual(vertices);
    expect(model.bounds).toEqual({ minX: -2, minY: 1, maxX: 3, maxY: 4 });
    expect(model.walls).toHaveLength(6);
    expect(model.walls.reduce((sum, wall) => sum + wall.lengthMeters, 0)).toBeCloseTo(16);
  });

  it('draws a shared wall once even when neighboring edges overlap only partly', () => {
    const model = createFloorPreviewModel([
      room('left', [
        { x: 0, y: 0 },
        { x: 2, y: 0 },
        { x: 2, y: 2 },
        { x: 0, y: 2 },
      ]),
      room('right', [
        { x: 2, y: 0 },
        { x: 4, y: 0 },
        { x: 4, y: 1 },
        { x: 2, y: 1 },
      ]),
    ]);
    const shared = model.walls.filter(
      (wall) => Math.abs(wall.start.x - 2) < 1e-6 && Math.abs(wall.end.x - 2) < 1e-6,
    );
    expect(shared).toHaveLength(1);
    expect(shared[0].lengthMeters).toBeCloseTo(2);
    expect(model.rooms).toHaveLength(2);
  });

  it('ignores incomplete or invalid polygons', () => {
    const model = createFloorPreviewModel([
      room('incomplete', [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ]),
    ]);
    expect(model).toEqual({ rooms: [], walls: [], bounds: null });
  });
});
