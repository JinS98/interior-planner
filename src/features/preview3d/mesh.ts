import * as THREE from 'three';
import type { FloorPreviewModel } from './model';
import type { LayoutObject, Point } from '../../types/layout';
import { attachedWallOpening } from '../object/wallOpening';

export const WALL_HEIGHT_METERS = 2.8;
const WALL_THICKNESS_METERS = 0.08;
export const DOOR_HEIGHT_METERS = 2.1;

export interface WallPiece {
  start: Point;
  end: Point;
  bottom: number;
  height: number;
}

/** Split each wall at attached openings; keep a lintel above each gap. */
export function wallPieces(model: FloorPreviewModel, objects: LayoutObject[]): WallPiece[] {
  const openings = new Map<number, [number, number][]>();
  for (const object of objects) {
    const attachment = attachedWallOpening(object, model.walls);
    if (!attachment) continue;
    const index = model.walls.indexOf(attachment.wall);
    const intervals = openings.get(index) ?? [];
    intervals.push([attachment.from, attachment.to]);
    openings.set(index, intervals);
  }
  const pieces: WallPiece[] = [];
  model.walls.forEach((wall, index) => {
    const { start, end, lengthMeters } = wall;
    const pointAt = (distance: number): Point => ({
      x: start.x + ((end.x - start.x) * distance) / lengthMeters,
      y: start.y + ((end.y - start.y) * distance) / lengthMeters,
    });
    const ranges = (openings.get(index) ?? []).sort((a, b) => a[0] - b[0]);
    const merged: [number, number][] = [];
    for (const [from, to] of ranges) {
      const last = merged.at(-1);
      if (last && from <= last[1] + 1e-6) last[1] = Math.max(last[1], to);
      else merged.push([from, to]);
    }
    let cursor = 0;
    for (const [from, to] of merged) {
      if (from > cursor + 1e-6)
        pieces.push({ start: pointAt(cursor), end: pointAt(from), bottom: 0, height: WALL_HEIGHT_METERS });
      pieces.push({
        start: pointAt(from),
        end: pointAt(to),
        bottom: DOOR_HEIGHT_METERS,
        height: WALL_HEIGHT_METERS - DOOR_HEIGHT_METERS,
      });
      cursor = to;
    }
    if (lengthMeters > cursor + 1e-6)
      pieces.push({ start: pointAt(cursor), end, bottom: 0, height: WALL_HEIGHT_METERS });
  });
  return pieces;
}

/** 2D (x, y) meters map directly to 3D (x, 0, z=y) meters. */
export function createFloorMeshes(model: FloorPreviewModel, objects: LayoutObject[] = []): THREE.Group {
  const group = new THREE.Group();
  const wallMaterial = new THREE.MeshStandardMaterial({
    color: 0x89a7d9,
    roughness: 0.9,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
  });

  model.rooms.forEach((room, index) => {
    const shape = new THREE.Shape(room.vertices.map(({ x, y }) => new THREE.Vector2(x, -y)));
    const geometry = new THREE.ShapeGeometry(shape);
    geometry.rotateX(-Math.PI / 2);
    const floor = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({
        color: index % 2 === 0 ? 0xdde7fa : 0xe8eef9,
        roughness: 0.95,
        side: THREE.DoubleSide,
      }),
    );
    floor.position.y = 0.015;
    floor.userData = { kind: 'floor', roomId: room.id };
    group.add(floor);
  });

  wallPieces(model, objects).forEach(({ start, end, bottom, height }) => {
    const lengthMeters = Math.hypot(end.x - start.x, end.y - start.y);
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(lengthMeters, height, WALL_THICKNESS_METERS),
      wallMaterial,
    );
    wall.position.set((start.x + end.x) / 2, bottom + height / 2, (start.y + end.y) / 2);
    wall.rotation.y = -Math.atan2(end.y - start.y, end.x - start.x);
    wall.userData = { kind: 'wall', start, end, bottom, height };
    group.add(wall);
  });

  return group;
}

export function disposeFloorMeshes(group: THREE.Group): void {
  const materials = new Set<THREE.Material>();
  group.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry.dispose();
    const meshMaterials = Array.isArray(object.material) ? object.material : [object.material];
    meshMaterials.forEach((material) => materials.add(material));
  });
  materials.forEach((material) => material.dispose());
}
