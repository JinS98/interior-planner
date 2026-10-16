import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { LayoutObject } from '../../types/layout';
import { createFloorPreviewModel, previewContentBounds } from './model';
import { DOOR_HEIGHT_METERS, WALL_HEIGHT_METERS } from './mesh';
import {
  createObjectMeshes,
  DEFAULT_OBJECT_HEIGHT_METERS,
  disposeObjectMeshes,
} from './objectMeshes';

const baseObject: LayoutObject = {
  id: 'desk-1',
  floorId: 'floor-1',
  category: 'furniture',
  type: 'desk',
  name: 'Desk',
  x: 2,
  y: 3,
  width: 1.4,
  height: 0.7,
  color: '#D5A56D',
  shape: 'rectangle',
  rotation: 0,
  locked: false,
};

describe('3D object preview', () => {
  it('shows an open door panel at doorway height', () => {
    const group = createObjectMeshes([{ ...baseObject, wallOpening: true, width: 0.9, height: 0.14 }]);
    try {
      const hinge = group.children[0] as THREE.Group;
      const leaf = hinge.children[0] as THREE.Mesh;
      expect((leaf.geometry as THREE.BoxGeometry).parameters.height).toBe(DOOR_HEIGHT_METERS);
      expect(hinge.rotation.y).toBeCloseTo((38 * Math.PI) / 180);
      expect(hinge.userData.wallOpening).toBe(true);
      expect(hinge.userData.swingSide).toBe(-1);
      expect(hinge.position.x).toBeCloseTo(baseObject.x + 0.03);
      expect(leaf.position.x).toBeGreaterThan(0);
    } finally {
      disposeObjectMeshes(group);
    }
  });

  it('leaves a passage empty without a door panel', () => {
    const group = createObjectMeshes([{ ...baseObject, wallOpening: true, wallOpeningStyle: 'passage' }]);
    expect(group.children).toHaveLength(0);
    disposeObjectMeshes(group);
  });

  it('swings an exterior door away from the room on both opposite walls', () => {
    const room = {
      id: 'room', floorId: 'floor-1', name: 'room',
      vertices: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }],
    };
    const doors = [
      { ...baseObject, id: 'top', x: 1.55, y: -0.07, width: 0.9, height: 0.14, wallOpening: true },
      { ...baseObject, id: 'bottom', x: 1.55, y: 2.93, width: 0.9, height: 0.14, wallOpening: true },
    ];
    const group = createObjectMeshes(doors, [room]);
    try {
      group.updateMatrixWorld(true);
      const top = group.children[0] as THREE.Group;
      const bottom = group.children[1] as THREE.Group;
      expect((top.children[0] as THREE.Mesh).getWorldPosition(new THREE.Vector3()).z).toBeLessThan(0);
      expect((bottom.children[0] as THREE.Mesh).getWorldPosition(new THREE.Vector3()).z).toBeGreaterThan(3);
      expect(top.userData.swingSide).toBe(-1);
      expect(bottom.userData.swingSide).toBe(1);
    } finally {
      disposeObjectMeshes(group);
    }
  });

  it('preserves the rectangle footprint, color, and default height', () => {
    const group = createObjectMeshes([baseObject]);
    try {
      const mesh = group.children[0] as THREE.Mesh;
      const bounds = new THREE.Box3().setFromObject(mesh);
      expect(mesh.userData.objectId).toBe(baseObject.id);
      expect(mesh.position.toArray()).toEqual([2.7, DEFAULT_OBJECT_HEIGHT_METERS / 2, 3.35]);
      expect(bounds.min.x).toBeCloseTo(baseObject.x);
      expect(bounds.max.x).toBeCloseTo(baseObject.x + baseObject.width);
      expect(bounds.min.z).toBeCloseTo(baseObject.y);
      expect(bounds.max.z).toBeCloseTo(baseObject.y + baseObject.height);
      expect(bounds.min.y).toBeCloseTo(0);
      expect(bounds.max.y).toBeCloseTo(DEFAULT_OBJECT_HEIGHT_METERS);
      expect((mesh.material as THREE.MeshStandardMaterial).color.getHexString()).toBe('d5a56d');
    } finally {
      disposeObjectMeshes(group);
    }
  });

  it('uses the same clockwise rotation as the 2D object', () => {
    const rotated = { ...baseObject, rotation: 90 };
    const group = createObjectMeshes([rotated]);
    try {
      const mesh = group.children[0] as THREE.Mesh;
      const bounds = new THREE.Box3().setFromObject(mesh);
      expect(mesh.rotation.y).toBeCloseTo(-Math.PI / 2);
      expect(bounds.max.x - bounds.min.x).toBeCloseTo(rotated.height);
      expect(bounds.max.z - bounds.min.z).toBeCloseTo(rotated.width);
    } finally {
      disposeObjectMeshes(group);
    }
  });

  it.each(['circle', 'triangle'] as const)(
    'keeps the %s 2D outline and floor position',
    (shape) => {
      const object = { ...baseObject, shape };
      const group = createObjectMeshes([object]);
      try {
        const bounds = new THREE.Box3().setFromObject(group.children[0]);
        expect(bounds.min.x).toBeCloseTo(object.x);
        expect(bounds.max.x).toBeCloseTo(object.x + object.width);
        expect(bounds.min.z).toBeCloseTo(object.y);
        expect(bounds.max.z).toBeCloseTo(object.y + object.height);
        expect(bounds.min.y).toBeCloseTo(0);
        expect(bounds.max.y).toBeCloseTo(DEFAULT_OBJECT_HEIGHT_METERS);
      } finally {
        disposeObjectMeshes(group);
      }
    },
  );

  it.each(['rectangle', 'circle', 'triangle'] as const)(
    'raises any connected %s item to the full wall height',
    (shape) => {
      const object = {
        ...baseObject,
        type: 'custom-connector',
        shape,
        floorConnectionId: 'connection-1',
      };
      const group = createObjectMeshes([object]);
      try {
        const mesh = group.children[0] as THREE.Mesh;
        const bounds = new THREE.Box3().setFromObject(mesh);
        expect(bounds.min.y).toBeCloseTo(0);
        expect(bounds.max.y).toBeCloseTo(WALL_HEIGHT_METERS);
        expect(bounds.max.x - bounds.min.x).toBeCloseTo(object.width);
        expect(bounds.max.z - bounds.min.z).toBeCloseTo(object.height);
        expect(mesh.userData.floorConnector).toBe(true);
        expect((mesh.material as THREE.MeshStandardMaterial).opacity).toBeLessThan(1);
      } finally {
        disposeObjectMeshes(group);
      }
    },
  );

  it('frames rotated objects even when there is no room', () => {
    const model = createFloorPreviewModel([]);
    const bounds = previewContentBounds(model, [{ ...baseObject, rotation: 90 }]);
    expect(bounds).not.toBeNull();
    expect(bounds!.maxX - bounds!.minX).toBeCloseTo(baseObject.height);
    expect(bounds!.maxY - bounds!.minY).toBeCloseTo(baseObject.width);
    expect(previewContentBounds(model, [])).toBeNull();
  });
});
