import { useState } from 'react';
import { EditorCanvas } from '../components/editor/EditorCanvas';
import {
  areaFromSquareMeters,
  areaToSquareMeters,
  formatArea,
  formatAreaDifference,
  type AreaUnit,
} from '../domain/geometry/area';
import { polygonArea } from '../domain/geometry/coordinates';
import { resizeWall } from '../domain/geometry/polygonValidation';
import { getWallSegments } from '../domain/geometry/walls';
import { roomEditErrorMessage } from '../features/room/edit';
import { useEditorStore, type EditorTool } from '../store/editorStore';
import { useProjectStore } from '../store/projectStore';
import styles from './App.module.scss';

const tools: { id: EditorTool; label: string; icon: string; description: string }[] = [
  { id: 'select', label: '선택', icon: '↖', description: '선택 도구' },
  { id: 'room', label: '공간', icon: '▱', description: '점을 클릭해 벽 그리기' },
  { id: 'pan', label: '이동', icon: '✥', description: '도면 이동' },
];

function TargetAreaInput({
  areaUnit,
  targetAreaSqm,
  onChange,
}: {
  areaUnit: AreaUnit;
  targetAreaSqm: number | null;
  onChange: (targetAreaSqm: number | null) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const value =
    draft ??
    (targetAreaSqm === null
      ? ''
      : String(Number(areaFromSquareMeters(targetAreaSqm, areaUnit).toFixed(6))));
  const invalid =
    draft !== null && draft !== '' && (!Number.isFinite(Number(draft)) || Number(draft) <= 0);

  return (
    <div className={styles.targetAreaField}>
      <label htmlFor="target-area">목표 면적</label>
      <div className={styles.targetAreaControl}>
        <input
          id="target-area"
          type="number"
          min="0.000001"
          step="any"
          inputMode="decimal"
          placeholder="입력"
          value={value}
          aria-invalid={invalid}
          aria-describedby={invalid ? 'target-area-error' : undefined}
          onChange={(event) => {
            const next = event.target.value;
            setDraft(next);
            if (next === '') {
              onChange(null);
              return;
            }
            const numeric = Number(next);
            if (Number.isFinite(numeric) && numeric > 0) {
              onChange(areaToSquareMeters(numeric, areaUnit));
            }
          }}
          onBlur={() => setDraft(null)}
        />
        <span>{areaUnit === 'sqm' ? '㎡' : '평'}</span>
      </div>
      {invalid && (
        <small id="target-area-error" className={styles.targetAreaError} role="alert">
          0보다 큰 면적을 입력하세요.
        </small>
      )}
    </div>
  );
}

function WallLengthInput({
  lengthMeters,
  wallIndex,
  onCommit,
}: {
  lengthMeters: number;
  wallIndex: number;
  onCommit: (lengthMeters: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <div className={styles.wallLengthField}>
      <label htmlFor="wall-length">벽 {wallIndex + 1} 길이</label>
      <div className={styles.targetAreaControl}>
        <input
          id="wall-length"
          type="number"
          min="0.01"
          step="any"
          inputMode="decimal"
          value={draft ?? String(Number(lengthMeters.toFixed(3)))}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => {
            if (draft !== null) onCommit(Number(draft));
            setDraft(null);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
        />
        <span>m</span>
      </div>
      <small>시작점을 고정하고 끝점을 이동합니다. Enter로 적용할 수 있습니다.</small>
    </div>
  );
}

export function App() {
  const [areaUnit, setAreaUnit] = useState<AreaUnit>('sqm');
  const tool = useEditorStore((state) => state.tool);
  const setTool = useEditorStore((state) => state.setTool);
  const resetViewport = useEditorStore((state) => state.resetViewport);
  const activeFloorId = useEditorStore((state) => state.activeFloorId);
  const activeProjectId = useEditorStore((state) => state.activeProjectId);
  const selectedRoomId = useEditorStore((state) => state.selectedRoomId);
  const selectedWallIndex = useEditorStore((state) => state.selectedWallIndex);
  const roomEditPreview = useEditorStore((state) => state.roomEditPreview);
  const geometryError = useEditorStore((state) => state.geometryError);
  const selectRoom = useEditorStore((state) => state.selectRoom);
  const selectWall = useEditorStore((state) => state.selectWall);
  const setGeometryError = useEditorStore((state) => state.setGeometryError);
  const project = useProjectStore((state) => state.projectsById[activeProjectId ?? '']);
  const setTargetAreaSqm = useProjectStore((state) => state.setTargetAreaSqm);
  const updateRoomVertices = useProjectStore((state) => state.updateRoomVertices);
  const floor = useProjectStore((state) => state.floorsById[activeFloorId ?? '']);
  const roomsById = useProjectStore((state) => state.roomsById);
  const rooms = (floor?.roomIds ?? [])
    .map((id) => roomsById[id])
    .filter((room) => room != null)
    .map((room) =>
      roomEditPreview?.roomId === room.id ? { ...room, vertices: roomEditPreview.vertices } : room,
    );
  const selectedRoom = rooms.find((room) => room.id === selectedRoomId);
  const selectedWalls = selectedRoom ? getWallSegments(selectedRoom.vertices, true) : [];
  const totalAreaSqm = rooms.reduce((sum, room) => sum + polygonArea(room.vertices), 0);

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.logo}>⌂</span>
          <strong>Interior Planner</strong>
          <span className={styles.badge}>Foundation</span>
        </div>
        <div className={styles.projectName}>
          제목 없는 프로젝트 <span>· 로컬 편집 화면</span>
        </div>
        <button
          className={styles.primaryButton}
          disabled
          title="7일차에 Firebase 저장 기능을 연결합니다"
        >
          저장 준비 중
        </button>
      </header>
      <main className={styles.workspace}>
        <aside className={styles.sidebar} aria-label="도구">
          <p className={styles.caption}>도구</p>
          {tools.map(({ id, label, icon, description }) => (
            <button
              key={id}
              type="button"
              className={`${styles.tool} ${tool === id ? styles.active : ''}`}
              onClick={() => setTool(id)}
              title={description}
              aria-pressed={tool === id}
            >
              <span>{icon}</span>
              {label}
            </button>
          ))}
        </aside>
        <section className={styles.editor} aria-label="에디터">
          <div className={styles.subheader}>
            <div>
              <span className={styles.dot} /> 1F <span className={styles.muted}>/ 도면 편집</span>
            </div>
            <div className={styles.subheaderActions}>
              <div className={styles.unitToggle} role="group" aria-label="면적 표시 단위">
                <button
                  type="button"
                  aria-pressed={areaUnit === 'sqm'}
                  onClick={() => setAreaUnit('sqm')}
                >
                  ㎡
                </button>
                <button
                  type="button"
                  aria-pressed={areaUnit === 'pyeong'}
                  onClick={() => setAreaUnit('pyeong')}
                >
                  평
                </button>
              </div>
              <button type="button" onClick={resetViewport}>
                화면 초기화
              </button>
            </div>
          </div>
          <EditorCanvas areaUnit={areaUnit} />
        </section>
        <aside className={styles.inspector} aria-label="속성 패널">
          <p className={styles.caption}>속성</p>
          <h2>도면 정보</h2>
          <div className={styles.infoRow}>
            <span>현재 층</span>
            <strong>1F</strong>
          </div>
          <div className={styles.infoRow}>
            <span>공간</span>
            <strong>{floor?.roomIds.length ?? 0}개</strong>
          </div>
          <div className={styles.infoRow}>
            <span>오브젝트</span>
            <strong>0개</strong>
          </div>
          <section className={styles.areaSection} aria-label="공간 면적">
            <div className={styles.areaTotal}>
              <span>공간 면적 합계</span>
              <strong>{formatArea(totalAreaSqm, areaUnit)}</strong>
            </div>
            {project && (
              <>
                <TargetAreaInput
                  key={`${project.id}:${areaUnit}`}
                  areaUnit={areaUnit}
                  targetAreaSqm={project.targetAreaSqm}
                  onChange={(value) => setTargetAreaSqm(project.id, value)}
                />
                {project.targetAreaSqm !== null && (
                  <div className={styles.areaDifference}>
                    <span>목표 대비</span>
                    <strong>
                      {formatAreaDifference(totalAreaSqm, project.targetAreaSqm, areaUnit)}
                    </strong>
                  </div>
                )}
              </>
            )}
            {rooms.length === 0 ? (
              <p className={styles.areaEmpty}>완성된 공간이 없습니다.</p>
            ) : (
              <ul className={styles.roomAreaList}>
                {rooms.map((room) => (
                  <li key={room.id}>
                    <button
                      type="button"
                      className={styles.roomAreaButton}
                      aria-pressed={room.id === selectedRoomId}
                      onClick={() => {
                        setTool('select');
                        selectRoom(room.id);
                      }}
                    >
                      <span>{room.name}</span>
                      <strong>{formatArea(polygonArea(room.vertices), areaUnit)}</strong>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
          {tool === 'select' && selectedRoom && (
            <section className={styles.roomEditSection} aria-label={`${selectedRoom.name} 편집`}>
              <h3>{selectedRoom.name} 편집</h3>
              <p>방 내부를 드래그해 전체를 옮기거나, 점을 드래그하고 벽 길이를 수정하세요.</p>
              <div className={styles.wallButtons}>
                {selectedWalls.map((wall, index) => (
                  <button
                    key={index}
                    type="button"
                    aria-pressed={selectedWallIndex === index}
                    onClick={() => selectWall(selectedRoom.id, index)}
                  >
                    벽 {index + 1} · {Number(wall.lengthMeters.toFixed(2))}m
                  </button>
                ))}
              </div>
              {selectedWallIndex !== null && selectedWalls[selectedWallIndex] && (
                <WallLengthInput
                  key={`${selectedRoom.id}:${selectedWallIndex}`}
                  wallIndex={selectedWallIndex}
                  lengthMeters={selectedWalls[selectedWallIndex].lengthMeters}
                  onCommit={(lengthMeters) => {
                    const next = resizeWall(selectedRoom.vertices, selectedWallIndex, lengthMeters);
                    setGeometryError(
                      next ? updateRoomVertices(selectedRoom.id, next) : 'invalid-wall-length',
                    );
                  }}
                />
              )}
              {geometryError && (
                <p className={styles.geometryError} role="alert">
                  {roomEditErrorMessage(geometryError)}
                </p>
              )}
            </section>
          )}
          <div className={styles.notice}>
            공간 도구로 방을 만든 뒤 선택 도구에서 방 내부를 드래그해 옮기거나 점과 벽을 수정하세요.
          </div>
          <div className={styles.shortcuts}>
            <p>빠른 조작</p>
            <span>
              확대 / 축소 <kbd>휠</kbd>
            </span>
            <span>
              화면 이동 <kbd>Space + 드래그</kbd>
            </span>
            <span>
              화면 이동 <kbd>가운데 버튼</kbd>
            </span>
          </div>
        </aside>
      </main>
    </div>
  );
}
