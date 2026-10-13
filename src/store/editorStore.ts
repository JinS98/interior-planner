import { create } from 'zustand';
import type { LayoutObject, ObjectAppearance, PaletteItem, Point, Viewport } from '../types/layout';
import type { RoomEditError } from '../features/room/edit';
import { defaultObjectAppearance, isValidObjectAppearance } from '../features/object/catalog';
import { LOCAL_FLOOR_ID, LOCAL_PROJECT_ID } from './projectStore';

export type EditorTool = 'select' | 'room' | 'divide' | 'object' | 'pan';

interface EditorState {
  activeProjectId: string | null;
  activeFloorId: string | null;
  selectedObjectIds: string[];
  tool: EditorTool;
  selectedPaletteItemId: string | null;
  objectPlacement: ObjectAppearance;
  objectEditPreview: LayoutObject | null;
  viewport: Viewport;
  roomDraftVertices: Point[];
  divisionDraft: { roomId: string; points: Point[] } | null;
  selectedRoomId: string | null;
  selectedWallIndex: number | null;
  roomEditPreview: { roomId: string; vertices: Point[] } | null;
  geometryError: RoomEditError | null;
  setTool: (tool: EditorTool) => void;
  setPaletteItem: (item: PaletteItem) => void;
  clearPaletteItem: () => void;
  setObjectPlacement: (patch: Partial<ObjectAppearance>) => void;
  selectObject: (objectId: string | null) => void;
  setObjectEditPreview: (preview: LayoutObject | null) => void;
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
  tool: 'select',
  selectedPaletteItemId: null,
  objectPlacement: defaultObjectAppearance('desk'),
  objectEditPreview: null,
  viewport: DEFAULT_VIEWPORT,
  roomDraftVertices: [],
  divisionDraft: null,
  selectedRoomId: null,
  selectedWallIndex: null,
  roomEditPreview: null,
  geometryError: null,
  setTool: (tool) => set((state) => (state.tool === tool ? state : { tool, divisionDraft: null })),
  setPaletteItem: (item) =>
    set({
      selectedPaletteItemId: item.id,
      objectPlacement: {
        width: item.width,
        height: item.height,
        color: item.color,
        shape: item.shape,
      },
      tool: 'object',
      divisionDraft: null,
    }),
  clearPaletteItem: () => set({ selectedPaletteItemId: null }),
  setObjectPlacement: (patch) =>
    set((state) => {
      const objectPlacement = { ...state.objectPlacement, ...patch };
      return isValidObjectAppearance(objectPlacement) ? { objectPlacement } : state;
    }),
  selectObject: (objectId) =>
    set({
      selectedObjectIds: objectId ? [objectId] : [],
      selectedRoomId: null,
      selectedWallIndex: null,
      geometryError: null,
    }),
  setObjectEditPreview: (objectEditPreview) => set({ objectEditPreview }),
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
      geometryError: null,
    }),
  selectWall: (roomId, wallIndex) =>
    set({
      selectedRoomId: roomId,
      selectedWallIndex: wallIndex,
      selectedObjectIds: [],
      geometryError: null,
    }),
  setRoomEditPreview: (preview) => set({ roomEditPreview: preview }),
  setGeometryError: (error) => set({ geometryError: error }),
}));
