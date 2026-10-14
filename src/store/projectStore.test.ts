import { describe, expect, it } from 'vitest';
import { polygonArea } from '../domain/geometry/coordinates';
import { translateObjectFromScreenDrag } from '../features/object/edit';
import { layoutObjectFromPaletteItem } from '../features/object/catalog';
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

describe('addPaletteItem', () => {
  it('starts with desk and chair and registers a validated custom item for the project', () => {
    const store = useProjectStore.getState();
    const initialIds = store.projectsById[LOCAL_PROJECT_ID].paletteItemIds;
    expect(initialIds.slice(0, 2)).toEqual(['desk', 'chair']);
    const before = initialIds.length;
    const input = {
      name: '  소파  ',
      category: 'furniture' as const,
      width: 2,
      height: 0.8,
      color: '#123456',
      shape: 'rectangle' as const,
    };
    const item = store.addPaletteItem(LOCAL_PROJECT_ID, input);
    expect(item).toMatchObject({
      ...input,
      name: '소파',
      projectId: LOCAL_PROJECT_ID,
      builtIn: false,
    });
    expect(useProjectStore.getState().projectsById[LOCAL_PROJECT_ID].paletteItemIds).toHaveLength(
      before + 1,
    );
    expect(useProjectStore.getState().paletteItemsById[item!.id]).toBe(item);

    expect(store.addPaletteItem(LOCAL_PROJECT_ID, { ...input, name: '  ' })).toBeNull();
    expect(store.addPaletteItem(LOCAL_PROJECT_ID, { ...input, width: 0 })).toBeNull();
    expect(store.addPaletteItem('missing-project', input)).toBeNull();
    expect(useProjectStore.getState().projectsById[LOCAL_PROJECT_ID].paletteItemIds).toHaveLength(
      before + 1,
    );
  });
});

