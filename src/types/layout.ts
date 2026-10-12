/** 모든 도면 좌표와 길이는 미터 단위로 저장한다. */
export interface Point {
  x: number;
  y: number;
}

export interface Viewport {
  /** 화면 좌측 상단에서 도면 원점까지의 CSS 픽셀 거리 */
  x: number;
  y: number;
  /** CSS 픽셀 / 미터 */
  scale: number;
}

export interface Room {
  id: string;
  floorId: string;
  name: string;
  vertices: Point[];
}

export interface Floor {
  id: string;
  projectId: string;
  name: string;
  roomIds: string[];
  objectIds: string[];
}

export interface LayoutObject {
  id: string;
  floorId: string;
  category: 'furniture' | 'electronics' | 'facility' | 'commercial';
  type: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  locked: boolean;
}

export interface Project {
  id: string;
  ownerId: string;
  name: string;
  purpose: 'residential' | 'cafe' | 'restaurant' | 'pc-cafe' | 'office' | 'other';
  targetAreaSqm: number | null;
  floorIds: string[];
  schemaVersion: 1;
  updatedAt: string;
}
