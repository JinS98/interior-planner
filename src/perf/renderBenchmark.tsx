import { Profiler, type ProfilerOnRenderCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { EditorCanvas } from '../components/editor/EditorCanvas';
import { DEFAULT_OBJECT_ARRAY } from '../features/object/array';
import { LOCAL_FLOOR_ID, LOCAL_PROJECT_ID, useProjectStore } from '../store/projectStore';
import { useEditorStore } from '../store/editorStore';
import type { LayoutObject, Room } from '../types/layout';

interface RenderRecord {
  phase: string;
  durationMs: number;
  commitTime: number;
}

declare global {
  interface Window {
    renderBenchmark: {
      records: RenderRecord[];
      moveViewport: () => Promise<{ durationMs: number; commitMs: number }>;
      movePointer: (x: number, y: number) => Promise<{ durationMs: number; commitMs: number }>;
      objectCount: () => number;
    };
  }
}

const count = Number(new URLSearchParams(location.search).get('count'));
if (![100, 500, 1000].includes(count)) throw new Error('Use count=100, 500 or 1000');

const room: Room = {
  id: 'benchmark-room',
  floorId: LOCAL_FLOOR_ID,
  name: 'Benchmark room',
  vertices: [
    { x: 0, y: 0 },
    { x: 60, y: 0 },
    { x: 60, y: 25 },
    { x: 0, y: 25 },
  ],
};
const objects = Array.from({ length: count }, (_, index): LayoutObject => ({
  id: `benchmark-object-${index}`,
  floorId: LOCAL_FLOOR_ID,
  category: 'furniture',
  type: 'desk',
  name: 'Desk',
  x: 1 + (index % 50) * 1.1,
  y: 1 + Math.floor(index / 50) * 1.1,
  width: 0.8,
  height: 0.6,
  color: '#d5a56d',
  shape: 'rectangle',
  rotation: 0,
  locked: false,
}));

const projectState = useProjectStore.getState();
useProjectStore.getState().replaceProjectData({
  projectsById: projectState.projectsById,
  floorsById: {
    [LOCAL_FLOOR_ID]: {
      ...projectState.floorsById[LOCAL_FLOOR_ID],
      roomIds: [room.id],
      objectIds: objects.map((object) => object.id),
    },
  },
  roomsById: { [room.id]: room },
  objectsById: Object.fromEntries(objects.map((object) => [object.id, object])),
  paletteItemsById: projectState.paletteItemsById,
  setTemplatesById: projectState.setTemplatesById,
});
useEditorStore.setState({
  activeProjectId: LOCAL_PROJECT_ID,
  activeFloorId: LOCAL_FLOOR_ID,
  tool: 'pan',
  viewport: { x: 0, y: 0, scale: 20 },
});

const records: RenderRecord[] = [];
const onRender: ProfilerOnRenderCallback = (
  _id,
  phase,
  actualDuration,
  _baseDuration,
  _startTime,
  commitTime,
) => {
  records.push({ phase, durationMs: actualDuration, commitTime });
};

async function afterNextCommit(trigger: () => void) {
  const previousCount = records.length;
  const start = performance.now();
  trigger();
  while (records.length === previousCount) {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    if (performance.now() - start > 5000) throw new Error('Render timed out');
  }
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  return { durationMs: performance.now() - start, commitMs: records.at(-1)!.durationMs };
}

window.renderBenchmark = {
  records,
  objectCount: () => document.querySelectorAll('g[data-type="desk"]').length,
  moveViewport: () =>
    afterNextCommit(() => {
      const state = useEditorStore.getState();
      state.setViewport({ ...state.viewport, x: state.viewport.x === 0 ? -20 : 0 });
    }),
  movePointer: (x, y) =>
    afterNextCommit(() => {
      document
        .querySelector('[aria-label="도면 편집 영역"]')
        ?.dispatchEvent(
          new PointerEvent('pointermove', {
            bubbles: true,
            clientX: x,
            clientY: y,
            pointerType: 'mouse',
          }),
        );
    }),
};

createRoot(document.getElementById('root')!).render(
  <Profiler id="editor" onRender={onRender}>
    <EditorCanvas
      areaUnit="sqm"
      objectArray={DEFAULT_OBJECT_ARRAY}
      overlayFloorId={null}
      autoPlacementPreview={null}
    />
  </Profiler>,
);
