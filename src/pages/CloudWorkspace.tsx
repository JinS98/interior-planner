import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import { FirebaseError } from 'firebase/app';
import { projectSnapshot } from '../features/history/command';
import { useEditorStore } from '../store/editorStore';
import { useProjectStore } from '../store/projectStore';
import { auth, database, firebaseConfigured } from '../services/firebase';
import { createEmptyProject } from '../services/projectData';
import { ProjectRepository, type ProjectSummary } from '../services/projectRepository';
import { AutoSave, type SaveStatus } from '../services/autoSave';
import { App } from './App';
import styles from './CloudWorkspace.module.scss';

const repository = database ? new ProjectRepository(database) : null;

interface OpenedProject {
  projectId: string;
  floorId: string;
}

function workspaceKey(userId: string) {
  return `interior-planner:opened-project:${userId}`;
}

function rememberProject(userId: string, project: OpenedProject | null) {
  try {
    const key = workspaceKey(userId);
    if (project) sessionStorage.setItem(key, JSON.stringify(project));
    else sessionStorage.removeItem(key);
  } catch {
    // The editor still works when the browser disables session storage.
  }
}

function rememberedProject(userId: string): OpenedProject | null {
  try {
    const value = sessionStorage.getItem(workspaceKey(userId));
    if (!value) return null;
    const project: unknown = JSON.parse(value);
    if (
      typeof project === 'object' &&
      project !== null &&
      'projectId' in project &&
      typeof project.projectId === 'string' &&
      'floorId' in project &&
      typeof project.floorId === 'string'
    )
      return { projectId: project.projectId, floorId: project.floorId };
  } catch {
    // An invalid or unavailable session should fall back to the project list.
  }
  return null;
}

function errorMessage(error: unknown): string {
  if (error instanceof FirebaseError) {
    switch (error.code) {
      case 'permission-denied':
        return 'Firestore 접근이 거부됐습니다. 보안 규칙을 확인하세요.';
      case 'auth/operation-not-allowed':
        return 'Firebase 콘솔에서 로그인 방식을 활성화하세요.';
      case 'auth/unauthorized-domain':
        return 'Firebase Authentication 승인된 도메인을 확인하세요.';
      case 'auth/invalid-credential':
        return '이메일 또는 비밀번호가 올바르지 않습니다.';
      case 'auth/email-already-in-use':
        return '이미 등록된 이메일입니다.';
      case 'auth/weak-password':
        return '더 긴 비밀번호를 입력하세요.';
      case 'auth/popup-closed-by-user':
        return '로그인 창이 닫혔습니다.';
      default:
        return `Firebase 오류: ${error.code}`;
    }
  }
  return error instanceof Error ? error.message : '요청을 처리하지 못했습니다.';
}

