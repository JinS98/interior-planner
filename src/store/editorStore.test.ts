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