describe('custom object sets', () => {
  it('saves arranged items as an independent template and places an array in one command', () => {
    const store = useProjectStore.getState();
    const palette = store.paletteItemsById;
    const source = [
      {
        ...layoutObjectFromPaletteItem('builder', palette.desk, { x: 0, y: 0 }, 'desk-source'),
        color: '#E48A98',
        rotation: 90,
      },
      layoutObjectFromPaletteItem('builder', palette.chair, { x: 0, y: 1 }, 'chair-source'),
    ];
    const beforeTemplates = store.projectsById[LOCAL_PROJECT_ID].setTemplateIds.length;
    const template = store.addSetTemplate(LOCAL_PROJECT_ID, '  내 좌석  ', source)!;
    expect(template.name).toBe('내 좌석');
    expect(template.members).toHaveLength(2);
    expect(template.members[0]).toMatchObject({ color: '#E48A98', rotation: 90 });
    expect(useProjectStore.getState().projectsById[LOCAL_PROJECT_ID].setTemplateIds).toHaveLength(
      beforeTemplates + 1,
    );
    source[0].width = 4;
    expect(useProjectStore.getState().setTemplatesById[template.id].members[0].width).toBe(1.4);
    const beforeObjects = useProjectStore.getState().floorsById[LOCAL_FLOOR_ID].objectIds;
    const beforeHistory = useProjectStore.getState().historyPast.length;
    const options = { columns: 2, rows: 1, gapX: 0.4, gapY: 0 };
    expect(
      store.createObjectSetArray(
        LOCAL_FLOOR_ID,
        template.id,
        [
          { x: 3, y: 3 },
          { x: 5, y: 3 },
        ],
        options,
      ),
    ).toBe(true);
    expect(useProjectStore.getState().floorsById[LOCAL_FLOOR_ID].objectIds).toHaveLength(
      beforeObjects.length + 4,
    );
    const placedIds = useProjectStore
      .getState()
      .floorsById[LOCAL_FLOOR_ID].objectIds.slice(beforeObjects.length);
    expect(useProjectStore.getState().objectsById[placedIds[0]]).toMatchObject({
      color: '#E48A98',
      rotation: 90,
      width: 1.4,
    });
    const placed = placedIds.map((id) => useProjectStore.getState().objectsById[id]);
    expect(placed[0].groupId).toBe(placed[1].groupId);
    expect(placed[2].groupId).toBe(placed[3].groupId);
    expect(placed[0].groupId).not.toBe(placed[2].groupId);
    expect(placed.every((object) => object.groupTemplateId === template.id)).toBe(true);
    expect(useProjectStore.getState().historyPast).toHaveLength(beforeHistory + 1);
    expect(store.undo()).toBe(true);
    expect(useProjectStore.getState().floorsById[LOCAL_FLOOR_ID].objectIds).toEqual(beforeObjects);
    expect(store.redo()).toBe(true);
    expect(useProjectStore.getState().floorsById[LOCAL_FLOOR_ID].objectIds).toHaveLength(
      beforeObjects.length + 4,
    );
    expect(
      store.createObjectSetArray('missing-floor', template.id, [{ x: 0, y: 0 }], {
        columns: 1,
        rows: 1,
        gapX: 0,
        gapY: 0,
      }),
    ).toBe(false);
    expect(
      store.createObjectSetArray(LOCAL_FLOOR_ID, template.id, [{ x: NaN, y: 0 }], {
        columns: 1,
        rows: 1,
        gapX: 0,
        gapY: 0,
      }),
    ).toBe(false);
    expect(store.addSetTemplate(LOCAL_PROJECT_ID, '', source)).toBeNull();
    expect(store.addSetTemplate(LOCAL_PROJECT_ID, '빈 세트', [])).toBeNull();
  });

  it('moves, rotates, duplicates, and edits a placed group with independent instances', () => {
    const store = useProjectStore.getState();
    const palette = store.paletteItemsById;
    const template = store.addSetTemplate(LOCAL_PROJECT_ID, '그룹 검증', [
      layoutObjectFromPaletteItem('builder', palette.desk, { x: 0, y: 0 }, 'group-desk'),
      layoutObjectFromPaletteItem('builder', palette.chair, { x: 0, y: 1 }, 'group-chair'),
    ])!;
    const before = store.floorsById[LOCAL_FLOOR_ID].objectIds.length;
    expect(store.createObjectSetArray(LOCAL_FLOOR_ID, template.id, [{ x: 4, y: 4 }], {
      columns: 1, rows: 1, gapX: 0, gapY: 0,
    })).toBe(true);
    const ids = useProjectStore.getState().floorsById[LOCAL_FLOOR_ID].objectIds.slice(before);
    const originals = ids.map((id) => useProjectStore.getState().objectsById[id]);
    expect(store.moveLayoutObjects(ids, { x: 1, y: -1 })).toBe(true);
    expect(useProjectStore.getState().objectsById[ids[0]].x).toBeCloseTo(originals[0].x + 1);
    const moved = ids.map((id) => useProjectStore.getState().objectsById[id]);
    const beforeHistory = useProjectStore.getState().historyPast.length;
    expect(store.rotateLayoutObjectGroup(moved[0].groupId!, 90)).toBe(true);
    expect(useProjectStore.getState().historyPast).toHaveLength(beforeHistory + 1);
    const rotated = ids.map((id) => useProjectStore.getState().objectsById[id]);
    expect(rotated[0].rotation).toBe(90);
    expect(rotated[1].rotation).toBe(90);
    expect(
      (rotated[0].y + rotated[0].height / 2) - (rotated[1].y + rotated[1].height / 2),
    ).toBeCloseTo(0);
    expect(store.undo()).toBe(true);
    expect(useProjectStore.getState().objectsById[ids[0]]).toEqual(moved[0]);
    expect(store.redo()).toBe(true);
    const copyIds = store.duplicateLayoutObjects(LOCAL_FLOOR_ID, rotated, { x: 0.25, y: 0.25 });
    const copies = copyIds.map((id) => useProjectStore.getState().objectsById[id]);
    expect(copies).toHaveLength(2);
    expect(copies[0].groupId).toBe(copies[1].groupId);
    expect(copies[0].groupId).not.toBe(rotated[0].groupId);
    expect(store.updateLayoutObject(copyIds[0], { color: '#123456' })).toBe(true);
    expect(useProjectStore.getState().objectsById[copyIds[0]].color).toBe('#123456');
    expect(useProjectStore.getState().objectsById[copyIds[1]].color).not.toBe('#123456');
    expect(useProjectStore.getState().objectsById[ids[0]].color).not.toBe('#123456');
  });
});

