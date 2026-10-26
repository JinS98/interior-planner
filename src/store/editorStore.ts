import { create } from 'zustand';
import type { LayoutObject, ObjectAppearance, PaletteItem, Point, Viewport } from '../types/layout';
import type { RoomEditError } from '../features/room/edit';
import { defaultObjectAppearance, isValidObjectAppearance } from '../features/object/catalog';
import { groupMemberIds } from '../features/object/group';
import { LOCAL_FLOOR_ID, LOCAL_PROJECT_ID, useProjectStore } from './projectStore';

export type EditorTool = 'select' | 'room' | 'divide' | 'object' | 'pan';

interface EditorState {
  activeProjectId: string | null;
  activeFloorId: string | null;
  selectedObjectIds: string[];
  editingGroupId: string | null;
  tool: EditorTool;
  selectedPaletteItemId: string | null;
  selectedObjectSetId: string | null;
  objectPlacement: ObjectAppearance;
  objectEditPreview: LayoutObject | null;
  objectMovePreviewById: Record<string, LayoutObject> | null;
  objectClipboard: LayoutObject[];
  clipboardPasteCount: number;
  viewport: Viewport;
  roomDraftVertices: Point[];
  divisionDraft: { roomId: string; points: Point[] } | null;
  selectedRoomId: string | null;
  selectedWallIndex: number | null;
  roomEditPreview: { roomId: string; vertices: Point[] } | null;
  geometryError: RoomEditError | null;
  setActiveFloor: (floorId: string) => boolean;
  openProject: (projectId: string, floorId: string) => void;
  setTool: (tool: EditorTool) => void;
  setPaletteItem: (item: PaletteItem) => void;
  setObjectSet: (setId: string) => void;
  clearPaletteItem: () => void;
  setObjectPlacement: (patch: Partial<ObjectAppearance>) => void;
  selectObject: (objectId: string | null) => void;
  selectObjects: (objectIds: string[]) => void;
  toggleObjectSelection: (objectId: string) => void;
  startGroupInternalEdit: (groupId: string) => void;
  finishGroupInternalEdit: () => void;
  setObjectEditPreview: (preview: LayoutObject | null) => void;
  setObjectMovePreview: (preview: Record<string, LayoutObject> | null) => void;
  copyObjects: (objects: LayoutObject[]) => void;
  advanceClipboardPaste: () => void;
  setViewport: (viewport: Viewport) => void;
  resetViewport: () => void;
  addRoomDraftVertex: (point: Point) => void;
  undoRoomDraftVertex: () => void;
  clearRoomDraft: () => void;
  setDivisionDraft: (draft: { roomId: string; points: Point[] } | null) => void;
  undoDivisionDraftPoint: () => void;
  selectRoom: (roomId: string | null) => void;
  selectWall: (roomId: string, wallIndex: number) => void;
  setRoomEditPreview: (preview: { roomId: string; vertices: Point[] } | null) => void;
  setGeometryError: (error: RoomEditError | null) => void;
}

export const DEFAULT_VIEWPORT: Viewport = { x: 0, y: 0, scale: 80 };

