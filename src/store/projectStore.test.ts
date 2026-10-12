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

  it('keeps a crossing room out of the project', () => {
    const before = useProjectStore.getState().floorsById[LOCAL_FLOOR_ID].roomIds.length;
    expect(
      useProjectStore.getState().createRoom(LOCAL_FLOOR_ID, [
        { x: 0, y: 0 },
        { x: 3, y: 3 },
        { x: 0, y: 3 },
        { x: 3, y: 0 },
      ]),
    ).toBe(false);
    expect(useProjectStore.getState().floorsById[LOCAL_FLOOR_ID].roomIds).toHaveLength(before);
  });
});

describe('updateRoomVertices', () => {
  it('persists a valid edit and rejects an invalid replacement', () => {
    const store = useProjectStore.getState();
    const original = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 3 },
      { x: 0, y: 3 },
    ];
    expect(store.createRoom(LOCAL_FLOOR_ID, original)).toBe(true);
    const roomId = useProjectStore.getState().floorsById[LOCAL_FLOOR_ID].roomIds.at(-1)!;
    const edited = original.map((point, index) => (index === 1 ? { x: 5, y: 0 } : point));
    expect(store.updateRoomVertices(roomId, edited)).toBeNull();
    expect(useProjectStore.getState().roomsById[roomId].vertices).toEqual(edited);

    const crossing = original.map((point, index) => (index === 1 ? { x: 2, y: 4 } : point));
    expect(store.updateRoomVertices(roomId, crossing)).toBe('self-intersection');
    expect(useProjectStore.getState().roomsById[roomId].vertices).toEqual(edited);
  });
});

describe('setTargetAreaSqm', () => {
  it('stores a positive square-meter target and clears it when requested', () => {
    const store = useProjectStore.getState();
    store.setTargetAreaSqm(LOCAL_PROJECT_ID, 12.5);
    expect(useProjectStore.getState().projectsById[LOCAL_PROJECT_ID].targetAreaSqm).toBe(12.5);

    store.setTargetAreaSqm(LOCAL_PROJECT_ID, null);
    expect(useProjectStore.getState().projectsById[LOCAL_PROJECT_ID].targetAreaSqm).toBeNull();
  });

  it('ignores non-positive or non-finite targets', () => {
    const store = useProjectStore.getState();
    store.setTargetAreaSqm(LOCAL_PROJECT_ID, 8);
    store.setTargetAreaSqm(LOCAL_PROJECT_ID, 0);
    store.setTargetAreaSqm(LOCAL_PROJECT_ID, Number.NaN);
    expect(useProjectStore.getState().projectsById[LOCAL_PROJECT_ID].targetAreaSqm).toBe(8);
    store.setTargetAreaSqm(LOCAL_PROJECT_ID, null);
  });
});
