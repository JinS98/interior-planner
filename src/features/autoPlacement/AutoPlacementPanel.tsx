import { useRef, useState } from 'react';
import { NumericTextInput } from '../../components/inputs/NumericTextInput';
import type {
  LayoutObject,
  ObjectAppearance,
  ObjectSetTemplate,
  PaletteItem,
  Room,
} from '../../types/layout';
import { MAX_SET_PLACED_OBJECTS } from '../object/setPresets';
import { useProjectStore } from '../../store/projectStore';
import {
  createAutoPlacementPlan,
  objectsFromAutoPlacements,
  templateFromPaletteItem,
  type AutoPlacementOptions,
  type AutoPlacementSource,
} from './plan';
import type { GridPlacementCandidate } from './gridCandidates';
import styles from './AutoPlacementPanel.module.scss';

export interface AutoPlacementPreview {
  roomId: string;
  floorId: string;
  source: AutoPlacementSource;
  options: AutoPlacementOptions;
  placements: GridPlacementCandidate[];
  objects: LayoutObject[];
  truncated: boolean;
  effectiveGridStepMeters: number;
}

export type SelectedAutoPlacementSource =
  | { kind: 'set'; template: ObjectSetTemplate }
  | { kind: 'item'; item: PaletteItem; appearance: ObjectAppearance }
  | null;

const DEFAULT_OPTIONS: AutoPlacementOptions = {
  gridStepMeters: 0.5,
  minimumAisleWidthMeters: 0.8,
  wallClearanceMeters: 0,
  maxPlacements: 10,
};

