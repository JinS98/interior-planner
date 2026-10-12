import { describe, expect, it } from 'vitest';
import { LOCAL_FLOOR_ID, useProjectStore } from './projectStore';
import { useEditorStore } from './editorStore';

describe('clearRoomDraft', () => {
  it('removes only the incomplete drawing and keeps completed rooms', () => {
    const completedVertices = [
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 2 },
    ];
    expect(useProjectStore.getState().createRoom(LOCAL_FLOOR_ID, completedVertices)).toBe(true);
    const completedRoomIds = [...useProjectStore.getState().floorsById[LOCAL_FLOOR_ID].roomIds];

    useEditorStore.getState().addRoomDraftVertex({ x: 5, y: 5 });
    useEditorStore.getState().addRoomDraftVertex({ x: 6, y: 5 });
    useEditorStore.getState().clearRoomDraft();

    expect(useEditorStore.getState().roomDraftVertices).toEqual([]);
    expect(useProjectStore.getState().floorsById[LOCAL_FLOOR_ID].roomIds).toEqual(completedRoomIds);
  });
});

describe('undoing draft clicks', () => {
  it('removes one room vertex or division point at a time', () => {
    const store = useEditorStore.getState();
    store.clearRoomDraft();
    store.addRoomDraftVertex({ x: 0, y: 0 });
    store.addRoomDraftVertex({ x: 2, y: 0 });
    store.addRoomDraftVertex({ x: 2, y: 2 });
    store.undoRoomDraftVertex();
    expect(useEditorStore.getState().roomDraftVertices).toEqual([
      { x: 0, y: 0 },
      { x: 2, y: 0 },
    ]);
    store.undoRoomDraftVertex();
    expect(useEditorStore.getState().roomDraftVertices).toEqual([{ x: 0, y: 0 }]);
    store.undoRoomDraftVertex();
    expect(useEditorStore.getState().roomDraftVertices).toEqual([]);

    store.setDivisionDraft({
      roomId: 'room-1',
      points: [
        { x: 2, y: 0 },
        { x: 2, y: 1 },
        { x: 1, y: 1 },
      ],
    });
    store.undoDivisionDraftPoint();
    expect(useEditorStore.getState().divisionDraft?.points).toEqual([
      { x: 2, y: 0 },
      { x: 2, y: 1 },
    ]);
    store.undoDivisionDraftPoint();
    expect(useEditorStore.getState().divisionDraft?.points).toEqual([{ x: 2, y: 0 }]);
    store.undoDivisionDraftPoint();
    expect(useEditorStore.getState().divisionDraft).toBeNull();
  });
});
