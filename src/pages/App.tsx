import { EditorCanvas } from '../components/editor/EditorCanvas';
import { useEditorStore, type EditorTool } from '../store/editorStore';
import { useProjectStore } from '../store/projectStore';
import styles from './App.module.scss';

const tools: { id: EditorTool; label: string; icon: string; description: string }[] = [
  { id: 'select', label: '선택', icon: '↖', description: '선택 도구' },
  { id: 'room', label: '공간', icon: '▱', description: '점을 클릭해 벽 그리기' },
  { id: 'pan', label: '이동', icon: '✥', description: '도면 이동' },
];

export function App() {
  const tool = useEditorStore((state) => state.tool);
  const setTool = useEditorStore((state) => state.setTool);
  const resetViewport = useEditorStore((state) => state.resetViewport);
  const activeFloorId = useEditorStore((state) => state.activeFloorId);
  const floor = useProjectStore((state) => state.floorsById[activeFloorId ?? '']);

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
            <button type="button" onClick={resetViewport}>
              화면 초기화
            </button>
          </div>
          <EditorCanvas />
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
          <div className={styles.notice}>
            공간 도구로 점을 세 개 이상 찍고 시작점 근처를 클릭하면 방이 완성됩니다. 면적 계산은
            다음 작업에서 추가합니다.
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
