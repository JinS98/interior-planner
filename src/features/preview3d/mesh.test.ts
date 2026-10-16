import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { Room } from '../../types/layout';
import { createFloorPreviewModel } from './model';
import { createFloorMeshes, disposeFloorMeshes, WALL_HEIGHT_METERS } from './mesh';

describe('createFloorMeshes', () => {
  it('triangulates a concave floor and maps 2D y to 3D z without changing meters', () => {
    const room: Room = {
      id: 'room-1',
      floorId: 'floor-1',
      name: 'ㄱ자',
      vertices: [
        { x: -1, y: 2 },
        { x: 3, y: 2 },
        { x: 3, y: 3 },
        { x: 0, y: 3 },
        { x: 0, y: 5 },
        { x: -1, y: 5 },
      ],
    };
    const meshes = createFloorMeshes(createFloorPreviewModel([room]));
    try {
      const floor = meshes.children.find((child) => child.userData.kind === 'floor') as THREE.Mesh;
      const box = new THREE.Box3().setFromObject(floor);
      expect(box.min.x).toBeCloseTo(-1);
      expect(box.max.x).toBeCloseTo(3);
      expect(box.min.z).toBeCloseTo(2);
      expect(box.max.z).toBeCloseTo(5);
      expect(floor.geometry.getIndex()!.count / 3).toBe(4);
      expect(meshes.children.filter((child) => child.userData.kind === 'wall')).toHaveLength(6);
    } finally {
      disposeFloorMeshes(meshes);
    }
  });

  it('places a wall over its original segment and raises it vertically', () => {
    const room: Room = {
      id: 'room-1',
      floorId: 'floor-1',
      name: '사각형',
      vertices: [
        { x: 1, y: 2 },
        { x: 3, y: 2 },
        { x: 3, y: 4 },
        { x: 1, y: 4 },
      ],
    };
    const meshes = createFloorMeshes(createFloorPreviewModel([room]));
    try {
      const wall = meshes.children.find(
        (child) => child.userData.kind === 'wall' && Math.abs(child.position.x - 3) < 1e-6,
      ) as THREE.Mesh;
      expect(wall.position.toArray()).toEqual([3, WALL_HEIGHT_METERS / 2, 3]);
      expect((wall.geometry as THREE.BoxGeometry).parameters.height).toBe(WALL_HEIGHT_METERS);
    } finally {
      disposeFloorMeshes(meshes);
    }
  });
});
