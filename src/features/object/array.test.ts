import { beforeEach, describe, expect, it } from 'vitest';
import { projectSnapshot } from '../history/command';
import { LOCAL_FLOOR_ID, LOCAL_PROJECT_ID, useProjectStore } from '../../store/projectStore';
import { isValidObjectArray, objectArrayCenters, objectArrayFootprint } from './array';

const initialData = projectSnapshot(useProjectStore.getState());
beforeEach(() => useProjectStore.getState().replaceProjectData(initialData));

describe('object array placement', () => {
  it('centers a 2 by 3 array with visible edge gaps', () => {
    const appearance = { width: 1.4, height: 0.6 };
    const options = { columns: 2, rows: 3, gapX: 0.4, gapY: 0.2 };
    const footprint = objectArrayFootprint(appearance, options);
    expect(footprint.width).toBeCloseTo(3.2);
    expect(footprint.height).toBeCloseTo(2.2);
    const centers = objectArrayCenters({ x: 5, y: 5 }, appearance, options);
    expect(centers).toHaveLength(6);
    expect(centers[0].x).toBeCloseTo(4.1);
    expect(centers[0].y).toBeCloseTo(4.2);
    expect(centers[1].x - centers[0].x).toBeCloseTo(1.8);
    expect(centers[2].y - centers[0].y).toBeCloseTo(0.8);
  });

  it('limits an array to 100 objects and nonnegative gaps', () => {
    expect(isValidObjectArray({ columns: 10, rows: 10, gapX: 0, gapY: 0 })).toBe(true);
    expect(isValidObjectArray({ columns: 11, rows: 10, gapX: 0, gapY: 0 })).toBe(false);
    expect(isValidObjectArray({ columns: 2, rows: 2, gapX: -1, gapY: 0 })).toBe(false);
  });

  it('places a whole array in one undoable command, including linked floors', () => {
    const store = useProjectStore.getState();
    const second = store.createFloor(LOCAL_PROJECT_ID)!;
    expect(store.setPaletteItemFloorConnector('chair', true)).toBe(true);
    const options = { columns: 2, rows: 2, gapX: 0.5, gapY: 0.5 };
    const appearance = useProjectStore.getState().paletteItemsById.chair;
    const centers = objectArrayCenters({ x: 3, y: 3 }, appearance, options);
    const historyCount = useProjectStore.getState().historyPast.length;
    expect(
      store.createLayoutObjectArray(LOCAL_FLOOR_ID, 'chair', centers, appearance, options),
    ).toBe(true);
    let state = useProjectStore.getState();
    expect(state.historyPast).toHaveLength(historyCount + 1);
    expect(state.floorsById[LOCAL_FLOOR_ID].objectIds).toHaveLength(4);
    expect(state.floorsById[second.id].objectIds).toHaveLength(4);
    expect(
      new Set(Object.values(state.objectsById).map((object) => object.floorConnectionId)).size,
    ).toBe(4);
    expect(store.undo()).toBe(true);
    state = useProjectStore.getState();
    expect(state.floorsById[LOCAL_FLOOR_ID].objectIds).toHaveLength(0);
    expect(state.floorsById[second.id].objectIds).toHaveLength(0);
    expect(store.redo()).toBe(true);
    expect(useProjectStore.getState().floorsById[second.id].objectIds).toHaveLength(4);
  });
});
