import { useEffect, useState, type ReactNode } from 'react';
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
import { rotateRoomVertices } from '../features/room/rotation';
import { TOOL_SHORTCUTS } from '../features/editor/shortcuts';
import { redoEditorCommand, undoEditorCommand } from '../features/history/actions';
import { FloorBoard } from '../features/floor/FloorBoard';
import {
  AutoPlacementPanel,
  type AutoPlacementPreview,
  type SelectedAutoPlacementSource,
} from '../features/autoPlacement/AutoPlacementPanel';
import { floorConnectionLabel } from '../features/floor/connection';
import {
  copySelectedObjects,
  deleteSelectedObjects,
  pasteCopiedObjects,
} from '../features/object/clipboard';
import {
  MAX_OBJECT_SIZE_METERS,
  MIN_OBJECT_SIZE_METERS,
  NEW_PALETTE_APPEARANCE,
  OBJECT_SHAPES,
} from '../features/object/catalog';
import {
  DEFAULT_OBJECT_ARRAY,
  isValidObjectArray,
  type ObjectArrayOptions,
} from '../features/object/array';
import { SetBuilder } from '../features/object/SetBuilder';
import { MAX_SET_PLACED_OBJECTS } from '../features/object/setPresets';
import { useEditorStore, type EditorTool } from '../store/editorStore';
import { useProjectStore } from '../store/projectStore';
import type { LayoutObject, ObjectAppearance } from '../types/layout';
import styles from './App.module.scss';

