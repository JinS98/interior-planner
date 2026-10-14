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
2. 렌더러와 Geometry 함수를 분리. Grid는 CSS 배경이고, 그리는 중인 Vertex/Wall과 완성된 Room 및 오브젝트는 SVG로 렌더링합니다. 대량 오브젝트 성능을 실제로 측정한 뒤 Canvas/Konva를 검토합니다.
3. Firestore 영속 데이터와 에디터 임시 상태를 분리. `projectsById`, `floorsById`, `roomsById`, `objectsById`, `paletteItemsById`로 참조를 정규화합니다.
4. Preview나 Pointer 이동 중 임시 좌표는 저장 스냅샷에 넣지 않고, Pointer 종료 시 한 번의 Command로 확정합니다. Project Store의 변경 전후 데이터로 Undo/Redo를 실행하며 기록은 최근 100개까지 유지합니다.
5. Firebase는 6일차에 연결합니다. 현재는 로컬 프로젝트와 1F를 Store에 생성하고 UI 저장 버튼은 비활성입니다. 환경 변수, 실제 Firestore 보안 규칙, 오프라인 동기화는 연결 시 확정합니다.

## 데이터 흐름 예정

`Pointer Event → 화면 좌표 → World 좌표 → Geometry 검증 → Command → Project Store → Repository → Firestore`

Pan/Zoom은 `Pointer Event → Editor Store(Viewport) → 렌더링`으로 끝나며 Firestore에 저장하지 않습니다.

공간 그리기 중인 Vertex는 Editor Store의 임시 상태에 두고, Room을 닫을 때 Project Store에 확정합니다.

Palette의 기본 항목은 책상·의자이며, 사용자가 추가한 물품의 이름·종류·기본 외형은 Project Store의 `paletteItemsById`와 프로젝트의 `paletteItemIds`에 둡니다. 선택한 항목과 배치 중 외형은 Editor Store에 두고, 미리보기는 화면에서 계산합니다. 클릭할 때 선택한 항목의 중심을 World 좌표에 맞춰 Project Store의 `objectsById`와 해당 층의 `objectIds`에 한 번 추가합니다. 배치된 오브젝트는 물품의 이름·종류·외형을 복사해 보관합니다.

가구 스냅은 현재 층의 기존 오브젝트 중심을 기준으로 가로·세로 정렬을 계산합니다. 두 오브젝트의 중심 높이가 같고 서로 떨어져 있으면 양쪽 바깥으로 같은 빈 간격이 되는 후보를 추가합니다. 화면 픽셀 기준 허용 거리로 판정하고, 미리보기와 클릭 확정에 같은 함수를 사용합니다.

각 가구는 프리셋의 기본 크기·색상·모양을 갖지만, 배치 설정으로 덮어쓸 수 있습니다. 확정한 오브젝트의 가로·세로 크기, 색상, 모양은 Project Store에 저장합니다. 선택·크기 조절 중 미리보기는 Editor Store에 두고 손잡이를 놓을 때 한 번 확정합니다. 도면 안 텍스트는 사용하지 않고 색상과 모양으로 구분하며, 이름은 Palette와 속성 패널에 표시합니다.

물품 이동은 드래그 시작 시 Viewport를 보관하고, 화면 이동량(px)을 그 배율(px/m)로 나눠 World 이동량(m)으로 바꿉니다. 이동 중에는 Editor Store에서 미리 보이며 Pointer 종료 시 X·Y 미터 좌표만 Project Store에 기록합니다. 화면 Pan 오프셋은 이동량 계산에 영향을 주지 않습니다.

선택 도구의 `Shift+클릭`은 물품 선택을 추가하거나 해제합니다. 빈 도면 드래그는 새 영역 선택, 방 위의 `Shift+드래그`는 기존 선택에 추가하는 영역 선택입니다. 영역과 회전된 물품의 Bounding Box가 닿으면 선택합니다. 다중 이동에서는 선택한 모든 물품에 동일한 World 이동량을 적용하고, 격자 교차선 또는 선택되지 않은 물품의 중심과 가까운 축을 보정합니다. 이동 미리보기와 기준선은 Editor Store에 두고, 놓을 때 Project Store에서 한 번에 좌표를 갱신합니다.

