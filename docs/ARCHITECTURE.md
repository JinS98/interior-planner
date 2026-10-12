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
2. 렌더러와 Geometry 함수를 분리. Grid는 CSS 배경이고, 그리는 중인 Vertex/Wall과 완성된 Room은 SVG로 렌더링합니다. 대량 오브젝트 성능을 실제로 측정한 뒤 Canvas/Konva를 검토합니다.
3. Firestore 영속 데이터와 에디터 임시 상태를 분리. `projectsById`, `floorsById`, `roomsById`, `objectsById`로 참조를 정규화합니다.
4. Preview나 Pointer 이동 중 임시 좌표는 저장 스냅샷에 넣지 않고, Pointer 종료 시 한 번의 Command로 확정합니다. 이는 5일차 구현 과제입니다.
5. Firebase는 6일차에 연결합니다. 현재는 로컬 프로젝트와 1F를 Store에 생성하고 UI 저장 버튼은 비활성입니다. 환경 변수, 실제 Firestore 보안 규칙, 오프라인 동기화는 연결 시 확정합니다.

## 데이터 흐름 예정

`Pointer Event → 화면 좌표 → World 좌표 → Geometry 검증 → Command → Project Store → Repository → Firestore`

Pan/Zoom은 `Pointer Event → Editor Store(Viewport) → 렌더링`으로 끝나며 Firestore에 저장하지 않습니다.

공간 그리기 중인 Vertex는 Editor Store의 임시 상태에 두고, Room을 닫을 때 Project Store에 확정합니다.

완성된 Room의 Vertex를 드래그할 때도 Editor Store의 미리보기 좌표로 면적과 차이를 갱신합니다. 교차·겹침·짧은 벽·면적 0 검사를 통과한 좌표만 Pointer 종료 시 Project Store에 기록합니다. 벽 길이 입력은 벽의 시작점을 고정하고 끝점을 원래 방향으로 이동시킵니다.

선택 도구에서 Room 내부를 드래그하면 화면 이동량을 현재 Scale로 나누어 모든 Vertex에 같은 World 이동량을 적용합니다. 미리보기는 Editor Store에 두고 Pointer 종료 시 Project Store에 확정합니다. 꼭짓점과 벽 선택은 내부 드래그보다 우선합니다.

분할 도구는 같은 Room 경계 위 시작점과 끝점 사이에 내부 꺾임점을 0개 이상 추가해 벽 경로를 만듭니다. 각 선분이 Room 내부를 지나고 결과 Polygon 두 개가 유효하며 면적 합계가 원래 면적과 일치할 때만 Project Store에서 한 Room을 두 Room으로 갱신합니다. 기존 Room ID는 한쪽에 남기고 새 ID를 다른 쪽에 부여하므로 공간 개수가 하나 늘어납니다. 현재는 각 Room이 독립적인 Vertex 배열을 가지며, 분할 뒤 공유 벽을 편집할 때 인접 Room 좌표를 함께 바꾸는 기능은 아직 없습니다.

공간 그리기와 분할 중 `Esc`는 Editor Store의 임시 점 배열에서 마지막 클릭 한 개만 제거합니다. 분할 경로의 첫 점까지 제거하면 분할 임시 상태가 비워집니다.

새 Vertex의 미리보기와 확정 좌표에는 같은 Snap 판정을 적용합니다. 시작점 닫기를 우선하고, 격자와 직전 Vertex 기준 수평·수직 후보가 겹치면 두 기준에 모두 맞거나 화면에서 더 가까운 후보를 선택합니다.

## 범위 경계

V1.0은 한 층의 공간 그리기, 실면적, 기본 가구 편집, Undo/Redo, 인증과 저장/복원, 배포까지입니다. 다층 연결과 상업용 그룹은 V1.1, PC Station 자동 배치는 V1.2입니다. 전문 CAD·BIM·건축 구조 계산은 대상이 아닙니다.