describe('createLayoutObject', () => {
  it('places default and custom items by their center in the current floor', () => {
    const store = useProjectStore.getState();
    const pc = store.addPaletteItem(LOCAL_PROJECT_ID, {
      name: 'PC',
      category: 'electronics',
      width: 0.6,
      height: 0.5,
      color: '#8494AD',
      shape: 'rectangle',
    })!;
    const before = store.floorsById[LOCAL_FLOOR_ID].objectIds.length;
    expect(store.createLayoutObject(LOCAL_FLOOR_ID, 'desk', { x: 3, y: 2 })).toBe(true);
    expect(store.createLayoutObject(LOCAL_FLOOR_ID, 'chair', { x: 5, y: 2 })).toBe(true);
    expect(store.createLayoutObject(LOCAL_FLOOR_ID, pc.id, { x: 7, y: 2 })).toBe(true);

    const state = useProjectStore.getState();
    const ids = state.floorsById[LOCAL_FLOOR_ID].objectIds.slice(before);
    expect(ids).toHaveLength(3);
    expect(ids.map((id) => state.objectsById[id])).toMatchObject([
      { type: 'desk', category: 'furniture', x: 2.3, y: 1.65, width: 1.4, height: 0.7 },
      { type: 'chair', category: 'furniture', x: 4.7, y: 1.7, width: 0.6, height: 0.6 },
      {
        type: pc.id,
        name: 'PC',
        category: 'electronics',
        x: 6.7,
        y: 1.75,
        width: 0.6,
        height: 0.5,
      },
    ]);
    expect(ids.every((id) => state.objectsById[id].floorId === LOCAL_FLOOR_ID)).toBe(true);
  });

  it('rejects missing floors and invalid coordinates without adding an object', () => {
    const store = useProjectStore.getState();
    const before = store.floorsById[LOCAL_FLOOR_ID].objectIds.length;
    expect(store.createLayoutObject('missing-floor', 'desk', { x: 0, y: 0 })).toBe(false);
    expect(store.createLayoutObject(LOCAL_FLOOR_ID, 'desk', { x: Number.NaN, y: 0 })).toBe(false);
    expect(store.createLayoutObject(LOCAL_FLOOR_ID, 'missing-item', { x: 0, y: 0 })).toBe(false);
    expect(useProjectStore.getState().floorsById[LOCAL_FLOOR_ID].objectIds).toHaveLength(before);
  });

  it('stores custom size, color, and shape and validates later edits', () => {
    const store = useProjectStore.getState();
    const appearance = { width: 1.2, height: 0.8, color: '#E48A98', shape: 'triangle' as const };
    expect(store.createLayoutObject(LOCAL_FLOOR_ID, 'desk', { x: 5, y: 4 }, appearance)).toBe(true);
    const state = useProjectStore.getState();
    const objectId = state.floorsById[LOCAL_FLOOR_ID].objectIds.at(-1)!;
    expect(state.objectsById[objectId]).toMatchObject({ ...appearance, x: 4.4, y: 3.6 });

    expect(
      store.updateLayoutObject(objectId, { width: 0.4, color: '#123456', shape: 'circle' }),
    ).toBe(true);
    expect(useProjectStore.getState().objectsById[objectId]).toMatchObject({
      width: 0.4,
      height: 0.8,
      color: '#123456',
      shape: 'circle',
    });
    expect(store.updateLayoutObject(objectId, { width: 0 })).toBe(false);
    expect(store.updateLayoutObject(objectId, { color: 'red' })).toBe(false);
    expect(useProjectStore.getState().objectsById[objectId].width).toBe(0.4);
    expect(store.updateLayoutObject('missing-object', { width: 1 })).toBe(false);
  });
});