export function AutoPlacementPanel({
  rooms,
  preferredRoomId,
  source,
  objects,
  preview,
  onPreview,
  onCancel,
}: {
  rooms: Room[];
  preferredRoomId: string | null;
  source: SelectedAutoPlacementSource;
  objects: LayoutObject[];
  preview: AutoPlacementPreview | null;
  onPreview: (preview: AutoPlacementPreview) => void;
  onCancel: () => void;
}) {
  const [roomId, setRoomId] = useState(
    rooms.find((room) => room.id === preferredRoomId)?.id ?? rooms[0]?.id ?? '',
  );
  const [options, setOptions] = useState<AutoPlacementOptions>(() => ({
    ...DEFAULT_OPTIONS,
    maxPlacements:
      source?.kind === 'set'
        ? Math.min(
            DEFAULT_OPTIONS.maxPlacements,
            Math.floor(MAX_SET_PLACED_OBJECTS / source.template.members.length),
          )
        : DEFAULT_OPTIONS.maxPlacements,
  }));
  const [error, setError] = useState('');
  const gridHelpDialog = useRef<HTMLDialogElement>(null);
  const applyAutoPlacements = useProjectStore((state) => state.applyAutoPlacements);
  const room = rooms.find((item) => item.id === roomId);
  const template =
    source?.kind === 'set'
      ? source.template
      : source?.kind === 'item'
        ? templateFromPaletteItem(source.item, source.appearance)
        : null;
  const maxAllowed = template
    ? Math.min(100, Math.floor(MAX_SET_PLACED_OBJECTS / template.members.length))
    : 0;
  const currentPreview = preview?.roomId === roomId ? preview : null;

  function changeOptions(patch: Partial<AutoPlacementOptions>) {
    onCancel();
    setError('');
    setOptions((current) => ({ ...current, ...patch }));
  }

  function makePreview() {
    if (!room || !template || !source) return;
    const result = createAutoPlacementPlan(room, template, objects, options);
    if (result.error) {
      setError(
        result.error === 'grid-too-dense'
          ? '격자가 너무 촘촘합니다. 격자 간격을 늘려주세요.'
          : '설정 또는 공간 형상을 확인해주세요.',
      );
      onCancel();
      return;
    }
    if (result.placements.length === 0) {
      setError('조건에 맞는 위치가 없습니다. 최소 통로 폭을 줄이거나 더 작은 물품을 선택해보세요.');
      onCancel();
      return;
    }
    const sourceRef: AutoPlacementSource =
      source.kind === 'set'
        ? { kind: 'set', id: source.template.id }
        : { kind: 'item', id: source.item.id, appearance: { ...source.appearance } };
    let index = 0;
    onPreview({
      roomId: room.id,
      floorId: room.floorId,
      source: sourceRef,
      options: { ...options },
      placements: result.placements,
      objects: objectsFromAutoPlacements(
        template,
        room.floorId,
        result.placements,
        () => `auto-preview-${index++}`,
        source.kind === 'set',
      ),
      truncated: result.truncated,
      effectiveGridStepMeters: result.effectiveGridStepMeters,
    });
    setError('');
  }

  function applyPreview() {
    if (!currentPreview) return;
    const applied = applyAutoPlacements(
      currentPreview.floorId,
      currentPreview.roomId,
      currentPreview.source,
      currentPreview.options,
      currentPreview.placements,
    );
    onCancel();
    if (!applied) setError('도면이 변경되었습니다. 미리보기를 다시 만들어주세요.');
    else setError('');
  }

  return (
    <div className={styles.panel}>
      {!source ? (
        <p>위에서 물품이나 세트를 선택하면 공간에 자동 배치할 수 있습니다.</p>
      ) : rooms.length === 0 ? (
        <p>공간 도구로 방을 먼저 만든 뒤 자동 배치할 수 있습니다.</p>
      ) : (
        <>
          <p>
            <strong>{template?.name}</strong>의 배치를 미리 확인하세요.
          </p>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>배치할 공간</span>
            <select
              value={roomId}
              onChange={(event) => {
                setRoomId(event.target.value);
                onCancel();
                setError('');
              }}
            >
              {rooms.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <div className={styles.fields}>
            <div className={styles.field}>
              <div className={styles.gridLabel}>
                <label htmlFor="auto-placement-grid-step">격자 간격 (m)</label>
                <button
                  type="button"
                  className={styles.helpButton}
                  aria-label="탐색 격자 간격 설명 보기"
                  aria-haspopup="dialog"
                  aria-controls="auto-placement-grid-help"
                  onClick={() => gridHelpDialog.current?.showModal()}
                >
                  ?
                </button>
              </div>
              <NumericTextInput
                id="auto-placement-grid-step"
                min={0}
                max={5}
                value={options.gridStepMeters}
                onCommit={(gridStepMeters) => changeOptions({ gridStepMeters })}
              />
            </div>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>최소 통로 폭 (m)</span>
              <NumericTextInput
                min={0}
                max={5}
                value={options.minimumAisleWidthMeters}
                onCommit={(minimumAisleWidthMeters) => changeOptions({ minimumAisleWidthMeters })}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>벽 여유 (m)</span>
              <NumericTextInput
                min={0}
                max={5}
                value={options.wallClearanceMeters}
                onCommit={(wallClearanceMeters) => changeOptions({ wallClearanceMeters })}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>최대 배치 수</span>
              <NumericTextInput
                min={1}
                max={maxAllowed}
                integer
                value={options.maxPlacements}
                onCommit={(maxPlacements) => changeOptions({ maxPlacements })}
              />
            </label>
          </div>
          <dialog
            ref={gridHelpDialog}
            id="auto-placement-grid-help"
            className={styles.helpDialog}
            aria-labelledby="auto-placement-grid-help-title"
            onClick={(event) => {
              if (event.target === event.currentTarget) event.currentTarget.close();
            }}
          >
            <h3 id="auto-placement-grid-help-title">탐색 격자 간격이란?</h3>
            <p>
              방 안에서 물품을 놓아 볼 <strong>후보 위치 사이의 거리</strong>입니다. 화면 배경
              격자의 크기나 물품 사이의 실제 간격을 바꾸지는 않습니다.
            </p>
            <dl>
              <dt>0m · 자동</dt>
              <dd>
                방 크기에 맞춰 탐색 간격을 정합니다. 미리보기 후 실제 사용한 간격을 표시합니다.
              </dd>
              <dt>0.1m · 촘촘하게</dt>
              <dd>
                가로·세로 10cm마다 놓아 봅니다. 후보가 많아 계산에 시간이 더 걸릴 수 있습니다.
              </dd>
              <dt>0.5m · 기본값</dt>
              <dd>50cm마다 놓아 봅니다. 속도와 위치 선택 폭의 균형을 위한 시작값입니다.</dd>
              <dt>1m · 빠르게</dt>
              <dd>1m마다 놓아 봅니다. 빠르지만 그 사이의 좋은 위치를 지나칠 수 있습니다.</dd>
            </dl>
            <p>
              후보 위치가 많아져도 배치 수가 반드시 늘지는 않습니다. 물품끼리 떨어질 거리는{' '}
              <strong>최소 통로 폭</strong>, 벽과 떨어질 거리는 <strong>벽 여유</strong>로 정합니다.
            </p>
            <button
              type="button"
              className={styles.helpClose}
              onClick={() => gridHelpDialog.current?.close()}
            >
              닫기
            </button>
          </dialog>
          {source.kind === 'item' && source.item.floorConnector && (
            <p>층 연결 물품은 적용하면 모든 층의 같은 위치에 추가됩니다.</p>
          )}
          <button
            className={styles.previewButton}
            type="button"
            onClick={makePreview}
            disabled={
              !room ||
              !template ||
              !Number.isFinite(options.gridStepMeters) ||
              options.gridStepMeters < 0 ||
              options.gridStepMeters > 5 ||
              !Number.isFinite(options.minimumAisleWidthMeters) ||
              options.minimumAisleWidthMeters < 0 ||
              options.minimumAisleWidthMeters > 5 ||
              !Number.isFinite(options.wallClearanceMeters) ||
              options.wallClearanceMeters < 0 ||
              options.wallClearanceMeters > 5 ||
              !Number.isInteger(options.maxPlacements) ||
              options.maxPlacements < 1 ||
              options.maxPlacements > maxAllowed
            }
          >
            배치 미리보기
          </button>
          {currentPreview && (
            <div className={styles.result} role="status">
              <strong>
                {currentPreview.placements.length}개 배치 · {currentPreview.objects.length}개 물품
              </strong>
              {currentPreview.options.gridStepMeters === 0 && (
                <p>자동 탐색 간격: {currentPreview.effectiveGridStepMeters}m</p>
              )}
              {currentPreview.truncated && (
                <p>방 전체를 먼저 탐색했지만 세밀한 후보 일부는 개수 제한으로 제외됐습니다.</p>
              )}
              <div className={styles.actions}>
                <button type="button" onClick={onCancel}>
                  취소
                </button>
                <button type="button" onClick={applyPreview}>
                  적용
                </button>
              </div>
            </div>
          )}
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
        </>
      )}
    </div>
  );
}
