import { create } from 'zustand';
import type { Point, Viewport } from '../types/layout';
import type { RoomEditError } from '../features/room/edit';
import { LOCAL_FLOOR_ID, LOCAL_PROJECT_ID } from './projectStore';

export type EditorTool = 'select' | 'room' | 'divide' | 'pan';

interface EditorState {
  activeProjectId: string | null;
  activeFloorId: string | null;
  selectedObjectIds: string[];
  tool: EditorTool;
  viewport: Viewport;
  roomDraftVertices: Point[];
  divisionDraft: { roomId: string; points: Point[] } | null;
  selectedRoomId: string | null;
  selectedWallIndex: number | null;
  roomEditPreview: { roomId: string; vertices: Point[] } | null;
  geometryError: RoomEditError | null;
  setTool: (tool: EditorTool) => void;
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
  viewport: DEFAULT_VIEWPORT,
  roomDraftVertices: [],
  divisionDraft: null,
  selectedRoomId: null,
  selectedWallIndex: null,
  roomEditPreview: null,
  geometryError: null,
  setTool: (tool) => set((state) => (state.tool === tool ? state : { tool, divisionDraft: null })),
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
    set({ selectedRoomId: roomId, selectedWallIndex: null, geometryError: null }),
  selectWall: (roomId, wallIndex) =>
    set({ selectedRoomId: roomId, selectedWallIndex: wallIndex, geometryError: null }),
  setRoomEditPreview: (preview) => set({ roomEditPreview: preview }),
  setGeometryError: (error) => set({ geometryError: error }),
}));
