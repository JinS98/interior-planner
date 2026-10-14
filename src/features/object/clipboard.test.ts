import { describe, expect, it } from 'vitest';
import { useEditorStore } from '../../store/editorStore';
import { LOCAL_FLOOR_ID, useProjectStore } from '../../store/projectStore';
import { copySelectedObjects, deleteSelectedObjects, pasteCopiedObjects } from './clipboard';

describe('object clipboard commands', () => {
  it('copies selected snapshots, pastes with increasing offsets, and deletes only unlocked items', () => {
    const project = useProjectStore.getState();
    expect(project.createLayoutObject(LOCAL_FLOOR_ID, 'desk', { x: 40, y: 40 })).toBe(true);
    expect(project.createLayoutObject(LOCAL_FLOOR_ID, 'chair', { x: 42, y: 40 })).toBe(true);
    const [firstId, secondId] = useProjectStore
      .getState()
      .floorsById[LOCAL_FLOOR_ID].objectIds.slice(-2);
    const originalX = useProjectStore.getState().objectsById[firstId].x;
    useEditorStore.getState().selectObjects([firstId, secondId]);
    expect(copySelectedObjects()).toBe(2);
    expect(project.updateLayoutObject(firstId, { x: 50 })).toBe(true);
    const firstPaste = pasteCopiedObjects();
    expect(firstPaste).toHaveLength(2);
    expect(useProjectStore.getState().objectsById[firstPaste[0]].x).toBeCloseTo(originalX + 0.25);
    expect(useEditorStore.getState().selectedObjectIds).toEqual(firstPaste);
    const secondPaste = pasteCopiedObjects();
    expect(secondPaste).toHaveLength(2);
    expect(useProjectStore.getState().objectsById[secondPaste[0]].x).toBeCloseTo(originalX + 0.5);
    expect(project.setLayoutObjectsLocked([secondPaste[0]], true)).toBe(true);
    expect(deleteSelectedObjects()).toEqual([secondPaste[1]]);
    expect(useEditorStore.getState().selectedObjectIds).toEqual([secondPaste[0]]);
    useEditorStore.getState().selectObjects([]);
    useEditorStore.getState().copyObjects([]);
  });
});
