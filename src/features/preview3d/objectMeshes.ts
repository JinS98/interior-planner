import * as THREE from 'three';
import type { LayoutObject, Room } from '../../types/layout';
import { DOOR_OPEN_ANGLE_DEGREES, doorSwingSide } from '../object/wallOpening';
import { DOOR_HEIGHT_METERS, WALL_HEIGHT_METERS } from './mesh';

/** Until objects have their own height field, every 3D preview uses this height. */
export const DEFAULT_OBJECT_HEIGHT_METERS = 0.75;

function objectGeometry(object: LayoutObject, heightMeters: number): THREE.BufferGeometry {
  const { width, height } = object;
  if (object.shape === 'circle') {
    const geometry = new THREE.CylinderGeometry(0.5, 0.5, heightMeters, 48);
    geometry.scale(width, 1, height);
    return geometry;
  }
  if (object.shape === 'triangle') {
    // The 2D triangle points toward decreasing y. Shape y becomes -world z.
    const outline = new THREE.Shape();
    outline.moveTo(0, height / 2);
    outline.lineTo(width / 2, -height / 2);
    outline.lineTo(-width / 2, -height / 2);
    outline.closePath();
    const geometry = new THREE.ExtrudeGeometry(outline, {
      depth: heightMeters,
      bevelEnabled: false,
    });
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(0, -heightMeters / 2, 0);
    return geometry;
  }
  return new THREE.BoxGeometry(width, heightMeters, height);
}

/** The 2D object's top-left (x, y) maps to the same X/Z footprint in 3D. */
export function createObjectMeshes(objects: LayoutObject[], rooms: Room[] = []): THREE.Group {
  const group = new THREE.Group();
  for (const object of objects) {
    if (object.wallOpening && object.wallOpeningStyle === 'passage') continue;
    const floorConnector = Boolean(object.floorConnectionId);
    if (object.wallOpening) {
      const side = doorSwingSide(object, rooms);
      const angle = (object.rotation * Math.PI) / 180;
      const leafWidth = Math.max(0.06, object.width - 0.06);
      const hinge = new THREE.Group();
      hinge.position.set(
        object.x + object.width / 2 - Math.cos(angle) * (object.width / 2 - 0.03),
        0,
        object.y + object.height / 2 - Math.sin(angle) * (object.width / 2 - 0.03),
      );
      hinge.rotation.y = -angle - (side * DOOR_OPEN_ANGLE_DEGREES * Math.PI) / 180;
      hinge.userData = {
        kind: 'object', objectId: object.id, name: object.name,
        floorConnector, wallOpening: true, swingSide: side,
      };
      const leaf = new THREE.Mesh(
        new THREE.BoxGeometry(leafWidth, DOOR_HEIGHT_METERS, 0.04),
        new THREE.MeshStandardMaterial({ color: object.color, roughness: 0.7 }),
      );
      leaf.position.set(leafWidth / 2, DOOR_HEIGHT_METERS / 2, 0);
      leaf.userData = { kind: 'door-leaf' };
      hinge.add(leaf);
      for (const face of [-1, 1]) {
        const handle = new THREE.Mesh(
          new THREE.SphereGeometry(0.025, 8, 8),
          new THREE.MeshStandardMaterial({ color: 0xd8b777, metalness: 0.55, roughness: 0.35 }),
        );
        handle.position.set(leafWidth * 0.85, 1.02, face * 0.035);
        hinge.add(handle);
      }
      group.add(hinge);
      continue;
    }
    const heightMeters = object.wallOpening
      ? DOOR_HEIGHT_METERS
      : floorConnector ? WALL_HEIGHT_METERS : DEFAULT_OBJECT_HEIGHT_METERS;
    const mesh = new THREE.Mesh(
      objectGeometry(object, heightMeters),
      new THREE.MeshStandardMaterial({
        color: object.color,
        roughness: 0.82,
        transparent: floorConnector && !object.wallOpening,
        opacity: floorConnector && !object.wallOpening ? 0.82 : 1,
      }),
    );
    mesh.position.set(object.x + object.width / 2, heightMeters / 2, object.y + object.height / 2);
    // SVG's positive rotation is clockwise on its y-down plane.
    mesh.rotation.y = (-object.rotation * Math.PI) / 180;
    mesh.userData = { kind: 'object', objectId: object.id, name: object.name, floorConnector, wallOpening: Boolean(object.wallOpening) };
    group.add(mesh);
  }
  return group;
}

export function disposeObjectMeshes(group: THREE.Group): void {
  group.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.geometry.dispose();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((material) => material.dispose());
  });
}
