import { create } from 'zustand';
import type { Viewport } from '../types/layout';

export type EditorTool = 'select' | 'room' | 'pan';

interface EditorState {
  activeProjectId: string | null;
  activeFloorId: string | null;
  selectedObjectIds: string[];
  tool: EditorTool;
  viewport: Viewport;
  setTool: (tool: EditorTool) => void;
  setViewport: (viewport: Viewport) => void;
  resetViewport: () => void;
}

export const DEFAULT_VIEWPORT: Viewport = { x: 0, y: 0, scale: 80 };

/** 화면 조작 상태. 서버에 저장할 프로젝트 데이터와 분리한다. */
export const useEditorStore = create<EditorState>((set) => ({
  activeProjectId: null,
  activeFloorId: null,
  selectedObjectIds: [],
  tool: 'select',
  viewport: DEFAULT_VIEWPORT,
  setTool: (tool) => set({ tool }),
  setViewport: (viewport) => set({ viewport }),
  resetViewport: () => set({ viewport: DEFAULT_VIEWPORT }),
}));
