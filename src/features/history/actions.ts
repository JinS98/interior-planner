import { useEditorStore } from '../../store/editorStore';
import { useProjectStore } from '../../store/projectStore';

function reconcileSelection() {
  const project = useProjectStore.getState();
  const editor = useEditorStore.getState();
  const objectIds = editor.selectedObjectIds.filter(
    (id) => project.objectsById[id]?.floorId === editor.activeFloorId,
  );
  const room = editor.selectedRoomId ? project.roomsById[editor.selectedRoomId] : null;
  const selectedRoomId = room?.floorId === editor.activeFloorId ? room.id : null;
  useEditorStore.setState({
    selectedObjectIds: objectIds,
    selectedRoomId,
    selectedWallIndex:
      room &&
      selectedRoomId &&
      editor.selectedWallIndex !== null &&
      editor.selectedWallIndex < room.vertices.length
        ? editor.selectedWallIndex
        : null,
    objectEditPreview: null,
    objectMovePreviewById: null,
    roomEditPreview: null,
    divisionDraft: null,
    geometryError: null,
  });
}

export function undoEditorCommand(): boolean {
  if (!useProjectStore.getState().undo()) return false;
  reconcileSelection();
  return true;
}

export function redoEditorCommand(): boolean {
  if (!useProjectStore.getState().redo()) return false;
  reconcileSelection();
  return true;
}
