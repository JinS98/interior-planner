import { describe, expect, it } from 'vitest';
import type { LayoutObject, Room } from '../../types/layout';
import { createFloorPreviewModel } from '../preview3d/model';
import { wallPieces, DOOR_HEIGHT_METERS, WALL_HEIGHT_METERS } from '../preview3d/mesh';
import { attachedWallOpening, doorSwingSide, snapWallOpening } from './wallOpening';
import { projectSnapshot } from '../history/command';
import { LOCAL_FLOOR_ID, LOCAL_PROJECT_ID, useProjectStore } from '../../store/projectStore';

const room: Room = {
  id: 'room', floorId: 'floor', name: 'room',
  vertices: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }],
};
const door: LayoutObject = {
  id: 'door', floorId: 'floor', category: 'facility', type: 'door', name: '문',
  x: 1.55, y: -0.07, width: 0.9, height: 0.14, color: '#A9794E',
  shape: 'rectangle', rotation: 0, locked: false, wallOpening: true,
};

describe('wall openings', () => {
  it('provides a default door and stores a snapped custom doorway', () => {
    const initial = projectSnapshot(useProjectStore.getState());
    try {
      const store = useProjectStore.getState();
      expect(store.paletteItemsById.door.wallOpening).toBe(true);
      const custom = store.addPaletteItem(LOCAL_PROJECT_ID, {
        name: '넓은 통로', category: 'facility', width: 1.2, height: 0.14,
        color: '#947A63', shape: 'rectangle', wallOpening: true, wallOpeningStyle: 'passage',
      })!;
      expect(custom.wallOpening).toBe(true);
      expect(custom.wallOpeningStyle).toBe('passage');
      expect(store.createRoom(LOCAL_FLOOR_ID, room.vertices)).toBe(true);
      expect(store.createLayoutObjectArray(
        LOCAL_FLOOR_ID, custom.id, [{ x: 2, y: 1 }], custom,
        { columns: 1, rows: 1, gapX: 0, gapY: 0 },
      )).toBe(false);
      expect(store.createLayoutObjectArray(
        LOCAL_FLOOR_ID, custom.id, [{ x: 2, y: 0 }], custom,
        { columns: 1, rows: 1, gapX: 0, gapY: 0 },
      )).toBe(true);
      const floor = useProjectStore.getState().floorsById[LOCAL_FLOOR_ID];
      const objectId = floor.objectIds[0];
      expect(useProjectStore.getState().objectsById[objectId].wallOpening).toBe(true);
      expect(useProjectStore.getState().objectsById[objectId].wallOpeningStyle).toBe('passage');
      expect(store.updateLayoutObject(objectId, { y: 0.2 })).toBe(false);
      expect(store.moveLayoutObjects([objectId], { x: 0, y: 0.2 })).toBe(false);
      expect(store.updateLayoutObject(objectId, { width: 1.4 })).toBe(true);
      const resized = useProjectStore.getState().objectsById[objectId];
      expect(resized.x + resized.width / 2).toBeCloseTo(2);
      expect(attachedWallOpening(resized, createFloorPreviewModel([room]).walls)).not.toBeNull();
      const copies = store.duplicateLayoutObjects(LOCAL_FLOOR_ID, [resized], { x: 0.25, y: 0.25 });
      expect(copies).toHaveLength(1);
      expect(attachedWallOpening(
        useProjectStore.getState().objectsById[copies[0]], createFloorPreviewModel([room]).walls,
      )).not.toBeNull();
    } finally {
      useProjectStore.getState().replaceProjectData(initial);
    }
  });

  it('snaps the opening center and angle to the closest wall and rejects distant clicks', () => {
    const viewport = { x: 0, y: 0, scale: 80 };
    const horizontal = snapWallOpening({ x: 160, y: 5 }, viewport, [room], 0.9);
    expect(horizontal?.center).toEqual({ x: 2, y: 0 });
    expect(horizontal?.rotation).toBeCloseTo(0);
    const vertical = snapWallOpening({ x: 317, y: 120 }, viewport, [room], 0.9);
    expect(vertical?.center).toEqual({ x: 4, y: 1.45 });
    expect(vertical?.snapKind).toBe('grid');
    expect(Math.abs(vertical!.rotation)).toBeCloseTo(90);
    const corner = snapWallOpening({ x: 0, y: 0 }, viewport, [room], 0.9);
    expect(corner?.center).toEqual({ x: 0.45, y: 0 });
    expect(corner?.snapKind).toBe('vertex');
    const divided = [
      { ...room, id: 'left', vertices: [
        { x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 3 }, { x: 0, y: 3 },
      ] },
      { ...room, id: 'right', vertices: [
        { x: 2, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 2, y: 3 },
      ] },
    ];
    const partitionCorner = snapWallOpening({ x: 160, y: 0 }, viewport, divided, 0.9);
    expect(partitionCorner?.center.x).toBeCloseTo(2.45);
    expect(partitionCorner?.snapKind).toBe('vertex');
    expect(snapWallOpening({ x: 160, y: 120 }, viewport, [room], 0.9)).toBeNull();
    expect(snapWallOpening({ x: 160, y: 5 }, viewport, [room], 5)).toBeNull();
  });

  it('cuts only the attached wall below the lintel and closes the gap when moved away', () => {
    const model = createFloorPreviewModel([room]);
    const attachment = attachedWallOpening(door, model.walls);
    expect(attachment).not.toBeNull();
    const pieces = wallPieces(model, [door]);
    expect(pieces).toHaveLength(6);
    const lintel = pieces.find((piece) => piece.bottom === DOOR_HEIGHT_METERS)!;
    expect(Math.hypot(lintel.end.x - lintel.start.x, lintel.end.y - lintel.start.y))
      .toBeCloseTo(door.width);
    expect(lintel.height).toBeCloseTo(WALL_HEIGHT_METERS - DOOR_HEIGHT_METERS);
    expect(wallPieces(model, [{ ...door, y: 1 }])).toHaveLength(4);
    expect(wallPieces(model, [{ ...door, rotation: 90 }])).toHaveLength(4);
  });

  it('merges overlapping doorway spans on the same wall', () => {
    const model = createFloorPreviewModel([room]);
    const pieces = wallPieces(model, [door, { ...door, id: 'door-2', x: 2 }]);
    expect(pieces).toHaveLength(6);
    expect(pieces.filter((piece) => piece.bottom === DOOR_HEIGHT_METERS)).toHaveLength(1);
  });

  it('opens a shared wall between divided rooms only once', () => {
    const left = { ...room, id: 'left', vertices: [
      { x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 3 }, { x: 0, y: 3 },
    ] };
    const right = { ...room, id: 'right', vertices: [
      { x: 2, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 3 }, { x: 2, y: 3 },
    ] };
    const model = createFloorPreviewModel([left, right]);
    const sharedDoor = { ...door, x: 2 - door.width / 2, y: 1.5 - door.height / 2, rotation: 90 };
    const lintels = wallPieces(model, [sharedDoor]).filter((piece) => piece.bottom === DOOR_HEIGHT_METERS);
    expect(lintels).toHaveLength(1);
    expect(lintels[0].start.x).toBeCloseTo(2);
    expect(lintels[0].end.x).toBeCloseTo(2);
    expect(doorSwingSide(sharedDoor, [left, right])).toBe(-1);
  });

  it('keeps a slightly sloped wall angle when editing a door', () => {
    const initial = projectSnapshot(useProjectStore.getState());
    try {
      const sloped = { ...room, vertices: [
        { x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4.1, y: 2 }, { x: 0, y: 2 },
      ] };
      const store = useProjectStore.getState();
      expect(store.createRoom(LOCAL_FLOOR_ID, sloped.vertices)).toBe(true);
      const item = store.paletteItemsById.door;
      const viewport = { x: 0, y: 0, scale: 80 };
      const snap = snapWallOpening({ x: 4.05 * 80, y: 80 }, viewport, [sloped], item.width)!;
      expect(snap.rotation).toBeGreaterThan(85);
      expect(snap.rotation).toBeLessThan(90);
      expect(store.createLayoutObjectArray(
        LOCAL_FLOOR_ID, item.id, [snap.center], item,
        { columns: 1, rows: 1, gapX: 0, gapY: 0 }, snap.rotation,
      )).toBe(true);
      const id = useProjectStore.getState().floorsById[LOCAL_FLOOR_ID].objectIds[0];
      const original = useProjectStore.getState().objectsById[id];
      expect(store.updateLayoutObject(id, { x: original.x + 0.005 })).toBe(true);
      expect(useProjectStore.getState().objectsById[id].rotation).toBeCloseTo(snap.rotation);
    } finally {
      useProjectStore.getState().replaceProjectData(initial);
    }
  });

  it('opens exterior doors away from the room on either side of the floor', () => {
    expect(doorSwingSide(door, [room])).toBe(-1);
    expect(doorSwingSide({ ...door, y: 3 - door.height / 2 }, [room])).toBe(1);
  });
});
