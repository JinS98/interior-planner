import { describe, expect, it } from 'vitest';
import { createEmptyProject, dataForProject, parseProjectData } from './projectData';

describe('cloud project data', () => {
  it('round-trips a project with floors, rooms, objects, and templates without editor state', () => {
    const data = createEmptyProject('owner-a', 'My plan');
    const id = Object.keys(data.projectsById)[0];
    const firstFloorId = data.projectsById[id].floorIds[0];
    const secondFloorId = 'floor-2';
    data.projectsById[id].floorIds.push(secondFloorId);
    data.floorsById[secondFloorId] = {
      id: secondFloorId,
      projectId: id,
      name: '2F',
      roomIds: ['room-2'],
      objectIds: ['object-2'],
    };
    data.roomsById['room-2'] = {
      id: 'room-2',
      floorId: secondFloorId,
      name: 'Room 2',
      vertices: [
        { x: 0, y: 0 },
        { x: 3, y: 0 },
        { x: 3, y: 3 },
      ],
    };
    data.objectsById['object-2'] = {
      id: 'object-2',
      floorId: secondFloorId,
      category: 'facility',
      type: 'stairs',
      name: 'Stairs',
      x: 1,
      y: 1,
      width: 1,
      height: 1,
      color: '#123456',
      shape: 'rectangle',
      rotation: 0,
      locked: false,
      floorConnectionId: 'connection-1',
      fromFloorId: firstFloorId,
      toFloorId: null,
    };
    data.projectsById[id].setTemplateIds.push('set-1');
    data.setTemplatesById['set-1'] = { id: 'set-1', projectId: id, name: 'Set', members: [] };
    const restored = parseProjectData(JSON.parse(JSON.stringify(data)), 'owner-a', id);
    expect(restored).toEqual(data);
    expect('historyPast' in restored).toBe(false);
    expect('viewport' in restored).toBe(false);
  });

  it('rejects another owner and missing referenced data', () => {
    const data = createEmptyProject('owner-a');
    const id = Object.keys(data.projectsById)[0];
    expect(() => parseProjectData(data, 'owner-b', id)).toThrow();
    data.floorsById[data.projectsById[id].floorIds[0]].roomIds.push('missing');
    expect(() => dataForProject(data, id)).toThrow();
  });
});
