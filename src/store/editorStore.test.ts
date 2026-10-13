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

describe('selecting a furniture preset', () => {
  it('returns to an unselected object tool state without changing tools or objects', () => {
    const store = useEditorStore.getState();
    const before = useProjectStore.getState().objectsById;
    store.clearPaletteItem();
    store.setTool('object');
    expect(useEditorStore.getState().selectedPaletteItemId).toBeNull();
    store.setPaletteItem(useProjectStore.getState().paletteItemsById.desk);
    expect(useEditorStore.getState().selectedPaletteItemId).toBe('desk');
    store.clearPaletteItem();
    expect(useEditorStore.getState()).toMatchObject({
      tool: 'object',
      selectedPaletteItemId: null,
    });
    expect(useProjectStore.getState().objectsById).toBe(before);
    store.setTool('select');
  });

  it('activates placement without modifying completed project objects', () => {
    const before = useProjectStore.getState().objectsById;
    const item = useProjectStore.getState().paletteItemsById.chair;
    useEditorStore.getState().setPaletteItem(item);
    expect(useEditorStore.getState()).toMatchObject({
      tool: 'object',
      selectedPaletteItemId: 'chair',
    });
    expect(useProjectStore.getState().objectsById).toBe(before);
    useEditorStore.getState().setTool('select');
  });

  it('keeps custom placement options until another preset is chosen', () => {
    const store = useEditorStore.getState();
    store.setPaletteItem(useProjectStore.getState().paletteItemsById.desk);
    store.setObjectPlacement({ width: 2, color: '#123456', shape: 'triangle' });
    expect(useEditorStore.getState().objectPlacement).toMatchObject({
      width: 2,
      color: '#123456',
      shape: 'triangle',
    });
    store.setObjectPlacement({ width: 0 });
    expect(useEditorStore.getState().objectPlacement.width).toBe(2);
    store.setPaletteItem(useProjectStore.getState().paletteItemsById.chair);
    expect(useEditorStore.getState().objectPlacement).toMatchObject({
      width: 0.6,
      height: 0.6,
      shape: 'circle',
    });
    store.setTool('select');
  });
});
