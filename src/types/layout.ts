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

export type ObjectShape = 'rectangle' | 'circle' | 'triangle';

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
  color: string;
  shape: ObjectShape;
  rotation: number;
  locked: boolean;
  /** 같은 수직 연결 물품의 층별 인스턴스를 묶는다. */
  floorConnectionId?: string;
  fromFloorId?: string | null;
  toFloorId?: string | null;
}

export type ObjectAppearance = Pick<LayoutObject, 'width' | 'height' | 'color' | 'shape'>;

/** 팔레트 항목은 프로젝트에 속하며, 배치된 오브젝트는 당시 속성을 별도로 보관한다. */
export interface PaletteItem extends ObjectAppearance {
  id: string;
  projectId: string;
  name: string;
  category: LayoutObject['category'];
  builtIn: boolean;
  floorConnector?: boolean;
}

export interface Project {
  id: string;
  ownerId: string;
  name: string;
  purpose: 'residential' | 'cafe' | 'restaurant' | 'pc-cafe' | 'office' | 'other';
  targetAreaSqm: number | null;
  floorIds: string[];
  paletteItemIds: string[];
  schemaVersion: 1;
  updatedAt: string;
}