물품 복사본은 Editor Store의 실행 중 클립보드에 속성 스냅샷으로 보관합니다. 붙여넣기는 새 ID와 0.25m씩 늘어나는 이동량을 적용해 Project Store에 한 번에 추가하고 새 물품을 선택합니다. 잠금은 Project Store의 `LayoutObject.locked`에 기록하며, 변경·이동·삭제 액션에서도 잠금을 검사합니다. 여러 물품을 삭제할 때 잠긴 물품은 남깁니다. 잠긴 물품의 복사본은 새로 편집할 수 있도록 잠금 해제 상태로 생성합니다.

`src/features/history/command.ts`의 Command는 정규화된 프로젝트 데이터의 변경 전후 상태를 보관합니다. Project Store 액션이 실제로 데이터를 바꿀 때 한 Command를 추가하고 Redo 기록을 비웁니다. 드래그 중 미리보기, 선택, Viewport, 복사 클립보드는 Command에 포함하지 않습니다. 되돌리기와 다시 실행 뒤에는 존재하지 않는 선택 항목을 해제합니다. 목표 면적과 물품 색상 입력은 확정 시 한 번 Store에 전달합니다. 기록은 실행 중에만 유지하고 프로젝트 데이터를 새로 불러오면 초기화합니다.

키 조합은 `src/features/editor/shortcuts.ts`에서 편집 동작으로 해석하고 Canvas가 현재 도구·선택·제스처 상태에 따라 실행합니다. 도구 버튼에 표시하는 알파벳도 같은 매핑을 사용합니다. 입력 필드·IME 조합 중에는 편집기 단축키를 실행하지 않고, 버튼·링크에 포커스가 있으면 Space의 기본 활성화 동작을 유지합니다. 드래그 중에는 `Esc`가 미리보기를 취소하며 Undo/Redo와 도구 전환은 드래그 종료 후 사용합니다.

완성된 Room의 Vertex를 드래그할 때도 Editor Store의 미리보기 좌표로 면적과 차이를 갱신합니다. 교차·겹침·짧은 벽·면적 0 검사를 통과한 좌표만 Pointer 종료 시 Project Store에 기록합니다. 벽 길이 입력은 벽의 시작점을 고정하고 끝점을 원래 방향으로 이동시킵니다.

선택 도구에서 Room 내부를 드래그하면 화면 이동량을 현재 Scale로 나누어 모든 Vertex에 같은 World 이동량을 적용합니다. 미리보기는 Editor Store에 두고 Pointer 종료 시 Project Store에 확정합니다. 꼭짓점과 벽 선택은 내부 드래그보다 우선합니다.

분할 도구는 같은 Room 경계 위 시작점과 끝점 사이에 내부 꺾임점을 0개 이상 추가해 벽 경로를 만듭니다. 각 선분이 Room 내부를 지나고 결과 Polygon 두 개가 유효하며 면적 합계가 원래 면적과 일치할 때만 Project Store에서 한 Room을 두 Room으로 갱신합니다. 기존 Room ID는 한쪽에 남기고 새 ID를 다른 쪽에 부여하므로 공간 개수가 하나 늘어납니다. 현재는 각 Room이 독립적인 Vertex 배열을 가지며, 분할 뒤 공유 벽을 편집할 때 인접 Room 좌표를 함께 바꾸는 기능은 아직 없습니다.

공간 그리기와 분할 중 `Esc`는 Editor Store의 임시 점 배열에서 마지막 클릭 한 개만 제거합니다. 분할 경로의 첫 점까지 제거하면 분할 임시 상태가 비워집니다.

새 Vertex의 미리보기와 확정 좌표에는 같은 Snap 판정을 적용합니다. 시작점 닫기를 우선하고, 격자와 직전 Vertex 기준 수평·수직 후보가 겹치면 두 기준에 모두 맞거나 화면에서 더 가까운 후보를 선택합니다.

## 범위 경계

V1.0은 한 층의 공간 그리기, 실면적, 기본 가구 편집, Undo/Redo, 인증과 저장/복원, 배포까지입니다. 다층 연결과 상업용 그룹은 V1.1, PC Station 자동 배치는 V1.2입니다. 전문 CAD·BIM·건축 구조 계산은 대상이 아닙니다.
