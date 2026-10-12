import { describe, expect, it } from 'vitest';
import type { Room } from '../../types/layout';
import { findRoomBoundarySnap } from './division';

const room: Room = {
  id: 'room-1',
  floorId: 'floor-1',
  name: '공간 1',
  vertices: [
    { x: 0, y: 0 },
    { x: 4, y: 0 },
    { x: 4, y: 2 },
    { x: 0, y: 2 },
  ],
};

describe('findRoomBoundarySnap', () => {
  it('snaps a near-grid wall click to the exact meter intersection after pan and zoom', () => {
    expect(findRoomBoundarySnap([room], { x: 251, y: 34 }, { x: 50, y: 30, scale: 100 })).toEqual({
      roomId: 'room-1',
      world: { x: 2, y: 0 },
      screen: { x: 250, y: 30 },
    });
  });

  it('rejects a click away from every room boundary', () => {
    expect(
      findRoomBoundarySnap([room], { x: 250, y: 120 }, { x: 50, y: 30, scale: 100 }),
    ).toBeNull();
  });
});