/** 화면 조작 상태. 서버에 저장할 프로젝트 데이터와 분리한다. */
export const useEditorStore = create<EditorState>((set) => ({
  activeProjectId: LOCAL_PROJECT_ID,
  activeFloorId: LOCAL_FLOOR_ID,
  selectedObjectIds: [],
  editingGroupId: null,
  tool: 'select',
  selectedPaletteItemId: null,
  selectedObjectSetId: null,
  objectPlacement: defaultObjectAppearance('desk'),
  objectEditPreview: null,
  objectMovePreviewById: null,
  objectClipboard: [],
  clipboardPasteCount: 0,
  viewport: DEFAULT_VIEWPORT,
  roomDraftVertices: [],
  divisionDraft: null,
  selectedRoomId: null,
  selectedWallIndex: null,
  roomEditPreview: null,
  geometryError: null,
  setActiveFloor: (floorId) => {
    const floor = useProjectStore.getState().floorsById[floorId];
    let switched = false;
    set((state) => {
      if (!floor || floor.projectId !== state.activeProjectId) return state;
      switched = true;
      if (state.activeFloorId === floorId) return state;
      return {
        activeFloorId: floorId,
        selectedObjectIds: [],
        editingGroupId: null,
        selectedRoomId: null,
        selectedWallIndex: null,
        roomDraftVertices: [],
        divisionDraft: null,
        objectEditPreview: null,
        objectMovePreviewById: null,
        roomEditPreview: null,
        objectClipboard: [],
        clipboardPasteCount: 0,
        geometryError: null,
      };
    });
    return switched;
  },
  openProject: (projectId, floorId) =>
    set({
      activeProjectId: projectId,
      activeFloorId: floorId,
      selectedObjectIds: [],
      editingGroupId: null,
      tool: 'select',
      selectedPaletteItemId: null,
      selectedObjectSetId: null,
      objectEditPreview: null,
      objectMovePreviewById: null,
      objectClipboard: [],
      clipboardPasteCount: 0,
      viewport: DEFAULT_VIEWPORT,
      roomDraftVertices: [],
      divisionDraft: null,
      selectedRoomId: null,
      selectedWallIndex: null,
      roomEditPreview: null,
      geometryError: null,
    }),
  setTool: (tool) =>
    set((state) =>
      state.tool === tool
        ? state
        : {
            tool,
            divisionDraft: null,
            editingGroupId: tool === 'select' ? state.editingGroupId : null,
          },
    ),
  setPaletteItem: (item) =>
    set({
      selectedPaletteItemId: item.id,
      selectedObjectSetId: null,
      objectPlacement: {
        width: item.width,
        height: item.height,
        color: item.color,
        shape: item.shape,
      },
      tool: 'object',
      editingGroupId: null,
      divisionDraft: null,
    }),
  setObjectSet: (selectedObjectSetId) =>
    set({
      selectedPaletteItemId: null,
      selectedObjectSetId,
      tool: 'object',
      editingGroupId: null,
      divisionDraft: null,
    }),
  clearPaletteItem: () => set({ selectedPaletteItemId: null, selectedObjectSetId: null }),
  setObjectPlacement: (patch) =>
    set((state) => {
      const objectPlacement = { ...state.objectPlacement, ...patch };
      return isValidObjectAppearance(objectPlacement) ? { objectPlacement } : state;
    }),
  selectObject: (objectId) =>
    set((state) => {
      const project = useProjectStore.getState();
      const object = objectId ? project.objectsById[objectId] : null;
      const groupId = object?.groupId;
      const editingGroupId = groupId === state.editingGroupId ? state.editingGroupId : null;
      const floorObjects = (project.floorsById[state.activeFloorId ?? '']?.objectIds ?? [])
        .map((id) => project.objectsById[id])
        .filter((item) => item != null);
      return {
        selectedObjectIds: objectId
          ? groupId && !editingGroupId
            ? groupMemberIds(floorObjects, groupId)
            : [objectId]
          : [],
        editingGroupId: object ? editingGroupId : null,
        selectedRoomId: null,
        selectedWallIndex: null,
        geometryError: null,
      };
    }),
  selectObjects: (objectIds) =>
    set((state) => {
      const project = useProjectStore.getState();
      const floorObjects = (project.floorsById[state.activeFloorId ?? '']?.objectIds ?? [])
        .map((id) => project.objectsById[id])
        .filter((item) => item != null);
      const expanded = objectIds.flatMap((id) => {
        const object = project.objectsById[id];
        return object?.groupId ? groupMemberIds(floorObjects, object.groupId) : [id];
      });
      return {
        selectedObjectIds: [...new Set(expanded)],
        editingGroupId: null,
        selectedRoomId: null,
        selectedWallIndex: null,
        geometryError: null,
      };
    }),
  toggleObjectSelection: (objectId) =>
    set((state) => {
      const project = useProjectStore.getState();
      const object = project.objectsById[objectId];
      const floorObjects = (project.floorsById[state.activeFloorId ?? '']?.objectIds ?? [])
        .map((id) => project.objectsById[id])
        .filter((item) => item != null);
      const ids =
        object?.groupId && state.editingGroupId !== object.groupId
          ? groupMemberIds(floorObjects, object.groupId)
          : [objectId];
      const current = new Set(state.selectedObjectIds);
      if (ids.every((id) => current.has(id))) ids.forEach((id) => current.delete(id));
      else ids.forEach((id) => current.add(id));
      return {
        selectedObjectIds: [...current],
        selectedRoomId: null,
        selectedWallIndex: null,
        geometryError: null,
      };
    }),
  startGroupInternalEdit: (groupId) =>
    set((state) => {
      const firstId = state.selectedObjectIds.find(
        (id) => useProjectStore.getState().objectsById[id]?.groupId === groupId,
      );
      return firstId ? { editingGroupId: groupId, selectedObjectIds: [firstId] } : state;
    }),
  finishGroupInternalEdit: () =>
    set((state) => {
      const project = useProjectStore.getState();
      const floorObjects = (project.floorsById[state.activeFloorId ?? '']?.objectIds ?? [])
        .map((id) => project.objectsById[id])
        .filter((item) => item != null);
      return {
        selectedObjectIds: state.editingGroupId
          ? groupMemberIds(floorObjects, state.editingGroupId)
          : state.selectedObjectIds,
        editingGroupId: null,
      };
    }),
  setObjectEditPreview: (objectEditPreview) => set({ objectEditPreview }),
  setObjectMovePreview: (objectMovePreviewById) => set({ objectMovePreviewById }),
  copyObjects: (objects) =>
    set({ objectClipboard: objects.map((object) => ({ ...object })), clipboardPasteCount: 0 }),
  advanceClipboardPaste: () =>
    set((state) => ({ clipboardPasteCount: state.clipboardPasteCount + 1 })),
  setViewport: (viewport) => set({ viewport }),
  resetViewport: () => set({ viewport: DEFAULT_VIEWPORT }),
  addRoomDraftVertex: (point) =>
    set((state) => {
      const last = state.roomDraftVertices.at(-1);
      if (last && Math.hypot(last.x - point.x, last.y - point.y) < 0.001) return state;
      return { roomDraftVertices: [...state.roomDraftVertices, point] };
    }),
  undoRoomDraftVertex: () =>
    set((state) =>
      state.roomDraftVertices.length === 0
        ? state
        : { roomDraftVertices: state.roomDraftVertices.slice(0, -1) },
    ),
  clearRoomDraft: () => set({ roomDraftVertices: [] }),
  setDivisionDraft: (divisionDraft) => set({ divisionDraft }),
  undoDivisionDraftPoint: () =>
    set((state) => {
      if (!state.divisionDraft) return state;
      const points = state.divisionDraft.points.slice(0, -1);
      return {
        divisionDraft: points.length ? { ...state.divisionDraft, points } : null,
      };
    }),
  selectRoom: (roomId) =>
    set({
      selectedRoomId: roomId,
      selectedWallIndex: null,
      selectedObjectIds: [],
      editingGroupId: null,
      geometryError: null,
    }),
  selectWall: (roomId, wallIndex) =>
    set({
      selectedRoomId: roomId,
      selectedWallIndex: wallIndex,
      selectedObjectIds: [],
      editingGroupId: null,
      geometryError: null,
    }),
  setRoomEditPreview: (preview) => set({ roomEditPreview: preview }),
  setGeometryError: (error) => set({ geometryError: error }),
}));
