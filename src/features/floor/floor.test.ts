import { beforeEach, describe, expect, it } from 'vitest';
import { redoEditorCommand, undoEditorCommand } from '../history/actions';
import { projectSnapshot } from '../history/command';
import { useEditorStore } from '../../store/editorStore';
import { LOCAL_FLOOR_ID, LOCAL_PROJECT_ID, useProjectStore } from '../../store/projectStore';

const initialData = projectSnapshot(useProjectStore.getState());
const square = [
  { x: 0, y: 0 },
  { x: 2, y: 0 },
  { x: 2, y: 2 },
  { x: 0, y: 2 },
];

beforeEach(() => {
  useProjectStore.getState().replaceProjectData(initialData);
  useEditorStore.setState({ activeProjectId: LOCAL_PROJECT_ID, activeFloorId: LOCAL_FLOOR_ID });
});

describe('floor management', () => {
  it('can start a floor without copying the divided room structure while copying objects', () => {
    const store = useProjectStore.getState();
    expect(store.createRoom(LOCAL_FLOOR_ID, square)).toBe(true);
    expect(store.createRoom(LOCAL_FLOOR_ID, square.map(({ x, y }) => ({ x: x + 2, y })))).toBe(true);
    expect(store.createLayoutObject(LOCAL_FLOOR_ID, 'desk', { x: 1, y: 1 })).toBe(true);
    const second = store.createFloor(LOCAL_PROJECT_ID, {
      sourceFloorId: LOCAL_FLOOR_ID,
      copyRooms: false,
      copyObjects: true,
    })!;
    expect(second.roomIds).toEqual([]);
    expect(second.objectIds).toHaveLength(1);
    expect(useProjectStore.getState().floorsById[LOCAL_FLOOR_ID].roomIds).toHaveLength(2);
    expect(store.createRoom(second.id, square)).toBe(true);
    expect(useProjectStore.getState().floorsById[LOCAL_FLOOR_ID].roomIds).toHaveLength(2);
    expect(useProjectStore.getState().floorsById[second.id].roomIds).toHaveLength(1);
  });

  it('copies room geometry to a new floor without furniture by default', () => {
    const store = useProjectStore.getState();
    expect(store.createRoom(LOCAL_FLOOR_ID, square)).toBe(true);
    expect(store.createLayoutObject(LOCAL_FLOOR_ID, 'desk', { x: 4, y: 4 })).toBe(true);
    const sourceRoomId = useProjectStore.getState().floorsById[LOCAL_FLOOR_ID].roomIds[0];
    const second = store.createFloor(LOCAL_PROJECT_ID, { sourceFloorId: LOCAL_FLOOR_ID })!;
    expect(second.roomIds).toHaveLength(1);
    expect(second.objectIds).toEqual([]);
    const copyId = second.roomIds[0];
    const state = useProjectStore.getState();
    expect(copyId).not.toBe(sourceRoomId);
    expect(state.roomsById[copyId].vertices).toEqual(state.roomsById[sourceRoomId].vertices);
    expect(state.roomsById[copyId].vertices).not.toBe(state.roomsById[sourceRoomId].vertices);
    expect(undoEditorCommand()).toBe(true);
    expect(useProjectStore.getState().roomsById[copyId]).toBeUndefined();
    expect(useProjectStore.getState().roomsById[sourceRoomId]).toBeDefined();
    expect(redoEditorCommand()).toBe(true);
    expect(useProjectStore.getState().roomsById[copyId]).toBeDefined();
    expect(
      store.updateRoomVertices(
        copyId,
        square.map((point) => ({ ...point, x: point.x + 2 })),
      ),
    ).toBeNull();
    expect(useProjectStore.getState().roomsById[sourceRoomId].vertices).toEqual(square);
  });

  it('copies objects only when the option is selected', () => {
    const store = useProjectStore.getState();
    expect(store.createLayoutObject(LOCAL_FLOOR_ID, 'chair', { x: 3, y: 3 })).toBe(true);
    const sourceId = useProjectStore.getState().floorsById[LOCAL_FLOOR_ID].objectIds[0];
    const second = store.createFloor(LOCAL_PROJECT_ID, {
      sourceFloorId: LOCAL_FLOOR_ID,
      copyObjects: true,
    })!;
    expect(second.objectIds).toHaveLength(1);
    const copyId = second.objectIds[0];
    expect(copyId).not.toBe(sourceId);
    expect(useProjectStore.getState().objectsById[copyId]).toMatchObject({
      ...useProjectStore.getState().objectsById[sourceId],
      id: copyId,
      floorId: second.id,
    });
    expect(store.updateLayoutObject(copyId, { x: 8 })).toBe(true);
    expect(useProjectStore.getState().objectsById[sourceId].x).not.toBe(8);
    expect(store.createFloor(LOCAL_PROJECT_ID, { sourceFloorId: 'missing-floor' })).toBeNull();
  });

  it('returns to an existing floor when undo removes the active new floor', () => {
    const second = useProjectStore.getState().createFloor(LOCAL_PROJECT_ID)!;
    expect(useEditorStore.getState().setActiveFloor(second.id)).toBe(true);
    expect(undoEditorCommand()).toBe(true);
    expect(useProjectStore.getState().floorsById[second.id]).toBeUndefined();
    expect(useEditorStore.getState().activeFloorId).toBe(LOCAL_FLOOR_ID);
    expect(redoEditorCommand()).toBe(true);
    expect(useProjectStore.getState().floorsById[second.id]).toBeDefined();
  });

  it('keeps rooms and objects on their own floor and clears in-progress edits on switching', () => {
    const project = useProjectStore.getState();
    expect(project.createRoom(LOCAL_FLOOR_ID, square)).toBe(true);
    expect(project.createLayoutObject(LOCAL_FLOOR_ID, 'desk', { x: 4, y: 4 })).toBe(true);
    const firstRoomId = useProjectStore.getState().floorsById[LOCAL_FLOOR_ID].roomIds[0];
    const second = project.createFloor(LOCAL_PROJECT_ID);
    expect(second?.name).toBe('2F');
    expect(second?.roomIds).toEqual([]);
    expect(second?.objectIds).toEqual([]);
    expect(project.createRoom(second!.id, square)).toBe(true);
    expect(project.createLayoutObject(second!.id, 'chair', { x: 3, y: 3 })).toBe(true);

    const editor = useEditorStore.getState();
    editor.selectRoom(firstRoomId);
    editor.addRoomDraftVertex({ x: 5, y: 5 });
    editor.setDivisionDraft({ roomId: firstRoomId, points: [{ x: 0, y: 0 }] });
    editor.copyObjects([
      useProjectStore.getState().objectsById[
        useProjectStore.getState().floorsById[LOCAL_FLOOR_ID].objectIds[0]
      ],
    ]);
    expect(editor.setActiveFloor(second!.id)).toBe(true);
    expect(useEditorStore.getState()).toMatchObject({
      activeFloorId: second!.id,
      selectedRoomId: null,
      roomDraftVertices: [],
      divisionDraft: null,
      objectClipboard: [],
    });
    const state = useProjectStore.getState();
    expect(state.floorsById[LOCAL_FLOOR_ID].roomIds).toEqual([firstRoomId]);
    expect(state.floorsById[second!.id].roomIds).toHaveLength(1);
    expect(state.roomsById[state.floorsById[second!.id].roomIds[0]].floorId).toBe(second!.id);
    expect(state.floorsById[LOCAL_FLOOR_ID].objectIds).toHaveLength(1);
    expect(state.floorsById[second!.id].objectIds).toHaveLength(1);
    expect(editor.setActiveFloor('missing-floor')).toBe(false);
  });

  it('validates names and deletes floor contents as one undoable command', () => {
    const store = useProjectStore.getState();
    expect(store.deleteFloor(LOCAL_FLOOR_ID)).toBe(false);
    const second = store.createFloor(LOCAL_PROJECT_ID)!;
    expect(store.renameFloor(second.id, '  작업실  ')).toBe(true);
    expect(useProjectStore.getState().floorsById[second.id].name).toBe('작업실');
    expect(store.renameFloor(second.id, '1f')).toBe(false);
    expect(store.renameFloor(second.id, '   ')).toBe(false);
    expect(store.createRoom(second.id, square)).toBe(true);
    expect(store.createLayoutObject(second.id, 'desk', { x: 4, y: 4 })).toBe(true);
    const roomId = useProjectStore.getState().floorsById[second.id].roomIds[0];
    const objectId = useProjectStore.getState().floorsById[second.id].objectIds[0];
    expect(store.setLayoutObjectsLocked([objectId], true)).toBe(true);
    useEditorStore.getState().setActiveFloor(second.id);

    const historyLength = useProjectStore.getState().historyPast.length;
    expect(store.deleteFloor(second.id)).toBe(true);
    const deleted = useProjectStore.getState();
    expect(deleted.historyPast).toHaveLength(historyLength + 1);
    expect(deleted.projectsById[LOCAL_PROJECT_ID].floorIds).toEqual([LOCAL_FLOOR_ID]);
    expect(deleted.floorsById[second.id]).toBeUndefined();
    expect(deleted.roomsById[roomId]).toBeUndefined();
    expect(deleted.objectsById[objectId]).toBeUndefined();

    expect(undoEditorCommand()).toBe(true);
    expect(useProjectStore.getState().floorsById[second.id].roomIds).toContain(roomId);
    expect(useProjectStore.getState().objectsById[objectId].locked).toBe(true);
    expect(redoEditorCommand()).toBe(true);
    expect(useProjectStore.getState().floorsById[second.id]).toBeUndefined();
    expect(useEditorStore.getState().activeFloorId).toBe(LOCAL_FLOOR_ID);
  });
});