function InspectorSection({
  id,
  title,
  children,
  initiallyOpen = false,
  className = '',
}: {
  id: string;
  title: string;
  children: ReactNode;
  initiallyOpen?: boolean;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(initiallyOpen);

  return (
    <section className={`${styles.inspectorSection} ${className}`} aria-label={title}>
      <button
        type="button"
        className={styles.inspectorSectionToggle}
        aria-expanded={expanded}
        aria-controls={`${id}-content`}
        onClick={() => setExpanded((current) => !current)}
      >
        <span>{title}</span>
        <span className={styles.inspectorSectionChevron} aria-hidden="true">
          {expanded ? '▾' : '▸'}
        </span>
      </button>
      <div id={`${id}-content`} className={styles.inspectorSectionContent} hidden={!expanded}>
        {children}
      </div>
    </section>
  );
}

function normalizePaletteSearch(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase()
    .replace(/엘레베이터|엘베/g, '엘리베이터');
}

const tools: {
  id: EditorTool;
  label: string;
  icon: string;
  description: string;
  shortcut?: string;
}[] = [
  {
    id: 'select',
    label: '선택',
    icon: '↖',
    description: '선택 도구',
    shortcut: TOOL_SHORTCUTS.select,
  },
  {
    id: 'room',
    label: '공간',
    icon: '▱',
    description: '점을 클릭해 벽 그리기',
    shortcut: TOOL_SHORTCUTS.room,
  },
  {
    id: 'object',
    label: '물품',
    icon: '▣',
    description: '선택한 물품 배치',
    shortcut: TOOL_SHORTCUTS.object,
  },
  {
    id: 'divide',
    label: '분할',
    icon: '⊞',
    description: '기존 공간을 벽으로 나누기',
    shortcut: TOOL_SHORTCUTS.divide,
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

function ObjectArrayInput({
  label,
  value,
  min,
  max,
  step,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <label className={styles.arrayField}>
      {label}
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={draft ?? String(value)}
        onChange={(event) => {
          const nextDraft = event.target.value;
          setDraft(nextDraft);
          const next = Number(nextDraft);
          if (
            nextDraft !== '' &&
            Number.isFinite(next) &&
            next >= min &&
            next <= max &&
            (step !== 1 || Number.isInteger(next))
          )
            onCommit(next);
        }}
        onBlur={() => {
          const next = Number(draft);
          if (draft !== null && draft !== '' && Number.isFinite(next)) onCommit(next);
          setDraft(null);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
          if (event.key === 'Escape') setDraft(null);
        }}
      />
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
  deferColorCommit = false,
}: {
  appearance: ObjectAppearance;
  idPrefix: string;
  onChange: (patch: Partial<ObjectAppearance>) => void;
  deferColorCommit?: boolean;
}) {
  const [customColorDraft, setCustomColorDraft] = useState<string | null>(null);
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
            value={customColorDraft ?? appearance.color}
            onChange={(event) => {
              if (deferColorCommit) setCustomColorDraft(event.target.value);
              else onChange({ color: event.target.value });
            }}
            onBlur={() => {
              if (deferColorCommit && customColorDraft) onChange({ color: customColorDraft });
              setCustomColorDraft(null);
            }}
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
            setDraft(event.target.value);
          }}
          onBlur={() => {
            if (draft !== null) {
              if (draft === '') onChange(null);
              else {
                const numeric = Number(draft);
                if (Number.isFinite(numeric) && numeric > 0)
                  onChange(areaToSquareMeters(numeric, areaUnit));
              }
            }
            setDraft(null);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
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

function ShortcutHelp() {
  return (
    <div className={styles.shortcutHelp}>
      <button
        type="button"
        className={styles.shortcutHelpButton}
        aria-label="단축키 도움말"
        aria-describedby="shortcut-help-list"
        title="단축키 보기"
      >
        ?
      </button>
      <div id="shortcut-help-list" className={styles.shortcutPopover} role="tooltip">
        <div className={styles.shortcuts}>
          <p>빠른 조작</p>
          <span>
            직전 점·선택 취소 <kbd>Esc</kbd>
          </span>
          <span>
            요소 간 거리 <kbd>Alt + 마우스 올리기</kbd>
          </span>
          <span>
            직전 점 취소 <kbd>Backspace</kbd>
          </span>
          <span>
            물품 복사 <kbd>Ctrl/Cmd + C</kbd>
          </span>
          <span>
            물품 붙여넣기 <kbd>Ctrl/Cmd + V</kbd>
          </span>
          <span>
            선택 삭제 <kbd>Delete</kbd>
          </span>
          <span>
            되돌리기 <kbd>Ctrl/Cmd + Z</kbd>
          </span>
          <span>
            다시 실행 <kbd>Ctrl/Cmd + Shift + Z</kbd>
          </span>
          <span>
            다시 실행 <kbd>Ctrl + Y</kbd>
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
      </div>
    </div>
  );
}

export function App() {
  const [areaUnit, setAreaUnit] = useState<AreaUnit>('sqm');
  const [addingPaletteItem, setAddingPaletteItem] = useState(false);
  const [setBuilderOpen, setSetBuilderOpen] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [paletteQuery, setPaletteQuery] = useState('');
  const [newItemFloorConnector, setNewItemFloorConnector] = useState(false);
  const [objectArray, setObjectArray] = useState<ObjectArrayOptions>(DEFAULT_OBJECT_ARRAY);
  const [placementMode, setPlacementMode] = useState<'single' | 'array'>('single');
  const [autoPlacementPreview, setAutoPlacementPreview] = useState<AutoPlacementPreview | null>(
    null,
  );
  const [newItemCategory, setNewItemCategory] = useState<LayoutObject['category']>('furniture');
  const [newItemAppearance, setNewItemAppearance] =
    useState<ObjectAppearance>(NEW_PALETTE_APPEARANCE);
  const tool = useEditorStore((state) => state.tool);
  const setTool = useEditorStore((state) => state.setTool);
  const selectedPaletteItemId = useEditorStore((state) => state.selectedPaletteItemId);
  const selectedObjectSetId = useEditorStore((state) => state.selectedObjectSetId);
  const setPaletteItem = useEditorStore((state) => state.setPaletteItem);
  const setObjectSet = useEditorStore((state) => state.setObjectSet);
  const clearPaletteItem = useEditorStore((state) => state.clearPaletteItem);
  const objectPlacement = useEditorStore((state) => state.objectPlacement);
  const setObjectPlacement = useEditorStore((state) => state.setObjectPlacement);
  const selectedObjectIds = useEditorStore((state) => state.selectedObjectIds);
  const editingGroupId = useEditorStore((state) => state.editingGroupId);
  const selectObjects = useEditorStore((state) => state.selectObjects);
  const startGroupInternalEdit = useEditorStore((state) => state.startGroupInternalEdit);
  const finishGroupInternalEdit = useEditorStore((state) => state.finishGroupInternalEdit);
  const clipboardCount = useEditorStore((state) => state.objectClipboard.length);
  const selectedObjectId = selectedObjectIds.length === 1 ? selectedObjectIds[0] : null;
  const objectEditPreview = useEditorStore((state) => state.objectEditPreview);
  const objectMovePreviewById = useEditorStore((state) => state.objectMovePreviewById);
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
  const setTemplatesById = useProjectStore((state) => state.setTemplatesById);
  const addPaletteItem = useProjectStore((state) => state.addPaletteItem);
  const addSetTemplate = useProjectStore((state) => state.addSetTemplate);
  useEffect(() => {
    if (selectedObjectSetId && !setTemplatesById[selectedObjectSetId]) clearPaletteItem();
  }, [selectedObjectSetId, setTemplatesById, clearPaletteItem]);
  const setPaletteItemFloorConnector = useProjectStore(
    (state) => state.setPaletteItemFloorConnector,
  );
  const setTargetAreaSqm = useProjectStore((state) => state.setTargetAreaSqm);
  const updateRoomVertices = useProjectStore((state) => state.updateRoomVertices);
  const updateLayoutObject = useProjectStore((state) => state.updateLayoutObject);
  const rotateLayoutObjectGroup = useProjectStore((state) => state.rotateLayoutObjectGroup);
  const duplicateLayoutObjects = useProjectStore((state) => state.duplicateLayoutObjects);
  const setLayoutObjectsLocked = useProjectStore((state) => state.setLayoutObjectsLocked);
  const historyPast = useProjectStore((state) => state.historyPast);
  const historyFuture = useProjectStore((state) => state.historyFuture);
  const floorsById = useProjectStore((state) => state.floorsById);
  const floor = useProjectStore((state) => state.floorsById[activeFloorId ?? '']);
  const roomsById = useProjectStore((state) => state.roomsById);
  const objectsById = useProjectStore((state) => state.objectsById);
  const selectedObject = selectedObjectId
    ? (objectMovePreviewById?.[selectedObjectId] ??
      (objectEditPreview?.id === selectedObjectId
        ? objectEditPreview
        : objectsById[selectedObjectId]))
    : null;
  const selectedPaletteItem = paletteItemsById[selectedPaletteItemId ?? ''];
  const selectedObjectSet = setTemplatesById[selectedObjectSetId ?? ''];
  const autoPlacementSource: SelectedAutoPlacementSource = selectedObjectSet
    ? { kind: 'set', template: selectedObjectSet }
    : selectedPaletteItem
      ? { kind: 'item', item: selectedPaletteItem, appearance: objectPlacement }
      : null;
  const maxSetInstances = Math.min(
    100,
    Math.floor(MAX_SET_PLACED_OBJECTS / (selectedObjectSet?.members.length ?? 1)),
  );
  const selectedObjects = selectedObjectIds
    .map((id) => objectsById[id])
    .filter((object) => object && object.floorId === activeFloorId);
  const selectedGroupId =
    !editingGroupId && selectedObjects.length > 0 ? selectedObjects[0].groupId : null;
  const selectedGroup =
    selectedGroupId &&
    selectedObjects.every((object) => object.groupId === selectedGroupId) &&
    (floor?.objectIds ?? []).filter((id) => objectsById[id]?.groupId === selectedGroupId).length ===
      selectedObjects.length
      ? selectedGroupId
      : null;
  const groupName = selectedGroup
    ? (setTemplatesById[selectedObjects[0].groupTemplateId ?? '']?.name ?? '물품 세트')
    : null;
  const visiblePaletteItems = (project?.paletteItemIds ?? [])
    .map((id) => paletteItemsById[id])
    .filter(
      (item) =>
        item && normalizePaletteSearch(item.name).includes(normalizePaletteSearch(paletteQuery)),
    );
  const visibleObjectSetPresets = (project?.setTemplateIds ?? [])
    .map((id) => setTemplatesById[id])
    .filter(
      (template) =>
        template &&
        normalizePaletteSearch(template.name).includes(normalizePaletteSearch(paletteQuery)),
    );
  const lockedCount = selectedObjects.filter((object) => object.locked).length;
  const unlockedCount = selectedObjects.length - lockedCount;
  const rooms = (floor?.roomIds ?? [])
    .map((id) => roomsById[id])
    .filter((room) => room != null)
    .map((room) =>
      roomEditPreview?.roomId === room.id ? { ...room, vertices: roomEditPreview.vertices } : room,
    );
  const selectedRoom = rooms.find((room) => room.id === selectedRoomId);
  useEffect(() => {
    setAutoPlacementPreview(null);
  }, [
    tool,
    activeFloorId,
    historyPast,
    roomEditPreview,
    selectedPaletteItemId,
    selectedObjectSetId,
    objectPlacement,
  ]);
  const selectedWalls = selectedRoom ? getWallSegments(selectedRoom.vertices, true) : [];
  const floorAreaSqm = rooms.reduce((sum, room) => sum + polygonArea(room.vertices), 0);
  const projectAreaSqm = (project?.floorIds ?? []).reduce(
    (sum, floorId) =>
      sum +
      (floorId === activeFloorId
        ? floorAreaSqm
        : (floorsById[floorId]?.roomIds ?? []).reduce(
            (floorSum, roomId) =>
              floorSum + (roomsById[roomId] ? polygonArea(roomsById[roomId].vertices) : 0),
            0,
          )),
    0,
  );
  const activeObjectArray = placementMode === 'single' ? DEFAULT_OBJECT_ARRAY : objectArray;

  function selectPlacementMode(mode: 'single' | 'array') {
    if (mode === 'array' && objectArray.columns * objectArray.rows === 1) {
      setObjectArray((current) => ({ ...current, columns: 2 }));
    }
    setPlacementMode(mode);
  }

  function updateObjectArray(patch: Partial<ObjectArrayOptions>) {
    setObjectArray((current) => {
      const next = { ...current, ...patch };
      return isValidObjectArray(next) &&
        (!selectedObjectSet || next.columns * next.rows <= maxSetInstances)
        ? next
        : current;
    });
  }

  return (
    <div className={styles.app}>
      {setBuilderOpen && project && (
        <SetBuilder
          items={(project.paletteItemIds ?? [])
            .map((id) => paletteItemsById[id])
            .filter((item) => item != null)}
          onClose={() => setSetBuilderOpen(false)}
          onSave={(name, objects) => {
            const template = addSetTemplate(project.id, name, objects);
            if (!template) return false;
            setObjectSet(template.id);
            setPlacementMode('single');
            setObjectArray(DEFAULT_OBJECT_ARRAY);
            setPaletteQuery('');
            setSetBuilderOpen(false);
            return true;
          }}
        />
      )}
      <header className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.logo}>⌂</span>
          <strong>Interior Planner</strong>
          <span className={styles.badge}>Foundation</span>
        </div>
        <div className={styles.projectName}>
          {project?.name ?? '프로젝트'} <span>· 로컬 편집 화면</span>
        </div>
        <button
          className={styles.primaryButton}
          disabled
          title="10일차에 Firebase 저장 기능을 연결합니다"
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
              <span className={styles.dot} /> {floor?.name ?? '층 없음'}{' '}
              <span className={styles.muted}>/ 도면 편집</span>
            </div>
            <div className={styles.subheaderActions}>
              <ShortcutHelp />
              <button
                type="button"
                disabled={historyPast.length === 0}
                onClick={undoEditorCommand}
                title={
                  historyPast.at(-1)
                    ? `${historyPast.at(-1)?.label} 되돌리기 (Ctrl/Cmd+Z)`
                    : '되돌리기'
                }
                aria-keyshortcuts="Control+Z Meta+Z"
              >
                되돌리기
              </button>
              <button
                type="button"
                disabled={historyFuture.length === 0}
                onClick={redoEditorCommand}
                title={
                  historyFuture.at(-1)
                    ? `${historyFuture.at(-1)?.label} 다시 실행 (Ctrl/Cmd+Shift+Z)`
                    : '다시 실행'
                }
                aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z Control+Y"
              >
                다시 실행
              </button>
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
          <FloorBoard
            areaUnit={areaUnit}
            objectArray={activeObjectArray}
            autoPlacementPreview={autoPlacementPreview}
          />
        </section>
        <aside className={styles.inspector} aria-label="속성 패널">
          <p className={styles.caption}>속성</p>
          <h2>
            {tool === 'object'
              ? '물품 배치'
              : tool === 'select'
                ? '선택과 도면 정보'
                : tool === 'room'
                  ? '공간 그리기'
                  : tool === 'divide'
                    ? '공간 분할'
                    : '도면 보기'}
          </h2>
          {tool !== 'object' && (
            <InspectorSection id="drawing-info" title="도면 정보" initiallyOpen={tool === 'pan'}>
              <div className={styles.infoRow}>
                <span>현재 층</span>
                <strong>{floor?.name ?? '없음'}</strong>
              </div>
              <div className={styles.infoRow}>
                <span>공간</span>
                <strong>{floor?.roomIds.length ?? 0}개</strong>
              </div>
              <div className={styles.infoRow}>
                <span>오브젝트</span>
                <strong>{floor?.objectIds.length ?? 0}개</strong>
              </div>
            </InspectorSection>
          )}
          {tool === 'room' && (
            <InspectorSection id="room-help" title="사용 방법" initiallyOpen>
              <p className={styles.contextHint}>
                도면을 클릭해 꼭짓점을 만들고, 시작점을 다시 클릭해 공간을 완성하세요.
              </p>
            </InspectorSection>
          )}
          {tool === 'divide' && (
            <InspectorSection id="divide-help" title="사용 방법" initiallyOpen>
              <p className={styles.contextHint}>
                기존 공간의 경계에서 시작해 분할선을 그리세요. Esc로 직전 점을 취소할 수 있습니다.
              </p>
            </InspectorSection>
          )}
          {tool === 'pan' && (
            <InspectorSection id="pan-help" title="사용 방법" initiallyOpen>
              <p className={styles.contextHint}>드래그로 도면을 이동하고 휠로 확대·축소하세요.</p>
            </InspectorSection>
          )}
          {tool === 'select' && !selectedRoom && selectedObjectIds.length === 0 && (
            <InspectorSection id="select-help" title="사용 방법" initiallyOpen>
              <p className={styles.contextHint}>
                공간이나 물품을 클릭하면 여기에서 속성을 편집할 수 있습니다.
              </p>
            </InspectorSection>
          )}
          {tool === 'object' && (
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
              <InspectorSection id="palette-selection" title="물품 선택" initiallyOpen>
                <p>물품을 고른 뒤 목록 아래에서 배치 방식을 선택하세요.</p>
                {!addingPaletteItem && (
                  <button
                    type="button"
                    className={styles.paletteAddButton}
                    onClick={() => {
                      setNewItemName(paletteQuery.trim());
                      setAddingPaletteItem(true);
                    }}
                  >
                    + 새 물품 등록
                  </button>
                )}
                {!addingPaletteItem && (
                  <>
                    <input
                      className={styles.paletteSearch}
                      type="search"
                      aria-label="물품 검색"
                      placeholder="물품 검색 · 예: 계단, 엘리베이터"
                      value={paletteQuery}
                      onChange={(event) => setPaletteQuery(event.target.value)}
                    />
                    <div className={styles.presetList}>
                      {visiblePaletteItems.map((item) => (
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
                          <span className={styles.presetDetails}>
                            <span className={styles.presetName}>{item.name}</span>
                            {item.floorConnector && (
                              <span className={styles.connectorBadge}>층 연결</span>
                            )}
                          </span>
                          <span className={styles.presetSize}>
                            {item.width} × {item.height}m
                          </span>
                        </button>
                      ))}
                    </div>
                    {paletteQuery &&
                      visiblePaletteItems.length === 0 &&
                      visibleObjectSetPresets.length === 0 && (
                        <p>검색 결과가 없습니다. 새 물품으로 추가할 수 있습니다.</p>
                      )}
                  </>
                )}
                {addingPaletteItem && (
                  <form
                    className={styles.paletteCreateForm}
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (!project) return;
                      const item = addPaletteItem(project.id, {
                        name: newItemName,
                        category: newItemCategory,
                        floorConnector: newItemFloorConnector,
                        ...newItemAppearance,
                      });
                      if (!item) return;
                      setPaletteItem(item);
                      setAddingPaletteItem(false);
                      setNewItemName('');
                      setNewItemCategory('furniture');
                      setNewItemFloorConnector(false);
                      setNewItemAppearance(NEW_PALETTE_APPEARANCE);
                      setPaletteQuery('');
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
                    <label className={styles.connectorOption}>
                      <input
                        type="checkbox"
                        checked={newItemFloorConnector}
                        onChange={(event) => setNewItemFloorConnector(event.target.checked)}
                      />
                      층 연결 물품
                    </label>
                    <p className={styles.connectorHelp}>
                      계단·엘리베이터처럼 모든 층의 같은 위치에 표시하고 함께 편집합니다.
                    </p>
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
                )}
                {!addingPaletteItem &&
                  selectedPaletteItemId === null &&
                  selectedObjectSetId === null && (
                    <p className={styles.paletteEmptySelection} role="status">
                      선택된 물품이 없습니다. 물품이나 세트를 고르거나 추가해 주세요.
                    </p>
                  )}
                {!addingPaletteItem && selectedPaletteItemId !== null && (
                  <div className={styles.paletteSettings}>
                    <h4>{selectedPaletteItem?.name} 배치 설정</h4>
                    {selectedPaletteItem && (
                      <>
                        <label className={styles.connectorOption}>
                          <input
                            type="checkbox"
                            checked={Boolean(selectedPaletteItem.floorConnector)}
                            onChange={(event) =>
                              setPaletteItemFloorConnector(
                                selectedPaletteItem.id,
                                event.target.checked,
                              )
                            }
                          />
                          층 연결 물품
                        </label>
                        <p className={styles.connectorSettingHelp}>
                          켜면 새로 배치하는 물품이 모든 층의 같은 위치에 나타납니다.
                        </p>
                      </>
                    )}
                    <div className={styles.arraySettings}>
                      <span className={styles.objectFieldLabel}>배치 방식</span>
                      <div
                        className={styles.placementMode}
                        role="group"
                        aria-label="물품 배치 방식"
                      >
                        <button
                          type="button"
                          aria-pressed={placementMode === 'single'}
                          onClick={() => selectPlacementMode('single')}
                        >
                          한 개씩
                        </button>
                        <button
                          type="button"
                          aria-pressed={placementMode === 'array'}
                          onClick={() => selectPlacementMode('array')}
                        >
                          여러 개 배열
                        </button>
                      </div>
                      {placementMode === 'array' && (
                        <>
                          <div className={styles.arrayFields}>
                            <ObjectArrayInput
                              label="가로 개수"
                              value={objectArray.columns}
                              min={1}
                              max={Math.floor(100 / objectArray.rows)}
                              step={1}
                              onCommit={(columns) => updateObjectArray({ columns })}
                            />
                            <ObjectArrayInput
                              label="세로 개수"
                              value={objectArray.rows}
                              min={1}
                              max={Math.floor(100 / objectArray.columns)}
                              step={1}
                              onCommit={(rows) => updateObjectArray({ rows })}
                            />
                            <ObjectArrayInput
                              label="가로 간격 (m)"
                              value={objectArray.gapX}
                              min={0}
                              max={20}
                              step={0.1}
                              onCommit={(gapX) => updateObjectArray({ gapX })}
                            />
                            <ObjectArrayInput
                              label="세로 간격 (m)"
                              value={objectArray.gapY}
                              min={0}
                              max={20}
                              step={0.1}
                              onCommit={(gapY) => updateObjectArray({ gapY })}
                            />
                          </div>
                          <p>
                            {objectArray.columns * objectArray.rows}개를 클릭 한 번으로 배치합니다.
                          </p>
                        </>
                      )}
                      {placementMode === 'single' && (
                        <p>도면 클릭 한 번에 물품 1개를 배치합니다.</p>
                      )}
                      <p>
                        기존 물품과 가까워지면 정렬·같은 간격·아랫줄 시작선에 자동으로 맞춰집니다.
                      </p>
                    </div>
                    <details className={styles.placementDetails}>
                      <summary>크기·모양·색상 조정</summary>
                      <ObjectAppearanceControls
                        appearance={objectPlacement}
                        idPrefix="placement"
                        onChange={setObjectPlacement}
                      />
                    </details>
                  </div>
                )}
              </InspectorSection>
              {!addingPaletteItem && (
                <InspectorSection id="my-sets" title="내 세트" initiallyOpen>
                  <div className={styles.objectSetPresets}>
                    <button
                      type="button"
                      className={styles.paletteAddButton}
                      onClick={() => setSetBuilderOpen(true)}
                    >
                      + 세트 만들기
                    </button>
                    <div className={styles.objectSetPresetList}>
                      {visibleObjectSetPresets.map((template) => (
                        <button
                          key={template.id}
                          type="button"
                          aria-pressed={selectedObjectSetId === template.id}
                          onClick={() => {
                            setObjectSet(template.id);
                            setPlacementMode('single');
                            setObjectArray(DEFAULT_OBJECT_ARRAY);
                          }}
                        >
                          <strong>{template.name}</strong>
                          <span>물품 {template.members.length}개</span>
                        </button>
                      ))}
                    </div>
                    {(project?.setTemplateIds.length ?? 0) === 0 && (
                      <p>물품을 직접 배치해 자주 쓰는 세트를 만들어 보세요.</p>
                    )}
                  </div>
                  {selectedObjectSetId && (
                    <div className={styles.paletteSettings}>
                      <h4>{selectedObjectSet?.name} 배치 설정</h4>
                      <p>세트를 도면에 놓은 뒤 구성 물품을 각각 편집할 수 있습니다.</p>
                      <div className={styles.arraySettings}>
                        <span className={styles.objectFieldLabel}>배치 방식</span>
                        <div
                          className={styles.placementMode}
                          role="group"
                          aria-label="세트 배치 방식"
                        >
                          <button
                            type="button"
                            aria-pressed={placementMode === 'single'}
                            onClick={() => selectPlacementMode('single')}
                          >
                            한 개씩
                          </button>
                          <button
                            type="button"
                            aria-pressed={placementMode === 'array'}
                            onClick={() => selectPlacementMode('array')}
                          >
                            여러 개 배열
                          </button>
                        </div>
                        {placementMode === 'array' && (
                          <>
                            <div className={styles.arrayFields}>
                              <ObjectArrayInput
                                label="가로 개수"
                                value={objectArray.columns}
                                min={1}
                                max={Math.floor(maxSetInstances / objectArray.rows)}
                                step={1}
                                onCommit={(columns) => updateObjectArray({ columns })}
                              />
                              <ObjectArrayInput
                                label="세로 개수"
                                value={objectArray.rows}
                                min={1}
                                max={Math.floor(maxSetInstances / objectArray.columns)}
                                step={1}
                                onCommit={(rows) => updateObjectArray({ rows })}
                              />
                              <ObjectArrayInput
                                label="가로 간격 (m)"
                                value={objectArray.gapX}
                                min={0}
                                max={20}
                                step={0.1}
                                onCommit={(gapX) => updateObjectArray({ gapX })}
                              />
                              <ObjectArrayInput
                                label="세로 간격 (m)"
                                value={objectArray.gapY}
                                min={0}
                                max={20}
                                step={0.1}
                                onCommit={(gapY) => updateObjectArray({ gapY })}
                              />
                            </div>
                            <p>
                              {objectArray.columns * objectArray.rows}개 세트를 클릭 한 번으로
                              배치합니다.
                            </p>
                          </>
                        )}
                        {placementMode === 'single' && (
                          <p>도면 클릭 한 번에 세트 1개를 배치합니다.</p>
                        )}
                        <p>
                          기존 물품과 가까워지면 정렬·같은 간격·아랫줄 시작선에 자동으로 맞춰집니다.
                        </p>
                      </div>
                    </div>
                  )}
                </InspectorSection>
              )}
              {!addingPaletteItem && project && (
                <InspectorSection
                  id="auto-placement"
                  title="자동 배치"
                  initiallyOpen={Boolean(autoPlacementPreview)}
                >
                  <AutoPlacementPanel
                    key={`${activeFloorId}:${selectedObjectSetId ?? selectedPaletteItemId ?? 'none'}`}
                    rooms={rooms}
                    preferredRoomId={selectedRoomId}
                    source={autoPlacementSource}
                    objects={(floor?.objectIds ?? [])
                      .map((id) => objectsById[id])
                      .filter((object) => object != null)}
                    preview={autoPlacementPreview}
                    onPreview={setAutoPlacementPreview}
                    onCancel={() => setAutoPlacementPreview(null)}
                  />
                </InspectorSection>
              )}
            </section>
          )}
          {tool === 'select' && (selectedObjects.length > 0 || clipboardCount > 0) && (
            <InspectorSection id="object-actions" title="물품 작업" initiallyOpen>
              <div className={styles.objectEditSection}>
                <div className={styles.objectActions}>
                  <button
                    type="button"
                    disabled={selectedObjects.length === 0}
                    onClick={copySelectedObjects}
                  >
                    복사
                  </button>
                  <button
                    type="button"
                    disabled={clipboardCount === 0}
                    onClick={pasteCopiedObjects}
                  >
                    붙여넣기
                  </button>
                  <button
                    type="button"
                    disabled={unlockedCount === 0}
                    onClick={() => setLayoutObjectsLocked(selectedObjectIds, true)}
                  >
                    잠금
                  </button>
                  <button
                    type="button"
                    disabled={lockedCount === 0}
                    onClick={() => setLayoutObjectsLocked(selectedObjectIds, false)}
                  >
                    잠금 해제
                  </button>
                  <button
                    type="button"
                    className={styles.objectDangerButton}
                    disabled={unlockedCount === 0}
                    onClick={deleteSelectedObjects}
                  >
                    선택 삭제
                  </button>
                </div>
                {lockedCount > 0 && (
                  <p>잠긴 물품 {lockedCount}개는 이동·수정·삭제에서 제외됩니다.</p>
                )}
              </div>
            </InspectorSection>
          )}
          {tool === 'select' && selectedGroup && (
            <InspectorSection
              key={selectedGroup}
              id="group-edit"
              title={`${groupName} · ${selectedObjects.length}개 물품`}
              initiallyOpen
            >
              <div className={styles.objectEditSection}>
                <p>
                  그룹을 드래그해 이동하고 위쪽 손잡이로 회전하세요. 복제한 세트는 독립적으로
                  편집됩니다.
                </p>
                <div className={styles.objectActions}>
                  <button
                    type="button"
                    disabled={lockedCount > 0}
                    onClick={() => rotateLayoutObjectGroup(selectedGroup, -90)}
                  >
                    ↶ 90°
                  </button>
                  <button
                    type="button"
                    disabled={lockedCount > 0}
                    onClick={() => rotateLayoutObjectGroup(selectedGroup, 90)}
                  >
                    ↷ 90°
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!activeFloorId) return;
                      const ids = duplicateLayoutObjects(activeFloorId, selectedObjects, {
                        x: 0.25,
                        y: 0.25,
                      });
                      if (ids.length > 0) selectObjects(ids);
                    }}
                  >
                    그룹 복제
                  </button>
                  <button type="button" onClick={() => startGroupInternalEdit(selectedGroup)}>
                    내부 편집
                  </button>
                </div>
              </div>
            </InspectorSection>
          )}
          {tool === 'select' && editingGroupId && (
            <InspectorSection id="group-internal-edit" title="세트 내부 편집" initiallyOpen>
              <div className={styles.objectEditSection}>
                <p>
                  구성 물품을 클릭해 개별 이동·회전·크기·색상을 수정하세요. 변경은 현재 배치된
                  세트에 적용됩니다.
                </p>
                <div className={styles.objectActions}>
                  <button type="button" onClick={finishGroupInternalEdit}>
                    그룹 편집으로 돌아가기
                  </button>
                </div>
              </div>
            </InspectorSection>
          )}
          {tool === 'select' && selectedObjectIds.length > 1 && !selectedGroup && (
            <InspectorSection
              id="multi-object-info"
              title={`${selectedObjectIds.length}개 물품 선택`}
              initiallyOpen
            >
              <div className={styles.objectEditSection}>
                <p>
                  잠기지 않은 물품 하나를 드래그하면 함께 이동합니다. Shift+클릭으로 선택을 바꿀 수
                  있습니다.
                </p>
              </div>
            </InspectorSection>
          )}
          {tool === 'select' && selectedObject && !selectedGroup && (
            <InspectorSection
              key={selectedObject.id}
              id="object-edit"
              title={`${selectedObject.name} 편집${selectedObject.locked ? ' · 잠금' : ''}`}
              initiallyOpen
            >
              <div className={styles.objectEditSection}>
                <p>
                  {selectedObject.locked
                    ? '편집하려면 위의 잠금 해제를 누르세요.'
                    : '물품을 드래그해 이동하고, 위쪽 손잡이로 회전하거나 오른쪽 아래 손잡이로 크기를 바꾸세요.'}
                </p>
                {selectedObject.floorConnectionId && (
                  <p className={styles.connectionDetails}>
                    층 연결 · {floorConnectionLabel(selectedObject, floorsById)} · 위치와 모양을
                    바꾸면 모든 층에 반영됩니다.
                  </p>
                )}
                <fieldset className={styles.objectLockedFields} disabled={selectedObject.locked}>
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
                    deferColorCommit
                    onChange={(patch) => updateLayoutObject(selectedObject.id, patch)}
                  />
                  <ObjectRotationInput
                    key={`${selectedObject.id}-rotation`}
                    rotation={selectedObject.rotation}
                    onCommit={(rotation) => updateLayoutObject(selectedObject.id, { rotation })}
                  />
                </fieldset>
              </div>
            </InspectorSection>
          )}
          {tool === 'select' && selectedRoom && (
            <InspectorSection
              key={selectedRoom.id}
              id="room-edit"
              title={`${selectedRoom.name} 편집`}
              initiallyOpen
            >
              <div className={styles.roomEditSection}>
                <p>
                  방 내부를 드래그해 옮기거나, 위쪽 회전 손잡이로 돌리세요. 직각 근처에서는 90°
                  단위로 맞춰집니다.
                </p>
                <div className={styles.roomRotateActions}>
                  <button
                    type="button"
                    onClick={() =>
                      setGeometryError(
                        updateRoomVertices(
                          selectedRoom.id,
                          rotateRoomVertices(selectedRoom.vertices, -90),
                        ),
                      )
                    }
                  >
                    ↶ 90°
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setGeometryError(
                        updateRoomVertices(
                          selectedRoom.id,
                          rotateRoomVertices(selectedRoom.vertices, 90),
                        ),
                      )
                    }
                  >
                    ↷ 90°
                  </button>
                </div>
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
                      const next = resizeWall(
                        selectedRoom.vertices,
                        selectedWallIndex,
                        lengthMeters,
                      );
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
              </div>
            </InspectorSection>
          )}
          {tool !== 'object' && (
            <InspectorSection id="area-summary" title="공간 면적" initiallyOpen={tool === 'select'}>
              <div className={styles.areaSection}>
                <div className={styles.areaTotal}>
                  <span>현재 층 면적</span>
                  <strong>{formatArea(floorAreaSqm, areaUnit)}</strong>
                </div>
                <div className={styles.areaDifference}>
                  <span>전체 층 면적</span>
                  <strong>{formatArea(projectAreaSqm, areaUnit)}</strong>
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
                          {formatAreaDifference(projectAreaSqm, project.targetAreaSqm, areaUnit)}
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
              </div>
            </InspectorSection>
          )}
        </aside>
      </main>
    </div>
  );
}
