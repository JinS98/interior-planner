import { useEditorStore } from '../../store/editorStore';
import { useProjectStore } from '../../store/projectStore';

/** 에디터 안의 물품 속성을 복사한다. 브라우저의 텍스트 클립보드는 건드리지 않는다. */
export function copySelectedObjects(): number {
  const editor = useEditorStore.getState();
  const { objectsById } = useProjectStore.getState();
  const objects = editor.selectedObjectIds
    .map((id) => objectsById[id])
    .filter((object) => object && object.floorId === editor.activeFloorId);
  if (objects.length === 0) return 0;
  editor.copyObjects(objects);
  return objects.length;
}

export function pasteCopiedObjects(): string[] {
  const editor = useEditorStore.getState();
  if (!editor.activeFloorId || editor.objectClipboard.length === 0) return [];
  const distance = (editor.clipboardPasteCount + 1) * 0.25;
  const ids = useProjectStore
    .getState()
    .duplicateLayoutObjects(editor.activeFloorId, editor.objectClipboard, {
      x: distance,
      y: distance,
    });
  if (ids.length === 0) return [];
  editor.advanceClipboardPaste();
  editor.setTool('select');
  editor.selectObjects(ids);
  return ids;
}

export function deleteSelectedObjects(): string[] {
  const editor = useEditorStore.getState();
  const ids = useProjectStore.getState().deleteLayoutObjects(editor.selectedObjectIds);
  if (ids.length > 0) {
    const deleted = new Set(ids);
    editor.selectObjects(editor.selectedObjectIds.filter((id) => !deleted.has(id)));
  }
  return ids;
}
