import { useEffect, useState } from 'react';
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
import {
  MAX_OBJECT_SIZE_METERS,
  MIN_OBJECT_SIZE_METERS,
  NEW_PALETTE_APPEARANCE,
  OBJECT_SHAPES,
} from '../features/object/catalog';
import { useEditorStore, type EditorTool } from '../store/editorStore';
import { useProjectStore } from '../store/projectStore';
import type { LayoutObject, ObjectAppearance } from '../types/layout';
import styles from './App.module.scss';

const tools: {
  id: EditorTool;
  label: string;
  icon: string;
  description: string;
  shortcut?: string;
}[] = [
  { id: 'select', label: '선택', icon: '↖', description: '선택 도구', shortcut: 'V' },
  { id: 'room', label: '공간', icon: '▱', description: '점을 클릭해 벽 그리기', shortcut: 'R' },
  { id: 'object', label: '물품', icon: '▣', description: '선택한 물품 배치', shortcut: 'F' },
  {
    id: 'divide',
    label: '분할',
    icon: '⊞',
    description: '기존 공간을 벽으로 나누기',
    shortcut: 'D',
  },
  { id: 'pan', label: '이동', icon: '✥', description: '도면 이동' },
];

const COLOR_SWATCHES = ['#D5A56D', '#82A7DE', '#8494AD', '#E48A98', '#76BFA3', '#B996D8'];

function ObjectSizeInput({
  id,
  label,
  value,
  onCommit,
}: {
  id: string;
  label: string;
  value: number;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <label className={styles.objectSizeField} htmlFor={id}>
      {label}
      <span>
        <input
          id={id}
          type="number"
          min={MIN_OBJECT_SIZE_METERS}
          max={MAX_OBJECT_SIZE_METERS}
          step="0.1"
          inputMode="decimal"
          value={draft ?? String(Number(value.toFixed(3)))}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => {
            const next = Number(draft);
            if (
              draft !== null &&
              draft !== '' &&
              Number.isFinite(next) &&
              next >= MIN_OBJECT_SIZE_METERS &&
              next <= MAX_OBJECT_SIZE_METERS
            )
              onCommit(next);
            setDraft(null);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
        />
        m
      </span>
    </label>
  );
}

function ObjectCoordinateInput({
  id,
  label,
  value,
  onCommit,
}: {
  id: string;
  label: string;
  value: number;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <label className={styles.objectSizeField} htmlFor={id}>
      {label}
      <span>
        <input
          id={id}
          type="number"
          step="any"
          inputMode="decimal"
          value={draft ?? String(Number(value.toFixed(3)))}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => {
            if (draft !== null && draft.trim() !== '') {
              const next = Number(draft);
              if (Number.isFinite(next)) onCommit(Number(next.toFixed(3)));
            }
            setDraft(null);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
            if (event.key === 'Escape') setDraft(null);
          }}
        />
        m
      </span>
    </label>
  );
}