export function CloudWorkspace() {
  const [user, setUser] = useState<User | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [view, setView] = useState<'list' | 'editor' | 'restore-error'>('list');
  const [openedProjectId, setOpenedProjectId] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [newName, setNewName] = useState('새 프로젝트');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>({
    phase: 'saved',
    dirty: false,
    error: null,
  });
  const [error, setError] = useState<string | null>(null);
  const autoSaveRef = useRef<AutoSave | null>(null);

  useEffect(() => {
    if (!auth || !repository) {
      setCheckingAuth(false);
      return;
    }
    let active = true;
    let sequence = 0;
    const unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
      if (!active) return;
      const currentSequence = ++sequence;
      setUser(nextUser);
      setView('list');
      setOpenedProjectId(null);
      setSaveStatus({ phase: 'saved', dirty: false, error: null });
      setError(null);
      setProjects([]);
      setCheckingAuth(true);
      try {
        if (nextUser) {
          const previous = rememberedProject(nextUser.uid);
          if (previous) {
            try {
              const data = await repository.load(nextUser.uid, previous.projectId);
              if (active && currentSequence === sequence)
                openData(data, previous.projectId, previous.floorId);
              return;
            } catch (caught) {
              if (active && currentSequence === sequence) {
                setOpenedProjectId(previous.projectId);
                setView('restore-error');
                setError(errorMessage(caught));
              }
              return;
            }
          }
          const nextProjects = await repository.list(nextUser.uid);
          if (active && currentSequence === sequence) setProjects(nextProjects);
        }
      } catch (caught) {
        if (active && currentSequence === sequence) setError(errorMessage(caught));
      } finally {
        if (active && currentSequence === sequence) setCheckingAuth(false);
      }
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!user || !openedProjectId) return;
    return useEditorStore.subscribe((next, previous) => {
      if (
        next.activeProjectId === openedProjectId &&
        next.activeFloorId &&
        next.activeFloorId !== previous.activeFloorId
      )
        rememberProject(user.uid, { projectId: openedProjectId, floorId: next.activeFloorId });
    });
  }, [user, openedProjectId]);

  useLayoutEffect(() => {
    if (view !== 'editor' || !openedProjectId || !user || !repository) return;
    const ownerId = user.uid;
    const autoSave = new AutoSave(
      () => repository.save(ownerId, openedProjectId, projectSnapshot(useProjectStore.getState())),
      setSaveStatus,
      errorMessage,
    );
    autoSaveRef.current = autoSave;
    const unsubscribe = useProjectStore.subscribe((next, previous) => {
      const keys = [
        'projectsById',
        'floorsById',
        'roomsById',
        'objectsById',
        'paletteItemsById',
        'setTemplatesById',
      ] as const;
      if (keys.some((key) => next[key] !== previous[key])) autoSave.changed();
    });
    return () => {
      unsubscribe();
      autoSave.dispose();
      if (autoSaveRef.current === autoSave) autoSaveRef.current = null;
    };
  }, [view, openedProjectId, user]);

  useEffect(() => {
    if (!saveStatus.dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [saveStatus.dirty]);

  async function saveCurrent(): Promise<boolean> {
    if (!user || !repository || !autoSaveRef.current) return false;
    setBusy(true);
    setError(null);
    try {
      if (!(await autoSaveRef.current.flush())) return false;
      setProjects(await repository.list(user.uid));
      return true;
    } catch (caught) {
      setError(errorMessage(caught));
      return false;
    } finally {
      setBusy(false);
    }
  }

  function openData(
    data: ReturnType<typeof createEmptyProject>,
    projectId: string,
    preferredFloorId?: string,
  ) {
    const floorIds = data.projectsById[projectId].floorIds;
    const floorId =
      preferredFloorId && floorIds.includes(preferredFloorId) ? preferredFloorId : floorIds[0];
    useProjectStore.getState().replaceProjectData(data);
    useEditorStore.getState().openProject(projectId, floorId);
    rememberProject(data.projectsById[projectId].ownerId, { projectId, floorId });
    setOpenedProjectId(projectId);
    setSaveStatus({ phase: 'saved', dirty: false, error: null });
    setError(null);
    setView('editor');
  }

  async function openProject(projectId: string, preferredFloorId?: string) {
    if (!user || !repository || busy) return;
    setBusy(true);
    setError(null);
    try {
      const data = await repository.load(user.uid, projectId);
      openData(data, projectId, preferredFloorId);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function createProject(event: FormEvent) {
    event.preventDefault();
    if (!user || !repository || busy) return;
    setBusy(true);
    setError(null);
    try {
      const data = createEmptyProject(user.uid, newName);
      const projectId = Object.keys(data.projectsById)[0];
      await repository.save(user.uid, projectId, data);
      setProjects(await repository.list(user.uid));
      openData(data, projectId);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function showProjects() {
    if (busy || !(await saveCurrent())) return;
    if (user) rememberProject(user.uid, null);
    setOpenedProjectId(null);
    setView('list');
  }

  async function showProjectsAfterRestoreError() {
    if (!user || !repository || busy) return;
    setBusy(true);
    setError(null);
    try {
      const nextProjects = await repository.list(user.uid);
      rememberProject(user.uid, null);
      setProjects(nextProjects);
      setOpenedProjectId(null);
      setView('list');
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function logOut() {
    if (!auth || busy) return;
    if (view === 'editor' && !(await saveCurrent())) return;
    setBusy(true);
    try {
      await signOut(auth);
      if (user) rememberProject(user.uid, null);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function googleLogin() {
    if (!auth || busy) return;
    setBusy(true);
    setError(null);
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function emailLogin(register: boolean) {
    if (!auth || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (register) await createUserWithEmailAndPassword(auth, email, password);
      else await signInWithEmailAndPassword(auth, email, password);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  if (!firebaseConfigured)
    return (
      <div className={styles.center}>
        <section className={styles.panel}>
          <h1>Firebase 설정이 필요합니다</h1>
          <p>
            루트의 <code>.env.example</code>을 <code>.env.local</code>로 복사하고 Firebase 웹 앱
            설정값을 입력한 뒤 개발 서버를 다시 시작하세요.
          </p>
        </section>
      </div>
    );

  if (checkingAuth)
    return (
      <div className={styles.center}>
        <p>프로젝트를 불러오는 중…</p>
      </div>
    );

  if (!user)
    return (
      <div className={styles.center}>
        <section className={styles.panel}>
          <h1>Interior Planner</h1>
          <p>도면을 저장하고 다른 기기에서 다시 열려면 로그인하세요.</p>
          <button type="button" className={styles.primary} onClick={googleLogin} disabled={busy}>
            Google로 로그인
          </button>
          <div className={styles.divider}>또는 이메일</div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void emailLogin(false);
            }}
          >
            <label>
              이메일
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <label>
              비밀번호
              <input
                type="password"
                autoComplete="current-password"
                minLength={6}
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <div className={styles.row}>
              <button type="submit" disabled={busy}>
                로그인
              </button>
              <button
                type="button"
                disabled={busy || !email || password.length < 6}
                onClick={() => void emailLogin(true)}
              >
                회원가입
              </button>
            </div>
          </form>
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
        </section>
      </div>
    );

  if (view === 'restore-error')
    return (
      <div className={styles.center}>
        <section className={styles.panel}>
          <h1>작업 중인 프로젝트를 불러오지 못했습니다</h1>
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          <div className={styles.row}>
            <button
              type="button"
              className={styles.primary}
              disabled={busy || !openedProjectId}
              onClick={() =>
                openedProjectId &&
                void openProject(openedProjectId, rememberedProject(user.uid)?.floorId)
              }
            >
              다시 불러오기
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void showProjectsAfterRestoreError()}
            >
              프로젝트 목록
            </button>
          </div>
        </section>
      </div>
    );

  if (view === 'editor')
    return (
      <App
        cloud={{
          userLabel: user.displayName ?? user.email ?? '로그인됨',
          busy,
          saveStatus,
          error,
          save: () => {
            void saveCurrent();
          },
          showProjects: () => {
            void showProjects();
          },
          signOut: () => {
            void logOut();
          },
        }}
      />
    );

  return (
    <div className={styles.center}>
      <section className={styles.panel}>
        <div className={styles.row}>
          <h1>내 프로젝트</h1>
          <button type="button" onClick={() => void logOut()} disabled={busy}>
            로그아웃
          </button>
        </div>
        <p>{user.displayName ?? user.email}</p>
        <form className={styles.newProject} onSubmit={(event) => void createProject(event)}>
          <input
            aria-label="새 프로젝트 이름"
            maxLength={60}
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
          />
          <button type="submit" className={styles.primary} disabled={busy || !newName.trim()}>
            새 프로젝트 만들기
          </button>
        </form>
        <div className={styles.projectList}>
          {projects.length === 0 && <p>저장된 프로젝트가 없습니다.</p>}
          {projects.map((project) => (
            <button
              type="button"
              key={project.id}
              disabled={busy}
              onClick={() => void openProject(project.id)}
            >
              <strong>{project.name}</strong>
              <small>{new Date(project.updatedAt).toLocaleString('ko-KR')}</small>
            </button>
          ))}
        </div>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
      </section>
    </div>
  );
}
