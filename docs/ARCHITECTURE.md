# 기본 구조와 구현 기준

## 단계별 폴더

| 경로                        | 책임                                           | 추가 시점             |
| --------------------------- | ---------------------------------------------- | --------------------- |
| `src/domain/geometry`       | Polygon, 길이, 면적, Snap, 좌표 변환 순수 함수 | 1~3일차               |
| `src/types`                 | Project/Floor/Room/Object 저장 형태            | 1일차                 |
| `src/store/editorStore.ts`  | 선택, 도구, Viewport 등 임시 상태              | 1일차                 |
| `src/store/projectStore.ts` | 정규화된 저장 대상 데이터                      | 1일차부터 점진적 확장 |
| `src/components/editor`     | Grid, SVG/Canvas 렌더링, Pointer 이벤트        | 1~5일차               |
| `src/features/room`         | 공간 그리기·수정 UI 및 작업 흐름               | 2~3일차               |
| `src/features/object`       | 오브젝트 Palette·변형·Inspector                | 4일차                 |
| `src/features/history`      | Command 실행·Undo/Redo                         | 5일차                 |
| `src/services`              | Firebase 인증·Repository, DTO 변환             | 6일차                 |
| `src/features/floor`        | 층 전환·오버레이·연결                          | 8일차                 |

## 결정 사항

1. 좌표의 저장 단위는 미터로 통일. Grid 기본 간격 1m, 초기 Scale 80px/m. 확대할 때 포인터 아래 World 좌표를 고정합니다.
2. 렌더러와 Geometry 함수를 분리. 현재 Grid는 CSS 배경이고, Room/Wall은 후속 작업에서 SVG 렌더링부터 시작합니다. 대량 오브젝트 성능을 실제로 측정한 뒤 Canvas/Konva를 검토합니다.
3. Firestore 영속 데이터와 에디터 임시 상태를 분리. `projectsById`, `floorsById`, `roomsById`, `objectsById`로 참조를 정규화합니다.
4. Preview나 Pointer 이동 중 임시 좌표는 저장 스냅샷에 넣지 않고, Pointer 종료 시 한 번의 Command로 확정합니다. 이는 5일차 구현 과제입니다.
5. Firebase는 6일차에 연결합니다. 현재는 프로젝트 Store가 비어 있고 UI 저장 버튼도 비활성입니다. 환경 변수, 실제 Firestore 보안 규칙, 오프라인 동기화는 연결 시 확정합니다.

## 데이터 흐름 예정

`Pointer Event → 화면 좌표 → World 좌표 → Geometry 검증 → Command → Project Store → Repository → Firestore`

Pan/Zoom은 `Pointer Event → Editor Store(Viewport) → 렌더링`으로 끝나며 Firestore에 저장하지 않습니다.

## 범위 경계

V1.0은 한 층의 공간 그리기, 실면적, 기본 가구 편집, Undo/Redo, 인증과 저장/복원, 배포까지입니다. 다층 연결과 상업용 그룹은 V1.1, PC Station 자동 배치는 V1.2입니다. 전문 CAD·BIM·건축 구조 계산은 대상이 아닙니다.