function ObjectRotationInput({
  rotation,
  onCommit,
}: {
  rotation: number;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <label className={styles.objectRotationField} htmlFor="selected-object-rotation">
      회전
      <span>
        <input
          id="selected-object-rotation"
          type="number"
          min={0}
          max={359}
          step={1}
          value={draft ?? String(Math.round(rotation))}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => {
            if (draft !== null && draft !== '' && Number.isFinite(Number(draft)))
              onCommit(Number(draft));
            setDraft(null);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
        />
        °
      </span>
    </label>
  );
}

function ObjectAppearanceControls({
  appearance,
  idPrefix,
  onChange,
}: {
  appearance: ObjectAppearance;
  idPrefix: string;
  onChange: (patch: Partial<ObjectAppearance>) => void;
}) {
  return (
    <div className={styles.objectAppearance}>
      <div className={styles.objectSizeRow}>
        <ObjectSizeInput
          id={`${idPrefix}-width`}
          label="가로"
          value={appearance.width}
          onCommit={(width) => onChange({ width })}
        />
        <ObjectSizeInput
          id={`${idPrefix}-height`}
          label="세로"
          value={appearance.height}
          onCommit={(height) => onChange({ height })}
        />
      </div>
      <span className={styles.objectFieldLabel}>모양</span>
      <div className={styles.objectShapeOptions} role="group" aria-label="가구 모양">
        {OBJECT_SHAPES.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            aria-pressed={appearance.shape === id}
            onClick={() => onChange({ shape: id })}
          >
            <span aria-hidden="true">{id === 'rectangle' ? '▭' : id === 'circle' ? '●' : '▲'}</span>
            {label}
          </button>
        ))}
      </div>
      <span className={styles.objectFieldLabel}>색상</span>
      <div className={styles.objectColorOptions} role="group" aria-label="가구 색상">
        {COLOR_SWATCHES.map((color) => (
          <button
            key={color}
            type="button"
            aria-label={`색상 ${color}`}
            aria-pressed={appearance.color.toLowerCase() === color.toLowerCase()}
            className={styles.objectColorSwatch}
            style={{ backgroundColor: color }}
            onClick={() => onChange({ color })}
          />
        ))}
        <label className={styles.customColor}>
          <input
            type="color"
            aria-label="사용자 지정 색상"
            value={appearance.color}
            onChange={(event) => onChange({ color: event.target.value })}
          />
        </label>
      </div>
    </div>
  );
}

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
  const [addingPaletteItem, setAddingPaletteItem] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [newItemCategory, setNewItemCategory] = useState<LayoutObject['category']>('furniture');
  const [newItemAppearance, setNewItemAppearance] =
    useState<ObjectAppearance>(NEW_PALETTE_APPEARANCE);
  const tool = useEditorStore((state) => state.tool);
  const setTool = useEditorStore((state) => state.setTool);
  const selectedPaletteItemId = useEditorStore((state) => state.selectedPaletteItemId);
  const setPaletteItem = useEditorStore((state) => state.setPaletteItem);
  const clearPaletteItem = useEditorStore((state) => state.clearPaletteItem);
  const objectPlacement = useEditorStore((state) => state.objectPlacement);
  const setObjectPlacement = useEditorStore((state) => state.setObjectPlacement);
  const selectedObjectId = useEditorStore((state) => state.selectedObjectIds[0] ?? null);
  const selectObject = useEditorStore((state) => state.selectObject);
  const objectEditPreview = useEditorStore((state) => state.objectEditPreview);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.isComposing || event.ctrlKey || event.metaKey || event.altKey)
        return;
      if (
        event.target instanceof HTMLElement &&
        (event.target.isContentEditable ||
          event.target.closest('input, textarea, select, [contenteditable="true"]'))
      )
        return;
      const shortcutTool = tools.find(
        ({ shortcut }) => shortcut && event.code === `Key${shortcut}`,
      );
      if (!shortcutTool) return;
      event.preventDefault();
      setTool(shortcutTool.id);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setTool]);
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
  const paletteItemsById = useProjectStore((state) => state.paletteItemsById);
  const addPaletteItem = useProjectStore((state) => state.addPaletteItem);
  const setTargetAreaSqm = useProjectStore((state) => state.setTargetAreaSqm);
  const updateRoomVertices = useProjectStore((state) => state.updateRoomVertices);
  const updateLayoutObject = useProjectStore((state) => state.updateLayoutObject);
  const deleteLayoutObject = useProjectStore((state) => state.deleteLayoutObject);
  const floor = useProjectStore((state) => state.floorsById[activeFloorId ?? '']);
  const roomsById = useProjectStore((state) => state.roomsById);
  const objectsById = useProjectStore((state) => state.objectsById);
  const selectedObject = selectedObjectId
    ? objectEditPreview?.id === selectedObjectId
      ? objectEditPreview
      : objectsById[selectedObjectId]
    : null;
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
          {tools.map(({ id, label, icon, description, shortcut }) => (
            <button
              key={id}
              type="button"
              className={`${styles.tool} ${tool === id ? styles.active : ''}`}
              onClick={() => setTool(id)}
              title={shortcut ? `${description} (${shortcut})` : description}
              aria-pressed={tool === id}
              aria-keyshortcuts={shortcut}
            >
              <span className={styles.toolIcon}>{icon}</span>
              <span className={styles.toolLabel}>
                {label}
                {shortcut && <kbd className={styles.toolShortcut}>{shortcut}</kbd>}
              </span>
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
            <strong>{floor?.objectIds.length ?? 0}개</strong>
          </div>
          <section
            className={styles.objectPalette}
            aria-label="가구와 물품 팔레트"
            onContextMenu={(event) => {
              if (tool !== 'object') return;
              if (
                event.target instanceof HTMLElement &&
                event.target.closest('input, textarea, select')
              )
                return;
              event.preventDefault();
              clearPaletteItem();
            }}
          >
            <h3>가구·물품 Palette</h3>
            <p>항목을 선택한 뒤 도면을 클릭해 배치하세요.</p>
            <div className={styles.presetList}>
              {(project?.paletteItemIds ?? [])
                .map((id) => paletteItemsById[id])
                .filter((item) => item != null)
                .map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={styles.presetButton}
                    aria-pressed={tool === 'object' && selectedPaletteItemId === item.id}
                    onClick={() => setPaletteItem(item)}
                  >
                    <span
                      className={styles.presetIcon}
                      style={{ color: item.color, backgroundColor: `${item.color}26` }}
                      aria-hidden="true"
                    >
                      {item.shape === 'rectangle' ? '▭' : item.shape === 'circle' ? '●' : '▲'}
                    </span>
                    <span className={styles.presetName}>{item.name}</span>
                    <span className={styles.presetSize}>
                      {item.width} × {item.height}m
                    </span>
                  </button>
                ))}
            </div>
            {addingPaletteItem ? (
              <form
                className={styles.paletteCreateForm}
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!project) return;
                  const item = addPaletteItem(project.id, {
                    name: newItemName,
                    category: newItemCategory,
                    ...newItemAppearance,
                  });
                  if (!item) return;
                  setPaletteItem(item);
                  setAddingPaletteItem(false);
                  setNewItemName('');
                  setNewItemCategory('furniture');
                  setNewItemAppearance(NEW_PALETTE_APPEARANCE);
                }}
              >
                <h4>물품 추가</h4>
                <label className={styles.paletteCreateField}>
                  이름
                  <input
                    required
                    maxLength={40}
                    value={newItemName}
                    onChange={(event) => setNewItemName(event.target.value)}
                    placeholder="예: 소파, 모니터"
                  />
                </label>
                <label className={styles.paletteCreateField}>
                  종류
                  <select
                    value={newItemCategory}
                    onChange={(event) =>
                      setNewItemCategory(event.target.value as LayoutObject['category'])
                    }
                  >
                    <option value="furniture">가구</option>
                    <option value="electronics">전자기기</option>
                    <option value="facility">기타 물품</option>
                    <option value="commercial">상업용 물품</option>
                  </select>
                </label>
                <ObjectAppearanceControls
                  appearance={newItemAppearance}
                  idPrefix="new-palette-item"
                  onChange={(patch) =>
                    setNewItemAppearance((current) => ({ ...current, ...patch }))
                  }
                />
                <div className={styles.paletteCreateActions}>
                  <button type="button" onClick={() => setAddingPaletteItem(false)}>
                    취소
                  </button>
                  <button type="submit" disabled={!newItemName.trim()}>
                    추가하기
                  </button>
                </div>
              </form>
            ) : (
              <button
                type="button"
                className={styles.paletteAddButton}
                onClick={() => setAddingPaletteItem(true)}
              >
                + 물품 추가
              </button>
            )}
            {tool === 'object' && selectedPaletteItemId === null && (
              <p className={styles.paletteEmptySelection} role="status">
                선택된 물품이 없습니다. 물품을 고르거나 추가해 주세요.
              </p>
            )}
            {tool === 'object' && selectedPaletteItemId !== null && (
              <div className={styles.paletteSettings}>
                <h4>배치 설정</h4>
                <ObjectAppearanceControls
                  appearance={objectPlacement}
                  idPrefix="placement"
                  onChange={setObjectPlacement}
                />
              </div>
            )}
          </section>
          {tool === 'select' && selectedObject && (
            <section
              className={styles.objectEditSection}
              aria-label={`${selectedObject.name} 편집`}
            >
              <h3>{selectedObject.name} 편집</h3>
              <p>
                물품을 드래그해 이동하고, 위쪽 손잡이로 회전하거나 오른쪽 아래 손잡이로 크기를
                바꾸세요.
              </p>
              <div className={styles.objectPositionControls}>
                <span className={styles.objectFieldLabel}>
                  위치 (도면 원점 기준, 회전 전 왼쪽 위)
                </span>
                <div className={styles.objectSizeRow} key={`${selectedObject.id}-position`}>
                  <ObjectCoordinateInput
                    id="selected-object-x"
                    label="X 좌표"
                    value={selectedObject.x}
                    onCommit={(x) => updateLayoutObject(selectedObject.id, { x })}
                  />
                  <ObjectCoordinateInput
                    id="selected-object-y"
                    label="Y 좌표"
                    value={selectedObject.y}
                    onCommit={(y) => updateLayoutObject(selectedObject.id, { y })}
                  />
                </div>
              </div>
              <ObjectAppearanceControls
                key={selectedObject.id}
                appearance={selectedObject}
                idPrefix="selected-object"
                onChange={(patch) => updateLayoutObject(selectedObject.id, patch)}
              />
              <ObjectRotationInput
                key={`${selectedObject.id}-rotation`}
                rotation={selectedObject.rotation}
                onCommit={(rotation) => updateLayoutObject(selectedObject.id, { rotation })}
              />
              <button
                type="button"
                className={styles.objectDeleteButton}
                onClick={() => {
                  if (deleteLayoutObject(selectedObject.id)) selectObject(null);
                }}
              >
                물품 삭제
              </button>
            </section>
          )}
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
            공간을 그리고 분할하거나, Palette에서 물품의 크기·모양·색을 정해 배치하세요. 선택 도구로
            놓인 물품을 수정할 수 있습니다.
          </div>
          <div className={styles.shortcuts}>
            <p>빠른 조작</p>
            <span>
              직전 점 취소 <kbd>Esc</kbd>
            </span>
            <span>
              선택 도구 <kbd>V</kbd>
            </span>
            <span>
              공간 도구 <kbd>R</kbd>
            </span>
            <span>
              물품 배치 <kbd>F</kbd>
            </span>
            <span>
              분할 도구 <kbd>D</kbd>
            </span>
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
