import { describe, expect, it } from 'vitest';
import { useEditorStore } from '../../store/editorStore';
import { LOCAL_FLOOR_ID, LOCAL_PROJECT_ID, useProjectStore } from '../../store/projectStore';
import { redoEditorCommand, undoEditorCommand } from './actions';

describe('project edit commands', () => {
  it('records one command for a group drag and restores both objects together', () => {
    const store = useProjectStore.getState();
    expect(store.createLayoutObject(LOCAL_FLOOR_ID, 'desk', { x: 1, y: 1 })).toBe(true);
    expect(store.createLayoutObject(LOCAL_FLOOR_ID, 'chair', { x: 3, y: 1 })).toBe(true);
    const ids = useProjectStore.getState().floorsById[LOCAL_FLOOR_ID].objectIds.slice(-2);
    const before = ids.map((id) => useProjectStore.getState().objectsById[id]);
    const historyLength = useProjectStore.getState().historyPast.length;
    useEditorStore.getState().setObjectMovePreview({
      [ids[0]]: { ...before[0], x: before[0].x + 2 },
    });
    expect(useProjectStore.getState().historyPast).toHaveLength(historyLength);
    expect(store.moveLayoutObjects(ids, { x: 2, y: -0.5 })).toBe(true);
    expect(useProjectStore.getState().historyPast).toHaveLength(historyLength + 1);
    expect(useProjectStore.getState().historyPast.at(-1)?.label).toBe('물품 이동');
    expect(undoEditorCommand()).toBe(true);
    expect(ids.map((id) => useProjectStore.getState().objectsById[id])).toEqual(before);
    expect(useEditorStore.getState().objectMovePreviewById).toBeNull();
    expect(redoEditorCommand()).toBe(true);
    expect(ids.map((id) => useProjectStore.getState().objectsById[id].x)).toEqual(
      before.map((object) => object.x + 2),
    );
  });

  it('undoes and redoes a room split as one command, including the floor room list', () => {
    const store = useProjectStore.getState();
    expect(
      store.createRoom(LOCAL_FLOOR_ID, [
        { x: 100, y: 100 },
        { x: 104, y: 100 },
        { x: 104, y: 102 },
        { x: 100, y: 102 },
      ]),
    ).toBe(true);
    const roomId = useProjectStore.getState().floorsById[LOCAL_FLOOR_ID].roomIds.at(-1)!;
    const before = useProjectStore.getState().roomsById[roomId];
    const count = useProjectStore.getState().floorsById[LOCAL_FLOOR_ID].roomIds.length;
    const historyLength = useProjectStore.getState().historyPast.length;
    expect(
      store.splitRoom(roomId, [
        { x: 102, y: 100 },
        { x: 102, y: 102 },
      ]),
    ).toBe(true);
    const splitIds = useProjectStore.getState().floorsById[LOCAL_FLOOR_ID].roomIds;
    const addedId = splitIds.at(-1)!;
    expect(splitIds).toHaveLength(count + 1);
    expect(useProjectStore.getState().historyPast).toHaveLength(historyLength + 1);
    expect(store.undo()).toBe(true);
    expect(useProjectStore.getState().floorsById[LOCAL_FLOOR_ID].roomIds).toHaveLength(count);
    expect(useProjectStore.getState().roomsById[roomId]).toEqual(before);
    expect(useProjectStore.getState().roomsById[addedId]).toBeUndefined();
    expect(store.redo()).toBe(true);
    expect(useProjectStore.getState().floorsById[LOCAL_FLOOR_ID].roomIds).toContain(addedId);
  });

  it('keeps a vertex drag preview out of history and records its final shape once', () => {
    const store = useProjectStore.getState();
    expect(
      store.createRoom(LOCAL_FLOOR_ID, [
        { x: 200, y: 200 },
        { x: 204, y: 200 },
        { x: 204, y: 203 },
        { x: 200, y: 203 },
      ]),
    ).toBe(true);
    const roomId = useProjectStore.getState().floorsById[LOCAL_FLOOR_ID].roomIds.at(-1)!;
    const original = useProjectStore.getState().roomsById[roomId].vertices;
    const moved = original.map((point, index) => (index === 1 ? { x: 205, y: 200 } : point));
    const historyLength = useProjectStore.getState().historyPast.length;
    useEditorStore.getState().setRoomEditPreview({ roomId, vertices: moved });
    expect(useProjectStore.getState().historyPast).toHaveLength(historyLength);
    expect(store.updateRoomVertices(roomId, moved)).toBeNull();
    expect(useProjectStore.getState().historyPast).toHaveLength(historyLength + 1);
    expect(undoEditorCommand()).toBe(true);
    expect(useProjectStore.getState().roomsById[roomId].vertices).toEqual(original);
    expect(useEditorStore.getState().roomEditPreview).toBeNull();
    expect(redoEditorCommand()).toBe(true);
    expect(useProjectStore.getState().roomsById[roomId].vertices).toEqual(moved);
  });

  it('skips unchanged edits and clears the redo branch after a new edit', () => {
    const store = useProjectStore.getState();
    const target = useProjectStore.getState().projectsById[LOCAL_PROJECT_ID].targetAreaSqm;
    const before = useProjectStore.getState().historyPast.length;
    store.setTargetAreaSqm(LOCAL_PROJECT_ID, target);
    expect(useProjectStore.getState().historyPast).toHaveLength(before);
    store.setTargetAreaSqm(LOCAL_PROJECT_ID, 60);
    expect(useProjectStore.getState().historyPast).toHaveLength(before + 1);
    expect(store.undo()).toBe(true);
    expect(useProjectStore.getState().historyFuture).toHaveLength(1);
    store.setTargetAreaSqm(LOCAL_PROJECT_ID, target);
    expect(useProjectStore.getState().historyFuture).toHaveLength(1);
    store.setTargetAreaSqm(LOCAL_PROJECT_ID, 80);
    expect(useProjectStore.getState().historyFuture).toHaveLength(0);
    expect(store.redo()).toBe(false);
  });

  it('clears selection when undo removes the selected object', () => {
    const store = useProjectStore.getState();
    expect(store.createLayoutObject(LOCAL_FLOOR_ID, 'desk', { x: 10, y: 10 })).toBe(true);
    const id = useProjectStore.getState().floorsById[LOCAL_FLOOR_ID].objectIds.at(-1)!;
    expect(id).not.toBe('desk');
    useEditorStore.getState().selectObject(id);
    expect(undoEditorCommand()).toBe(true);
    expect(useProjectStore.getState().objectsById[id]).toBeUndefined();
    expect(useEditorStore.getState().selectedObjectIds).toEqual([]);
  });
});