describe('editing and deleting a placed object', () => {
  it('records a completed screen drag as meter coordinates in the project', () => {
    const store = useProjectStore.getState();
    expect(store.createLayoutObject(LOCAL_FLOOR_ID, 'desk', { x: 4, y: 3 })).toBe(true);
    const id = useProjectStore.getState().floorsById[LOCAL_FLOOR_ID].objectIds.at(-1)!;
    const original = useProjectStore.getState().objectsById[id];
    const candidate = translateObjectFromScreenDrag(
      original,
      { x: 120, y: 100 },
      { x: 200, y: 140 },
      { x: 350, y: -80, scale: 80 },
    );
    expect(store.updateLayoutObject(id, { x: candidate.x, y: candidate.y })).toBe(true);
    expect(useProjectStore.getState().objectsById[id]).toMatchObject({
      x: original.x + 1,
      y: original.y + 0.5,
      width: original.width,
      height: original.height,
    });
  });

  it('updates inspector coordinates and dimensions together, including negative coordinates', () => {
    const store = useProjectStore.getState();
    expect(store.createLayoutObject(LOCAL_FLOOR_ID, 'chair', { x: 2, y: 2 })).toBe(true);
    const id = useProjectStore.getState().floorsById[LOCAL_FLOOR_ID].objectIds.at(-1)!;
    expect(store.updateLayoutObject(id, { x: -1.25, y: 2.5, width: 1.2, height: 0.9 })).toBe(true);
    expect(useProjectStore.getState().objectsById[id]).toMatchObject({
      x: -1.25,
      y: 2.5,
      width: 1.2,
      height: 0.9,
    });
    expect(store.updateLayoutObject(id, { x: 5, width: 0 })).toBe(false);
    expect(useProjectStore.getState().objectsById[id]).toMatchObject({ x: -1.25, width: 1.2 });
  });

  it('saves movement and rotation, then removes the object from both the floor and map', () => {
    const store = useProjectStore.getState();
    expect(store.createLayoutObject(LOCAL_FLOOR_ID, 'desk', { x: 8, y: 8 })).toBe(true);
    const id = useProjectStore.getState().floorsById[LOCAL_FLOOR_ID].objectIds.at(-1)!;
    expect(store.updateLayoutObject(id, { x: 9, y: 7, rotation: 450 })).toBe(true);
    expect(useProjectStore.getState().objectsById[id]).toMatchObject({ x: 9, y: 7, rotation: 90 });
    expect(store.updateLayoutObject(id, { x: Number.NaN })).toBe(false);
    expect(store.updateLayoutObject(id, { rotation: Number.POSITIVE_INFINITY })).toBe(false);
    expect(store.deleteLayoutObject(id)).toBe(true);
    expect(useProjectStore.getState().objectsById[id]).toBeUndefined();
    expect(useProjectStore.getState().floorsById[LOCAL_FLOOR_ID].objectIds).not.toContain(id);
    expect(store.deleteLayoutObject(id)).toBe(false);
  });
});

