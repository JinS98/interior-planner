import { create } from 'zustand';
import type { Point, Viewport } from '../types/layout';
import { LOCAL_FLOOR_ID, LOCAL_PROJECT_ID } from './projectStore';

export type EditorTool = 'select' | 'room' | 'pan';

interface EditorState {
  activeProjectId: string | null;
  activeFloorId: string | null;
  selectedObjectIds: string[];
  tool: EditorTool;
  viewport: Viewport;
  roomDraftVertices: Point[];
  setTool: (tool: EditorTool) => void;
  setViewport: (viewport: Viewport) => void;
  resetViewport: () => void;
  addRoomDraftVertex: (point: Point) => void;
  clearRoomDraft: () => void;
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
  setTool: (tool) => set({ tool }),
  setViewport: (viewport) => set({ viewport }),
  resetViewport: () => set({ viewport: DEFAULT_VIEWPORT }),
  addRoomDraftVertex: (point) =>
    set((state) => {
      const last = state.roomDraftVertices.at(-1);
      if (last && Math.hypot(last.x - point.x, last.y - point.y) < 0.001) return state;
      return { roomDraftVertices: [...state.roomDraftVertices, point] };
    }),
  clearRoomDraft: () => set({ roomDraftVertices: [] }),
}));
