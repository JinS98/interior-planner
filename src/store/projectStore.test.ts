import { describe, expect, it } from 'vitest';
import { LOCAL_FLOOR_ID, LOCAL_PROJECT_ID, useProjectStore } from './projectStore';

describe('createRoom', () => {
  it('adds a closed room to its floor with a copy of the drawing vertices', () => {
    const vertices = [
      { x: 0, y: 0 },
      { x: 3, y: 0 },
      { x: 3, y: 2 },
    ];
    const before = useProjectStore.getState().floorsById[LOCAL_FLOOR_ID].roomIds.length;

    expect(useProjectStore.getState().createRoom(LOCAL_FLOOR_ID, vertices)).toBe(true);

    const state = useProjectStore.getState();
    const floor = state.floorsById[LOCAL_FLOOR_ID];
    const roomId = floor.roomIds.at(-1)!;
    expect(floor.roomIds).toHaveLength(before + 1);
    expect(state.roomsById[roomId]).toMatchObject({ floorId: LOCAL_FLOOR_ID, vertices });
    expect(state.roomsById[roomId].vertices).not.toBe(vertices);
    expect(state.projectsById[LOCAL_PROJECT_ID].floorIds).toContain(LOCAL_FLOOR_ID);
  });

  it('keeps a zero-area drawing out of the project', () => {
    const before = useProjectStore.getState().floorsById[LOCAL_FLOOR_ID].roomIds.length;
    expect(
      useProjectStore.getState().createRoom(LOCAL_FLOOR_ID, [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
        { x: 2, y: 2 },
      ]),
    ).toBe(false);
    expect(useProjectStore.getState().floorsById[LOCAL_FLOOR_ID].roomIds).toHaveLength(before);
  });
});
