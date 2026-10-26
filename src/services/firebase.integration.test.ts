/// <reference types="node" />
import { afterAll, describe, expect, it } from 'vitest';
import { initializeApp, deleteApp, type FirebaseApp } from 'firebase/app';
import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import {
  collection,
  connectFirestoreEmulator,
  doc,
  getDocFromServer,
  getDocsFromServer,
  getFirestore,
  setDoc,
} from 'firebase/firestore';
import { createEmptyProject } from './projectData';
import { ProjectRepository } from './projectRepository';
import { LOCAL_FLOOR_ID, useProjectStore } from '../store/projectStore';
import { useEditorStore } from '../store/editorStore';

const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST;
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const apps: FirebaseApp[] = [];

function session() {
  const app = initializeApp(
    { apiKey: 'demo-key', authDomain: 'localhost', projectId: 'demo-interior-planner' },
    `test-${crypto.randomUUID()}`,
  );
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${authHost}`, { disableWarnings: true });
  const db = getFirestore(app);
  const [host, port] = firestoreHost!.split(':');
  connectFirestoreEmulator(db, host, Number(port));
  return { auth, db, repository: new ProjectRepository(db) };
}

afterAll(async () => {
  await Promise.all(apps.map((app) => deleteApp(app)));
});

describe.skipIf(!firestoreHost || !authHost)('Firestore owner rules and restoration', () => {
  it('restores multiple floors and connectors after sign-out, and denies other users', async () => {
    const alice = session();
    const aliceEmail = `alice-${crypto.randomUUID()}@example.test`;
    const password = 'local-test-password';
    const aliceCredential = await createUserWithEmailAndPassword(alice.auth, aliceEmail, password);
    const ownerId = aliceCredential.user.uid;
    const data = createEmptyProject(ownerId, 'Two floors');
    const projectId = Object.keys(data.projectsById)[0];
    const firstFloorId = data.projectsById[projectId].floorIds[0];
    const secondFloorId = crypto.randomUUID();
    data.projectsById[projectId].floorIds.push(secondFloorId);
    data.floorsById[secondFloorId] = {
      id: secondFloorId,
      projectId,
      name: '2F',
      roomIds: ['room-2'],
      objectIds: ['stairs-2'],
    };
    data.roomsById['room-2'] = {
      id: 'room-2',
      floorId: secondFloorId,
      name: '위층',
      vertices: [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 4, y: 3 },
        { x: 0, y: 3 },
      ],
    };
    data.floorsById[firstFloorId].objectIds.push('stairs-1');
    for (const [id, floorId, fromFloorId, toFloorId] of [
      ['stairs-1', firstFloorId, null, secondFloorId],
      ['stairs-2', secondFloorId, firstFloorId, null],
    ] as const) {
      data.objectsById[id] = {
        id,
        floorId,
        fromFloorId,
        toFloorId,
        floorConnectionId: 'stairs-link',
        category: 'facility',
        type: 'stairs',
        name: '계단',
        x: 1,
        y: 1,
        width: 1,
        height: 1,
        color: '#123456',
        shape: 'rectangle',
        rotation: 0,
        locked: false,
      };
    }
    data.projectsById[projectId].setTemplateIds.push('set-1');
    data.setTemplatesById['set-1'] = {
      id: 'set-1',
      projectId,
      name: '카운터 세트',
      members: [],
    };

    await alice.repository.save(ownerId, projectId, data);
    expect(await alice.repository.list(ownerId)).toMatchObject([
      { id: projectId, name: 'Two floors' },
    ]);
    await signOut(alice.auth);
    await signInWithEmailAndPassword(alice.auth, aliceEmail, password);
    const restored = await alice.repository.load(ownerId, projectId);
    expect(restored).toEqual(data);
    useProjectStore.getState().createRoom(LOCAL_FLOOR_ID, [
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 2 },
      { x: 0, y: 2 },
    ]);
    useEditorStore.getState().addRoomDraftVertex({ x: 9, y: 9 });
    useProjectStore.getState().replaceProjectData(restored);
    useEditorStore.getState().openProject(projectId, firstFloorId);
    expect(useProjectStore.getState().historyPast).toEqual([]);
    expect(useEditorStore.getState().roomDraftVertices).toEqual([]);
    expect(useProjectStore.getState().objectsById['stairs-2'].fromFloorId).toBe(firstFloorId);

    const bob = session();
    await createUserWithEmailAndPassword(
      bob.auth,
      `bob-${crypto.randomUUID()}@example.test`,
      password,
    );
    await expect(bob.repository.list(ownerId)).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(bob.repository.load(ownerId, projectId)).rejects.toMatchObject({
      code: 'permission-denied',
    });
    await expect(
      setDoc(doc(bob.db, 'users', ownerId, 'projects', 'intrusion'), {
        ...data.projectsById[projectId],
        id: 'intrusion',
      }),
    ).rejects.toMatchObject({ code: 'permission-denied' });
    await signOut(bob.auth);
    await expect(
      getDocFromServer(doc(bob.db, 'users', ownerId, 'projects', projectId)),
    ).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(
      getDocsFromServer(collection(bob.db, 'users', ownerId, 'projects')),
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });
});
