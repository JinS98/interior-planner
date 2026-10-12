# Interior Planner

[멀티플로어 인테리어 플래너 기획서](https://app.notion.com/p/3ddc883fa202819abe0fdb71a2bb952d)를 바탕으로 만든 React + TypeScript 에디터 시작 프로젝트입니다.

## 시작하기

Node.js 20.19 이상 또는 22.12 이상에서 실행합니다. 패키지 설치에는 npm 레지스트리 접속이 필요합니다.

```bash
npm install
npm run dev
```

브라우저에서 터미널에 표시된 로컬 주소를 엽니다. `npm run build`, `npm run lint`, `npm run test`로 확인할 수 있습니다.

## 현재 구현된 내용

- Vite, React, TypeScript, SCSS Module, Zustand, ESLint, Prettier, Vitest 설정
- 에디터 레이아웃과 1m 간격 Grid
- 휠 확대·축소: 마우스 위치를 기준으로 확대
- Space + 왼쪽 드래그, 이동 도구 + 왼쪽 드래그, 가운데 버튼 드래그로 Pan
- 화면 초기화, 좌표 표시, World ↔ Screen 변환 및 Polygon 면적 계산 유틸리티
- 임시 에디터 상태와 저장 대상 프로젝트 상태의 분리된 Store

**진행 상태:** 1일차 기반 구현. 공간 그리기, 가구 편집, Undo/Redo, Firebase 저장은 아직 연결되지 않았습니다. 화면의 저장 버튼은 의도적으로 비활성입니다.

## 디렉터리

```text
docs/                 일별 일정과 아키텍처 결정
src/components/editor/ 에디터 화면과 Grid 상호작용
src/pages/            화면 구성
src/domain/geometry/  렌더러에 의존하지 않는 좌표·면적 계산
src/store/            에디터 임시 상태와 프로젝트 데이터
src/types/            저장 데이터의 기본 타입
```

이후 기능은 `src/features/room`, `src/features/object`, `src/features/history`, `src/features/floor`, `src/services` 순서로 추가합니다. 빈 폴더는 미리 만들지 않았습니다.

## 데이터 및 좌표 규약

- World 좌표, 위치, 길이는 **미터**, 면적은 **㎡**로 저장합니다. 평은 표시할 때만 변환합니다.
- Viewport의 `x`, `y`는 화면 좌상단을 기준으로 한 도면 원점의 CSS 픽셀 위치이고 `scale`은 픽셀/미터입니다.
- `editorStore`는 선택, 도구, Viewport처럼 저장하지 않는 상태를 소유합니다.
- `projectStore`는 향후 Firestore에 저장할 정규화된 프로젝트/층/공간/오브젝트 데이터를 소유합니다.
- 드래그 중 임시 변경과 Undo/Redo는 후속 작업에서 Command 계층으로 구현합니다.

자세한 진행 순서는 [docs/ROADMAP.md](docs/ROADMAP.md), 구조 결정은 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)에 있습니다.