describe('floor connection objects', () => {
  function addStairs() {
    const item = useProjectStore.getState().addPaletteItem(LOCAL_PROJECT_ID, {
      name: '계단',
      category: 'facility',
      width: 2,
      height: 1,
      color: '#16845E',
      shape: 'rectangle',
      floorConnector: true,
    });
    expect(item).not.toBeNull();
    return item!.id;
  }

  it('adds an existing connector once to each new floor and keeps neighbor links current', () => {
    const store = useProjectStore.getState();
    const stairsId = addStairs();
    expect(store.createLayoutObject(LOCAL_FLOOR_ID, stairsId, { x: 3, y: 4 })).toBe(true);
    const firstId = useProjectStore.getState().floorsById[LOCAL_FLOOR_ID].objectIds[0];
    expect(store.createLayoutObject(LOCAL_FLOOR_ID, 'desk', { x: 6, y: 4 })).toBe(true);

    const second = store.createFloor(LOCAL_PROJECT_ID, {
      sourceFloorId: LOCAL_FLOOR_ID,
      copyObjects: true,
    })!;
    const third = store.createFloor(LOCAL_PROJECT_ID, { sourceFloorId: second.id })!;
    const state = useProjectStore.getState();
    expect(second.objectIds).toHaveLength(2);
    expect(third.objectIds).toHaveLength(1);
    const secondStairs = second.objectIds
      .map((id) => state.objectsById[id])
      .find((o) => o.floorConnectionId)!;
    const thirdStairs = state.objectsById[third.objectIds[0]];
    const firstStairs = state.objectsById[firstId];
    expect(new Set([firstStairs.id, secondStairs.id, thirdStairs.id]).size).toBe(3);
    expect(
      new Set([
        firstStairs.floorConnectionId,
        secondStairs.floorConnectionId,
        thirdStairs.floorConnectionId,
      ]).size,
    ).toBe(1);
    expect([firstStairs.x, secondStairs.x, thirdStairs.x]).toEqual([2, 2, 2]);
    expect(firstStairs).toMatchObject({ fromFloorId: null, toFloorId: second.id });
    expect(secondStairs).toMatchObject({ fromFloorId: LOCAL_FLOOR_ID, toFloorId: third.id });
    expect(thirdStairs).toMatchObject({ fromFloorId: second.id, toFloorId: null });

    expect(store.deleteFloor(second.id)).toBe(true);
    expect(useProjectStore.getState().objectsById[firstId].toFloorId).toBe(third.id);
    expect(useProjectStore.getState().objectsById[thirdStairs.id].fromFloorId).toBe(LOCAL_FLOOR_ID);
    expect(undoEditorCommand()).toBe(true);
    expect(useProjectStore.getState().objectsById[firstId].toFloorId).toBe(second.id);
  });

  it('places, edits, copies, locks and deletes a connector across existing floors as one command', () => {
    const store = useProjectStore.getState();
    const second = store.createFloor(LOCAL_PROJECT_ID)!;
    const third = store.createFloor(LOCAL_PROJECT_ID)!;
    const stairsId = addStairs();
    const historyCount = useProjectStore.getState().historyPast.length;
    expect(store.createLayoutObject(second.id, stairsId, { x: 5, y: 6 })).toBe(true);
    let state = useProjectStore.getState();
    expect(state.historyPast).toHaveLength(historyCount + 1);
    const ids = [LOCAL_FLOOR_ID, second.id, third.id].map(
      (floorId) => state.floorsById[floorId].objectIds[0],
    );
    expect(ids.every((id) => state.objectsById[id].floorConnectionId)).toBe(true);

    expect(store.moveLayoutObjects([ids[1]], { x: 1, y: -2 })).toBe(true);
    expect(store.updateLayoutObject(ids[2], { width: 3, rotation: 90 })).toBe(true);
    state = useProjectStore.getState();
    expect(ids.map((id) => [state.objectsById[id].x, state.objectsById[id].y])).toEqual([
      [5, 3.5],
      [5, 3.5],
      [5, 3.5],
    ]);
    expect(ids.map((id) => [state.objectsById[id].width, state.objectsById[id].rotation])).toEqual([
      [3, 90],
      [3, 90],
      [3, 90],
    ]);

    const [copyId] = store.duplicateLayoutObjects(second.id, [state.objectsById[ids[1]]], {
      x: 0.25,
      y: 0.25,
    });
    state = useProjectStore.getState();
    const copiedGroup = state.objectsById[copyId].floorConnectionId;
    expect(copiedGroup).not.toBe(state.objectsById[ids[1]].floorConnectionId);
    expect(
      Object.values(state.objectsById).filter((object) => object.floorConnectionId === copiedGroup),
    ).toHaveLength(3);

    expect(store.setLayoutObjectsLocked([ids[0]], true)).toBe(true);
    expect(store.moveLayoutObjects([ids[1]], { x: 1, y: 0 })).toBe(false);
    expect(store.deleteLayoutObject(ids[2])).toBe(false);
    expect(store.setLayoutObjectsLocked([ids[2]], false)).toBe(true);
    expect(store.deleteLayoutObjects([ids[1]])).toEqual([ids[1]]);
    state = useProjectStore.getState();
    expect(ids.every((id) => state.objectsById[id] === undefined)).toBe(true);
    expect(
      Object.values(state.objectsById).filter((object) => object.floorConnectionId === copiedGroup),
    ).toHaveLength(3);
    expect(undoEditorCommand()).toBe(true);
    expect(ids.every((id) => useProjectStore.getState().objectsById[id] !== undefined)).toBe(true);
    expect(redoEditorCommand()).toBe(true);
    expect(ids.every((id) => useProjectStore.getState().objectsById[id] === undefined)).toBe(true);
  });

  it('connects already placed items on every floor in one undoable toggle', () => {
    const store = useProjectStore.getState();
    const second = store.createFloor(LOCAL_PROJECT_ID)!;
    expect(store.createLayoutObject(LOCAL_FLOOR_ID, 'desk', { x: 2, y: 2 })).toBe(true);
    const originalId = useProjectStore.getState().floorsById[LOCAL_FLOOR_ID].objectIds[0];

    const historyCount = useProjectStore.getState().historyPast.length;
    expect(store.setPaletteItemFloorConnector('desk', true)).toBe(true);
    let state = useProjectStore.getState();
    expect(state.historyPast).toHaveLength(historyCount + 1);
    const copyId = state.floorsById[second.id].objectIds[0];
    expect(state.objectsById[originalId]).toMatchObject({
      x: 1.5,
      y: 1.7,
      fromFloorId: null,
      toFloorId: second.id,
    });
    expect(state.objectsById[copyId]).toMatchObject({
      x: 1.5,
      y: 1.7,
      fromFloorId: LOCAL_FLOOR_ID,
      toFloorId: null,
    });
    expect(state.objectsById[originalId].floorConnectionId).toBe(
      state.objectsById[copyId].floorConnectionId,
    );

    expect(undoEditorCommand()).toBe(true);
    state = useProjectStore.getState();
    expect(Boolean(state.paletteItemsById.desk.floorConnector)).toBe(false);
    expect(state.objectsById[originalId].floorConnectionId).toBeUndefined();
    expect(state.floorsById[second.id].objectIds).toHaveLength(0);
    expect(redoEditorCommand()).toBe(true);
    expect(useProjectStore.getState().objectsById[copyId].floorConnectionId).toBe(
      useProjectStore.getState().objectsById[originalId].floorConnectionId,
    );

    expect(store.createLayoutObject(second.id, 'desk', { x: 4, y: 4 })).toBe(true);
    state = useProjectStore.getState();
    const linked = Object.values(state.objectsById).filter((object) => object.floorConnectionId);
    expect(linked).toHaveLength(4);
    expect(new Set(linked.map((object) => object.floorConnectionId)).size).toBe(2);

    expect(store.setPaletteItemFloorConnector('desk', false)).toBe(true);
    expect(store.createLayoutObject(second.id, 'desk', { x: 6, y: 6 })).toBe(true);
    state = useProjectStore.getState();
    expect(
      Object.values(state.objectsById).filter((object) => object.floorConnectionId),
    ).toHaveLength(4);
    expect(state.floorsById[LOCAL_FLOOR_ID].objectIds).toHaveLength(2);
    expect(state.floorsById[second.id].objectIds).toHaveLength(3);
  });

  it('reuses matching manual placements across floors when connection is enabled', () => {
    const store = useProjectStore.getState();
    const second = store.createFloor(LOCAL_PROJECT_ID)!;
    const third = store.createFloor(LOCAL_PROJECT_ID)!;
    expect(store.createLayoutObject(LOCAL_FLOOR_ID, 'desk', { x: 3, y: 4 })).toBe(true);
    expect(store.createLayoutObject(second.id, 'desk', { x: 3, y: 4 })).toBe(true);
    const before = useProjectStore.getState();
    const firstId = before.floorsById[LOCAL_FLOOR_ID].objectIds[0];
    const secondId = before.floorsById[second.id].objectIds[0];

    expect(store.setPaletteItemFloorConnector('desk', true)).toBe(true);
    const state = useProjectStore.getState();
    const thirdId = state.floorsById[third.id].objectIds[0];
    expect(state.floorsById[LOCAL_FLOOR_ID].objectIds).toEqual([firstId]);
    expect(state.floorsById[second.id].objectIds).toEqual([secondId]);
    expect(state.floorsById[third.id].objectIds).toHaveLength(1);
    expect(
      new Set([firstId, secondId, thirdId].map((id) => state.objectsById[id].floorConnectionId))
        .size,
    ).toBe(1);
    expect(state.objectsById[thirdId]).toMatchObject({ x: 2.5, y: 3.7 });
  });

  it('carries a retroactively connected item into floors added later', () => {
    const store = useProjectStore.getState();
    expect(store.createLayoutObject(LOCAL_FLOOR_ID, 'desk', { x: 3, y: 4 })).toBe(true);
    expect(store.setPaletteItemFloorConnector('desk', true)).toBe(true);
    const firstId = useProjectStore.getState().floorsById[LOCAL_FLOOR_ID].objectIds[0];

    const second = store.createFloor(LOCAL_PROJECT_ID, {
      sourceFloorId: LOCAL_FLOOR_ID,
      copyObjects: true,
    })!;
    const state = useProjectStore.getState();
    expect(state.floorsById[second.id].objectIds).toHaveLength(1);
    const secondObject = state.objectsById[state.floorsById[second.id].objectIds[0]];
    expect(secondObject.floorConnectionId).toBe(state.objectsById[firstId].floorConnectionId);
    expect(secondObject).toMatchObject({ x: 2.5, y: 3.7, fromFloorId: LOCAL_FLOOR_ID });
  });
});
