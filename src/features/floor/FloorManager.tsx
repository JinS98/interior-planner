import { useState, type FormEvent } from 'react';
import { useEditorStore } from '../../store/editorStore';
import { useProjectStore } from '../../store/projectStore';
import styles from './FloorManager.module.scss';

/** 층 목록은 프로젝트 순서를 따르며 도면 편집은 활성 층의 데이터만 사용한다. */
export function FloorManager({ onFloorCreated }: { onFloorCreated?: () => void }) {
  const activeProjectId = useEditorStore((state) => state.activeProjectId);
  const activeFloorId = useEditorStore((state) => state.activeFloorId);
  const setActiveFloor = useEditorStore((state) => state.setActiveFloor);
  const project = useProjectStore((state) => state.projectsById[activeProjectId ?? '']);
  const floorsById = useProjectStore((state) => state.floorsById);
  const createFloor = useProjectStore((state) => state.createFloor);
  const renameFloor = useProjectStore((state) => state.renameFloor);
  const deleteFloor = useProjectStore((state) => state.deleteFloor);
  const [editingFloorId, setEditingFloorId] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState('');
  const [deletingFloorId, setDeletingFloorId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copyObjects, setCopyObjects] = useState(false);
  const floors = (project?.floorIds ?? []).map((id) => floorsById[id]).filter((floor) => floor);
  const editingFloor = editingFloorId ? floorsById[editingFloorId] : null;
  const deletingFloor = deletingFloorId ? floorsById[deletingFloorId] : null;

  function startEditing(floorId: string) {
    setEditingFloorId(floorId);
    setNameDraft(floorsById[floorId].name);
    setDeletingFloorId(null);
    setError(null);
  }

  function saveName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingFloorId) return;
    if (!renameFloor(editingFloorId, nameDraft)) {
      setError('층 이름은 1~40자이며 다른 층과 중복될 수 없습니다.');
      return;
    }
    setEditingFloorId(null);
    setError(null);
  }

  function confirmDelete() {
    if (!deletingFloorId) return;
    const index = floors.findIndex((floor) => floor.id === deletingFloorId);
    const fallback = floors[index + 1] ?? floors[index - 1];
    if (!deleteFloor(deletingFloorId)) return;
    if (activeFloorId === deletingFloorId && fallback) setActiveFloor(fallback.id);
    setDeletingFloorId(null);
    setEditingFloorId(null);
    setError(null);
  }

  return (
    <section className={styles.panel} aria-label="층 관리">
      <div className={styles.heading}>
        <h3>층 관리</h3>
        <span>{floors.length}개 층</span>
      </div>
      <label className={styles.copyOption}>
        <input
          type="checkbox"
          checked={copyObjects}
          onChange={(event) => setCopyObjects(event.target.checked)}
        />
        일반 물품도 함께 복제
      </label>
      <p className={styles.connectionNote}>
        층 연결 물품은 이 설정과 관계없이 새 층의 같은 위치에 표시됩니다.
      </p>
      <button
        type="button"
        className={styles.addButton}
        disabled={!project}
        onClick={() => {
          if (!project) return;
          const floor = createFloor(project.id, {
            sourceFloorId: activeFloorId ?? undefined,
            copyObjects,
          });
          if (floor) {
            setActiveFloor(floor.id);
            onFloorCreated?.();
          }
          setEditingFloorId(null);
          setDeletingFloorId(null);
          setError(null);
        }}
      >
        + 현재 층으로 새 층 추가
      </button>
      <div className={styles.list}>
        {floors.map((floor) => (
          <div className={styles.row} key={floor.id}>
            <button
              type="button"
              className={styles.floorButton}
              aria-pressed={activeFloorId === floor.id}
              onClick={() => {
                setActiveFloor(floor.id);
                setEditingFloorId(null);
                setDeletingFloorId(null);
                setError(null);
              }}
            >
              {floor.name}
            </button>
            <button
              type="button"
              className={styles.actionButton}
              aria-label={`${floor.name} 이름 변경`}
              onClick={() => startEditing(floor.id)}
            >
              이름
            </button>
            <button
              type="button"
              className={styles.actionButton}
              aria-label={`${floor.name} 삭제`}
              disabled={floors.length === 1}
              onClick={() => {
                setDeletingFloorId(floor.id);
                setEditingFloorId(null);
                setError(null);
              }}
            >
              삭제
            </button>
          </div>
        ))}
      </div>
      {editingFloor && (
        <form className={styles.form} onSubmit={saveName}>
          <label htmlFor="floor-name">{editingFloor.name} 이름 변경</label>
          <input
            id="floor-name"
            value={nameDraft}
            maxLength={40}
            autoFocus
            onChange={(event) => setNameDraft(event.target.value)}
          />
          <div className={styles.formActions}>
            <button
              type="button"
              onClick={() => {
                setEditingFloorId(null);
                setError(null);
              }}
            >
              취소
            </button>
            <button type="submit" disabled={!nameDraft.trim()}>
              저장
            </button>
          </div>
        </form>
      )}
      {deletingFloor && (
        <div className={styles.confirm} role="group" aria-label={`${deletingFloor.name} 삭제 확인`}>
          <p>
            {deletingFloor.name}의 공간과 일반 물품이 삭제됩니다. 층 연결 물품은 다른 층에 남습니다.
            되돌리기로 복원할 수 있습니다.
          </p>
          <div className={styles.formActions}>
            <button type="button" onClick={() => setDeletingFloorId(null)}>
              취소
            </button>
            <button type="button" className={styles.dangerButton} onClick={confirmDelete}>
              삭제 확인
            </button>
          </div>
        </div>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
