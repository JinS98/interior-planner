import { describe, expect, it } from 'vitest';
import { layoutObjectFromPaletteItem } from '../object/catalog';
import { LOCAL_FLOOR_ID, LOCAL_PROJECT_ID, useProjectStore } from '../../store/projectStore';
import { createAutoPlacementPlan, objectsFromAutoPlacements, templateFromPaletteItem } from './plan';

describe('automatic placement preview and apply', () => {
  it('keeps preview ephemeral, applies grouped objects as one command, and rejects a stale preview', () => {
    const store = useProjectStore.getState();
    expect(store.createRoom(LOCAL_FLOOR_ID, [
      { x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 8 }, { x: 0, y: 8 },
    ])).toBe(true);
    const roomId = useProjectStore.getState().floorsById[LOCAL_FLOOR_ID].roomIds.at(-1)!;
    const room = useProjectStore.getState().roomsById[roomId];
    const desk = store.paletteItemsById.desk;
    const template = store.addSetTemplate(LOCAL_PROJECT_ID, '자동 배치 시험', [
      layoutObjectFromPaletteItem('builder', desk, { x: 0, y: 0 }, 'desk'),
      layoutObjectFromPaletteItem('builder', desk, { x: 2, y: 0 }, 'second-desk'),
    ])!;
    const options = {
      gridStepMeters: 1,
      minimumAisleWidthMeters: 0.8,
      wallClearanceMeters: 0,
      maxPlacements: 3,
    };
    const before = useProjectStore.getState();
    const beforeIds = before.floorsById[LOCAL_FLOOR_ID].objectIds;
    const beforeHistory = before.historyPast.length;
    const plan = createAutoPlacementPlan(room, template, [], options);
    expect(plan.error).toBeNull();
    expect(plan.placements).toHaveLength(3);
    const previewObjects = objectsFromAutoPlacements(template, LOCAL_FLOOR_ID, plan.placements, (() => {
      let index = 0;
      return () => `preview-${index++}`;
    })());
    expect(previewObjects).toHaveLength(6);
    expect(useProjectStore.getState().floorsById[LOCAL_FLOOR_ID].objectIds).toEqual(beforeIds);
    expect(useProjectStore.getState().historyPast).toHaveLength(beforeHistory);

    expect(store.applyAutoPlacements(LOCAL_FLOOR_ID, roomId, { kind: 'set', id: template.id }, options, plan.placements)).toBe(true);
    const applied = useProjectStore.getState();
    const ids = applied.floorsById[LOCAL_FLOOR_ID].objectIds.slice(beforeIds.length);
    expect(ids).toHaveLength(6);
    expect(applied.historyPast).toHaveLength(beforeHistory + 1);
    expect(applied.historyPast.at(-1)?.label).toBe('물품 세트 자동 배치');
    const actual = ids.map((id) => applied.objectsById[id]);
    expect(actual.map(({ x, y, rotation, color, groupTemplateId }) => ({ x, y, rotation, color, groupTemplateId })))
      .toEqual(previewObjects.map(({ x, y, rotation, color, groupTemplateId }) => ({ x, y, rotation, color, groupTemplateId })));
    expect(actual[0].groupId).toBe(actual[1].groupId);
    expect(actual[0].groupId).not.toBe(actual[2].groupId);

    expect(store.undo()).toBe(true);
    expect(useProjectStore.getState().floorsById[LOCAL_FLOOR_ID].objectIds).toEqual(beforeIds);
    expect(store.redo()).toBe(true);
    expect(useProjectStore.getState().floorsById[LOCAL_FLOOR_ID].objectIds).toHaveLength(beforeIds.length + 6);
    const historyCount = useProjectStore.getState().historyPast.length;
    expect(store.applyAutoPlacements(LOCAL_FLOOR_ID, roomId, { kind: 'set', id: template.id }, options, plan.placements)).toBe(false);
    expect(useProjectStore.getState().historyPast).toHaveLength(historyCount);
  });

  it('uses an automatic grid for 0m and places a single linked item on every floor', () => {
    const store = useProjectStore.getState();
    expect(store.createRoom(LOCAL_FLOOR_ID, [
      { x: 20, y: 0 }, { x: 26, y: 0 }, { x: 26, y: 6 }, { x: 20, y: 6 },
    ])).toBe(true);
    const roomId = useProjectStore.getState().floorsById[LOCAL_FLOOR_ID].roomIds.at(-1)!;
    const room = useProjectStore.getState().roomsById[roomId];
    const secondFloor = store.createFloor(LOCAL_PROJECT_ID, { sourceFloorId: LOCAL_FLOOR_ID })!;
    const item = store.addPaletteItem(LOCAL_PROJECT_ID, {
      name: '연결 물품', category: 'facility', width: 1, height: 1,
      color: '#123456', shape: 'rectangle', floorConnector: true,
    })!;
    const appearance = { width: 0.8, height: 0.8, color: '#654321', shape: 'circle' as const };
    const template = templateFromPaletteItem(item, appearance);
    const options = { gridStepMeters: 0, minimumAisleWidthMeters: 0.5, wallClearanceMeters: 0, maxPlacements: 2 };
    const existing = useProjectStore.getState().floorsById[LOCAL_FLOOR_ID].objectIds
      .map((id) => useProjectStore.getState().objectsById[id]);
    const plan = createAutoPlacementPlan(room, template, existing, options);
    expect(plan.error).toBeNull();
    expect(plan.effectiveGridStepMeters).toBe(0.1);
    expect(plan.placements).toHaveLength(2);
    const beforeHistory = useProjectStore.getState().historyPast.length;
    const beforeFirst = useProjectStore.getState().floorsById[LOCAL_FLOOR_ID].objectIds.length;
    const beforeSecond = useProjectStore.getState().floorsById[secondFloor.id].objectIds.length;
    expect(store.applyAutoPlacements(LOCAL_FLOOR_ID, roomId, {
      kind: 'item', id: item.id, appearance,
    }, options, plan.placements)).toBe(true);
    const state = useProjectStore.getState();
    expect(state.historyPast).toHaveLength(beforeHistory + 1);
    const first = state.floorsById[LOCAL_FLOOR_ID].objectIds.slice(beforeFirst)
      .map((id) => state.objectsById[id]);
    const second = state.floorsById[secondFloor.id].objectIds.slice(beforeSecond)
      .map((id) => state.objectsById[id]);
    expect(first).toHaveLength(2);
    expect(second).toHaveLength(2);
    expect(first[0]).toMatchObject({ width: 0.8, color: '#654321', shape: 'circle' });
    expect(first.every((object) => !object.groupId)).toBe(true);
    expect(first.map((object) => object.floorConnectionId)).toEqual(second.map((object) => object.floorConnectionId));
    expect(first.map(({ x, y }) => ({ x, y }))).toEqual(second.map(({ x, y }) => ({ x, y })));
    expect(store.undo()).toBe(true);
    expect(useProjectStore.getState().floorsById[LOCAL_FLOOR_ID].objectIds).toHaveLength(beforeFirst);
    expect(useProjectStore.getState().floorsById[secondFloor.id].objectIds).toHaveLength(beforeSecond);
  });
});
