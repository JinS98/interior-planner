import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { AreaUnit } from '../../domain/geometry/area';
import { EditorCanvas } from '../../components/editor/EditorCanvas';
import { useEditorStore } from '../../store/editorStore';
import { useProjectStore } from '../../store/projectStore';
import { FloorPreview } from './FloorPreview';
import { FloorManager } from './FloorManager';
import { centeredFloorViewport, floorContentBounds } from './viewport';
import type { ObjectArrayOptions } from '../object/array';
import type { AutoPlacementPreview } from '../autoPlacement/AutoPlacementPanel';
import styles from './FloorBoard.module.scss';

export function FloorBoard({
  areaUnit,
  objectArray,
  autoPlacementPreview,
}: {
  areaUnit: AreaUnit;
  objectArray: ObjectArrayOptions;
  autoPlacementPreview: AutoPlacementPreview | null;
}) {
  const activeProjectId = useEditorStore((state) => state.activeProjectId);
  const activeFloorId = useEditorStore((state) => state.activeFloorId);
  const setActiveFloor = useEditorStore((state) => state.setActiveFloor);
  const project = useProjectStore((state) => state.projectsById[activeProjectId ?? '']);
  const floorsById = useProjectStore((state) => state.floorsById);
  const floorIds = project?.floorIds;
  const floors = (floorIds ?? []).map((id) => floorsById[id]).filter((floor) => floor);
  const otherFloors = floors.filter((floor) => floor.id !== activeFloorId);
  const [hiddenFloorIds, setHiddenFloorIds] = useState<Set<string>>(() => new Set());
  const [maximizedFloorId, setMaximizedFloorId] = useState<string | null>(null);
  const [overlayFloorId, setOverlayFloorId] = useState<string | null>(null);
  const [floorManagerOpen, setFloorManagerOpen] = useState(false);
  const visibleOverlayFloorId =
    overlayFloorId && overlayFloorId !== activeFloorId && floorsById[overlayFloorId]
      ? overlayFloorId
      : null;
  const availableFloors = floors.filter((floor) => !hiddenFloorIds.has(floor.id));
  const maximizedFloor = availableFloors.find((floor) => floor.id === maximizedFloorId);
  const visibleFloors = maximizedFloor ? [maximizedFloor] : availableFloors;
  const viewSignature = `${activeFloorId ?? ''}:${visibleFloors.map((floor) => floor.id).join(',')}:${maximizedFloorId ?? ''}`;
  const activeCanvasHost = useRef<HTMLDivElement | null>(null);
  const previousViewSignature = useRef(viewSignature);

  useEffect(() => {
    const validIds = new Set(floorIds ?? []);
    setHiddenFloorIds((current) => {
      const next = new Set([...current].filter((id) => validIds.has(id)));
      return next.size === current.size ? current : next;
    });
    if (maximizedFloorId && !validIds.has(maximizedFloorId)) setMaximizedFloorId(null);
  }, [floorIds, maximizedFloorId]);

  useEffect(() => {
    if (!activeFloorId) return;
    if (hiddenFloorIds.has(activeFloorId)) {
      setHiddenFloorIds((current) => {
        const next = new Set(current);
        next.delete(activeFloorId);
        return next;
      });
    }
    if (maximizedFloorId && maximizedFloorId !== activeFloorId) setMaximizedFloorId(activeFloorId);
  }, [activeFloorId, hiddenFloorIds, maximizedFloorId]);

  useEffect(() => {
    if (!overlayFloorId) return;
    if (overlayFloorId === activeFloorId || !floorIds?.includes(overlayFloorId)) {
      const replacement = floorIds?.find((id) => id !== activeFloorId && floorsById[id]);
      setOverlayFloorId(replacement ?? null);
    }
  }, [activeFloorId, floorIds, floorsById, overlayFloorId]);

  useLayoutEffect(() => {
    if (previousViewSignature.current === viewSignature) return;
    previousViewSignature.current = viewSignature;
    const host = activeCanvasHost.current;
    const floor = useProjectStore.getState().floorsById[activeFloorId ?? ''];
    if (!host || !floor) return;
    const { roomsById, objectsById } = useProjectStore.getState();
    const editor = useEditorStore.getState();
    const viewport = centeredFloorViewport(
      floorContentBounds(floor, roomsById, objectsById),
      { width: host.clientWidth, height: host.clientHeight },
      editor.viewport.scale,
    );
    if (viewport) editor.setViewport(viewport);
  }, [activeFloorId, viewSignature]);

  function selectFloor(floorId: string) {
    setHiddenFloorIds((current) => {
      if (!current.has(floorId)) return current;
      const next = new Set(current);
      next.delete(floorId);
      return next;
    });
    if (maximizedFloorId) setMaximizedFloorId(floorId);
    setActiveFloor(floorId);
  }

  function hideFloor(floorId: string) {
    const remaining = availableFloors.filter((floor) => floor.id !== floorId);
    if (remaining.length === 0) return;
    setHiddenFloorIds((current) => new Set(current).add(floorId));
    if (maximizedFloorId === floorId) setMaximizedFloorId(null);
    if (activeFloorId === floorId) setActiveFloor(remaining[0].id);
  }

  function toggleMaximized(floorId: string) {
    if (maximizedFloorId === floorId) {
      setMaximizedFloorId(null);
      return;
    }
    setMaximizedFloorId(floorId);
    setActiveFloor(floorId);
  }

  return (
    <div className={styles.workspace}>
      <div className={styles.tabBar}>
        <nav className={styles.tabs} aria-label="층 도면 탭">
          {floors.map((floor) => (
            <button
              key={floor.id}
              type="button"
              className={styles.tab}
              aria-pressed={floor.id === activeFloorId}
              data-hidden={hiddenFloorIds.has(floor.id)}
              onClick={() => selectFloor(floor.id)}
            >
              {floor.name}
              {hiddenFloorIds.has(floor.id) && <span>숨김</span>}
            </button>
          ))}
          <button
            type="button"
            className={styles.manageButton}
            aria-expanded={floorManagerOpen}
            aria-controls="floor-manager-panel"
            onClick={() => setFloorManagerOpen((open) => !open)}
          >
            + 층 추가·관리
          </button>
        </nav>
        <div className={styles.overlayControls}>
          <label className={styles.overlayToggle}>
            <input
              type="checkbox"
              checked={visibleOverlayFloorId !== null}
              disabled={otherFloors.length === 0}
              onChange={(event) =>
                setOverlayFloorId(event.target.checked ? (otherFloors[0]?.id ?? null) : null)
              }
            />
            반투명 겹쳐 보기
          </label>
          {visibleOverlayFloorId && (
            <select
              aria-label="겹쳐 볼 층"
              value={visibleOverlayFloorId}
              onChange={(event) => setOverlayFloorId(event.target.value)}
            >
              {otherFloors.map((floor) => (
                <option key={floor.id} value={floor.id}>
                  {floor.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>
      {floorManagerOpen && (
        <div id="floor-manager-panel" className={styles.floorManagerDrawer}>
          <FloorManager onFloorCreated={() => setFloorManagerOpen(false)} />
          <button
            type="button"
            className={styles.closeManager}
            onClick={() => setFloorManagerOpen(false)}
          >
            닫기
          </button>
        </div>
      )}
      <div className={styles.board} aria-label="층별 도면">
        {visibleFloors.map((floor) => {
          const active = floor.id === activeFloorId;
          const maximized = floor.id === maximizedFloorId;
          return (
            <section
              key={floor.id}
              className={`${styles.panel} ${active ? styles.active : ''}`}
              aria-label={`${floor.name} 도면${active ? ', 편집 중' : ', 미리보기'}`}
            >
              <div className={styles.heading}>
                <div className={styles.headingTitle}>
                  <strong>{floor.name}</strong>
                  <span>{active ? '편집 중' : '미리보기'}</span>
                </div>
                <div className={styles.windowActions}>
                  <button
                    type="button"
                    aria-label={`${floor.name} 숨기기`}
                    title={
                      availableFloors.length > 1
                        ? '도면 숨기기'
                        : '마지막 보이는 층은 숨길 수 없습니다'
                    }
                    disabled={availableFloors.length <= 1}
                    onClick={() => hideFloor(floor.id)}
                  >
                    −
                  </button>
                  <button
                    type="button"
                    aria-label={`${floor.name} ${maximized ? '원래 크기로 보기' : '크게 보기'}`}
                    title={maximized ? '원래 크기로 보기' : '크게 보기'}
                    onClick={() => toggleMaximized(floor.id)}
                  >
                    {maximized ? '❐' : '□'}
                  </button>
                </div>
              </div>
              {active ? (
                <div className={styles.canvasHost} ref={activeCanvasHost}>
                  <EditorCanvas
                    key={floor.id}
                    areaUnit={areaUnit}
                    objectArray={objectArray}
                    overlayFloorId={visibleOverlayFloorId}
                    autoPlacementPreview={autoPlacementPreview}
                  />
                </div>
              ) : (
                <FloorPreview floor={floor} onSelect={() => selectFloor(floor.id)} />
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
