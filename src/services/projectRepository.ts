import {
  collection,
  doc,
  getDocFromServer,
  getDocsFromServer,
  writeBatch,
  type Firestore,
} from 'firebase/firestore';
import type { ProjectSnapshot } from '../features/history/command';
import type { Project } from '../types/layout';
import { dataForProject, parseProjectData } from './projectData';

export interface ProjectSummary {
  id: string;
  name: string;
  updatedAt: string;
}

export class ProjectRepository {
  constructor(private readonly db: Firestore) {}

  private projects(ownerId: string) {
    return collection(this.db, 'users', ownerId, 'projects');
  }

  async list(ownerId: string): Promise<ProjectSummary[]> {
    const results = await getDocsFromServer(this.projects(ownerId));
    return results.docs
      .map((item) => {
        const project = item.data() as Project;
        return { id: item.id, name: project.name, updatedAt: project.updatedAt };
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async load(ownerId: string, projectId: string): Promise<ProjectSnapshot> {
    const projectRef = doc(this.projects(ownerId), projectId);
    const payloadRef = doc(projectRef, 'data', 'current');
    const [metadata, payload] = await Promise.all([
      getDocFromServer(projectRef),
      getDocFromServer(payloadRef),
    ]);
    if (!metadata.exists() || !payload.exists()) throw new Error('프로젝트를 찾을 수 없습니다.');
    const project = metadata.data() as Project;
    if (project.id !== projectId || project.ownerId !== ownerId)
      throw new Error('프로젝트 소유자 정보가 일치하지 않습니다.');
    const data = parseProjectData(payload.data().snapshot, ownerId, projectId);
    return { ...data, projectsById: { [projectId]: project } };
  }

  async save(ownerId: string, projectId: string, state: ProjectSnapshot): Promise<void> {
    // Firestore rejects undefined nested fields; optional model fields are omitted in JSON.
    const snapshot = JSON.parse(
      JSON.stringify(dataForProject(state, projectId)),
    ) as ProjectSnapshot;
    const project = snapshot.projectsById[projectId];
    if (project.ownerId !== ownerId)
      throw new Error('다른 사용자의 프로젝트는 저장할 수 없습니다.');
    const projectRef = doc(this.projects(ownerId), projectId);
    const batch = writeBatch(this.db);
    batch.set(projectRef, project);
    batch.set(doc(projectRef, 'data', 'current'), { snapshot });
    await batch.commit();
  }
}
