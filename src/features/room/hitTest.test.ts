import { describe, expect, it } from 'vitest';
import type { Room } from '../../types/layout';
import { hitTestRoom } from './hitTest';

const room: Room = {
  id: 'room-1',
  floorId: 'floor-1',
  name: '공간 1',
  vertices: [
    { x: 0, y: 0 },
    { x: 4, y: 0 },
    { x: 4, y: 3 },
    { x: 0, y: 3 },
  ],
};
const viewport = { x: 20, y: 30, scale: 80 };

describe('hitTestRoom', () => {
  it('finds vertices and walls by screen distance after zoom and pan', () => {
    expect(hitTestRoom([room], { x: 22, y: 34 }, viewport)).toEqual({
      roomId: room.id,
      kind: 'vertex',
      index: 0,
    });
    expect(hitTestRoom([room], { x: 180, y: 34 }, viewport)).toEqual({
      roomId: room.id,
      kind: 'wall',
      index: 0,
    });
  });

  it('finds the interior and ignores empty space', () => {
    expect(hitTestRoom([room], { x: 180, y: 150 }, viewport)).toEqual({
      roomId: room.id,
      kind: 'interior',
    });
    expect(hitTestRoom([room], { x: 500, y: 500 }, viewport)).toBeNull();
  });
});
