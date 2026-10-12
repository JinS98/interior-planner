import { describe, expect, it } from 'vitest';
import { polygonArea } from '../domain/geometry/coordinates';
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

describe('splitRoom', () => {
  it('replaces one 14㎡ room with three counted rooms while keeping the total area', () => {
    const store = useProjectStore.getState();
    const before = useProjectStore.getState().floorsById[LOCAL_FLOOR_ID].roomIds.length;
    expect(
      store.createRoom(LOCAL_FLOOR_ID, [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 4, y: 2 },
        { x: 2, y: 2 },
        { x: 2, y: 5 },
        { x: 0, y: 5 },
      ]),
    ).toBe(true);
    const firstId = useProjectStore.getState().floorsById[LOCAL_FLOOR_ID].roomIds.at(-1)!;
    expect(
      store.splitRoom(firstId, [
        { x: 2, y: 0 },
        { x: 2, y: 2 },
      ]),
    ).toBe(true);
    const afterFirstCut = useProjectStore.getState();
    const addedId = afterFirstCut.floorsById[LOCAL_FLOOR_ID].roomIds.at(-1)!;
    const largeRoomId = [firstId, addedId].find(
      (id) => polygonArea(afterFirstCut.roomsById[id].vertices) === 10,
    )!;
    expect(
      store.splitRoom(largeRoomId, [
        { x: 0, y: 2 },
        { x: 2, y: 2 },
      ]),
    ).toBe(true);

    const state = useProjectStore.getState();
    const createdIds = state.floorsById[LOCAL_FLOOR_ID].roomIds.slice(before);
    expect(createdIds).toHaveLength(3);
    expect(createdIds.map((id) => polygonArea(state.roomsById[id].vertices)).sort()).toEqual([
      4, 4, 6,
    ]);
    expect(
      store.splitRoom(firstId, [
        { x: 0, y: 0 },
        { x: 0, y: 1 },
      ]),
    ).toBe(false);
    expect(useProjectStore.getState().floorsById[LOCAL_FLOOR_ID].roomIds).toHaveLength(before + 3);
  });

  it('persists a bent divider as two rooms with 1㎡ and 5㎡ areas', () => {
    const store = useProjectStore.getState();
    const before = useProjectStore.getState().floorsById[LOCAL_FLOOR_ID].roomIds.length;
    expect(
      store.createRoom(LOCAL_FLOOR_ID, [
        { x: 0, y: 0 },
        { x: 3, y: 0 },
        { x: 3, y: 2 },
        { x: 0, y: 2 },
      ]),
    ).toBe(true);
    const roomId = useProjectStore.getState().floorsById[LOCAL_FLOOR_ID].roomIds.at(-1)!;
    expect(
      store.splitRoom(roomId, [
        { x: 2, y: 0 },
        { x: 2, y: 1 },
        { x: 3, y: 1 },
      ]),
    ).toBe(true);
    const state = useProjectStore.getState();
    const ids = state.floorsById[LOCAL_FLOOR_ID].roomIds.slice(before);
    expect(ids).toHaveLength(2);
    expect(
      ids.map((id) => polygonArea(state.roomsById[id].vertices)).sort((a, b) => a - b),
    ).toEqual([1, 5]);
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