describe('moveLayoutObjects', () => {
  it('moves selected objects together and rejects a partial move', () => {
    const store = useProjectStore.getState();
    expect(store.createLayoutObject(LOCAL_FLOOR_ID, 'desk', { x: 10, y: 10 })).toBe(true);
    expect(store.createLayoutObject(LOCAL_FLOOR_ID, 'chair', { x: 12, y: 10 })).toBe(true);
    const ids = useProjectStore.getState().floorsById[LOCAL_FLOOR_ID].objectIds.slice(-2);
    const before = ids.map((id) => useProjectStore.getState().objectsById[id]);
    expect(store.moveLayoutObjects(ids, { x: 1.5, y: -0.25 })).toBe(true);
    const after = ids.map((id) => useProjectStore.getState().objectsById[id]);
    expect(after[0].x).toBeCloseTo(before[0].x + 1.5);
    expect(after[1].x).toBeCloseTo(before[1].x + 1.5);
    expect(after[0].y).toBeCloseTo(before[0].y - 0.25);
    expect(after[1].x - after[0].x).toBeCloseTo(before[1].x - before[0].x);
    expect(store.moveLayoutObjects([ids[0], 'missing-object'], { x: 2, y: 0 })).toBe(false);
    expect(store.moveLayoutObjects(ids, { x: Number.NaN, y: 0 })).toBe(false);
    expect(useProjectStore.getState().objectsById[ids[0]].x).toBe(after[0].x);
    expect(useProjectStore.getState().objectsById[ids[1]].x).toBe(after[1].x);
    expect(store.moveLayoutObjects(ids, { x: Number.MAX_VALUE, y: 0 })).toBe(true);
    expect(store.moveLayoutObjects(ids, { x: Number.MAX_VALUE, y: 0 })).toBe(false);
    expect(useProjectStore.getState().objectsById[ids[0]].x).toBe(Number.MAX_VALUE);
    expect(useProjectStore.getState().objectsById[ids[1]].x).toBe(Number.MAX_VALUE);
  });
});

describe('locked layout objects and batch commands', () => {
  it('blocks editing a locked object and removes only unlocked objects from a mixed selection', () => {
    const store = useProjectStore.getState();
    expect(store.createLayoutObject(LOCAL_FLOOR_ID, 'desk', { x: 20, y: 20 })).toBe(true);
    expect(store.createLayoutObject(LOCAL_FLOOR_ID, 'chair', { x: 22, y: 20 })).toBe(true);
    const [lockedId, freeId] = useProjectStore
      .getState()
      .floorsById[LOCAL_FLOOR_ID].objectIds.slice(-2);
    const before = useProjectStore.getState().objectsById[lockedId];
    expect(store.setLayoutObjectsLocked([lockedId], true)).toBe(true);
    expect(store.updateLayoutObject(lockedId, { x: 100 })).toBe(false);
    expect(store.moveLayoutObjects([lockedId], { x: 1, y: 1 })).toBe(false);
    expect(store.deleteLayoutObject(lockedId)).toBe(false);
    expect(store.deleteLayoutObjects([lockedId, freeId])).toEqual([freeId]);
    expect(useProjectStore.getState().objectsById[lockedId]).toMatchObject({
      x: before.x,
      y: before.y,
      locked: true,
    });
    expect(useProjectStore.getState().objectsById[freeId]).toBeUndefined();
    expect(store.setLayoutObjectsLocked([lockedId], false)).toBe(true);
    expect(store.updateLayoutObject(lockedId, { x: 21 })).toBe(true);
  });

  it('duplicates a copied snapshot with new IDs, preserved appearance, and unlocked state', () => {
    const store = useProjectStore.getState();
    expect(store.createLayoutObject(LOCAL_FLOOR_ID, 'desk', { x: 30, y: 30 })).toBe(true);
    const sourceId = useProjectStore.getState().floorsById[LOCAL_FLOOR_ID].objectIds.at(-1)!;
    expect(store.updateLayoutObject(sourceId, { color: '#123456', rotation: 45 })).toBe(true);
    expect(store.setLayoutObjectsLocked([sourceId], true)).toBe(true);
    const source = useProjectStore.getState().objectsById[sourceId];
    const [copyId] = store.duplicateLayoutObjects(LOCAL_FLOOR_ID, [source], { x: 0.25, y: 0.25 });
    expect(copyId).not.toBe(sourceId);
    expect(useProjectStore.getState().objectsById[copyId]).toMatchObject({
      x: source.x + 0.25,
      y: source.y + 0.25,
      width: source.width,
      color: '#123456',
      rotation: 45,
      locked: false,
    });
    expect(store.duplicateLayoutObjects(LOCAL_FLOOR_ID, [source], { x: Infinity, y: 0 })).toEqual(
      [],
    );
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
