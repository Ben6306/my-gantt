# 작업 노트

## 계획
Vite + Vanilla JS + frappe-gantt로 간트차트 웹앱을 만든다. 요청에 "먼저 기본 구조와 샘플 데이터로 돌아가는 버전"이라고 되어 있어서 1단계는 화면 구조와 샘플 데이터 렌더링까지만 하고, 추가/수정/삭제와 로컬스토리지는 2단계로 미룬다.

## 결정 사항
- **frappe-gantt 1.2.2** (최신). v1 API는 `new Gantt(el, tasks, options)`, 이벤트는 `on_click`, `on_date_change`, `on_progress_change`.
- **CSS import**: 패키지 `exports`에 `./dist/*` 경로가 없어서 `frappe-gantt/dist/frappe-gantt.css`로는 import할 수 없다. CSS에서 `@import 'frappe-gantt'`도 해봤지만 Vite가 JS 파일로 해석해 빌드가 깨졌다. 그래서 `style.css`에서 `../node_modules/frappe-gantt/dist/frappe-gantt.css`를 상대 경로로 import한다.
- **행 맞춤**: frappe-gantt의 행 높이는 `bar_height + padding`(30 + 18 = 48px), 헤더 높이는 `upper_header_height + lower_header_height + 10`(45 + 30 + 10 = 85px). 왼쪽 목록도 같은 값을 써서 행을 맞춘다.
- **종료일**: frappe-gantt는 날짜만 있는 종료일을 그날 끝(+24시간)까지로 본다. `on_date_change`의 end는 이미 -1초가 된 값이라 날짜만 잘라 쓰면 된다.
- **한국어**: `language: 'ko'`로 날짜 헤더를 한국어로 바꾼다. 기본 팝업과 Today 버튼은 영어로 하드코딩되어 있어서 팝업은 `popup` 옵션으로 새로 만들고, Today 버튼은 끄고 직접 "오늘" 버튼을 둔다.
- 1단계부터 차트를 드래그하면 목록도 갱신되게 한다. 이게 없으면 차트와 목록이 바로 어긋나 보인다.
- **세로 스크롤 보정**: 라이브러리가 컨테이너 높이를 `grid_height`로 고정하는데, 가로 스크롤바가 그 안에서 15px을 차지해 불필요한 세로 스크롤이 생겼다. 차트 SVG가 `position: absolute`라서 CSS `height: auto`는 컨테이너를 헤더 높이로 줄여 버린다. 그래서 렌더링이 끝날 때마다(초기 렌더 포함) 호출되는 `on_view_change`에서 스크롤바 두께만큼 높이를 더한다.
- **처음 스크롤 위치**: 기본값 `scroll_to: 'today'`는 오늘 이전 태스크를 잘라서 `'start'`로 바꿨다.
- 확인 결과: 드래그하면 의존 태스크도 같이 움직이고(`move_dependencies` 기본값 true), 각각 `on_date_change`가 호출되어 목록에 반영된다.

## 2단계 — 편집 기능
- **편집 진입**: 왼쪽 목록 행 클릭, 또는 차트 막대 더블클릭(`on_double_click`). 막대 한 번 클릭은 기존처럼 정보 팝업을 띄운다.
- **모달**: 네이티브 `<dialog>` + `showModal()`. Esc와 바깥 배경 클릭으로 닫힌다. 검증은 브라우저 기본 말풍선 대신 폼 안의 한국어 에러 문구로 한다(`novalidate`).
- **삭제 확인**: `confirm()` 대신 모달 안에서 두 번 누르기("한 번 더 누르면 삭제")로 확인한다. 화면 흐름이 끊기지 않고 디자인을 맞출 수 있다.
- **삭제 시 의존성 정리**: 지운 태스크를 선행으로 두던 태스크들의 `dependencies`에서 그 id를 뺀다.
- **순환 의존 방지**: 현재 태스크에 직간접적으로 의존하는 태스크는 선행 후보에서 비활성화한다. frappe-gantt 자체는 순환이 있어도 멈추진 않지만 일정 의미가 깨진다.
- **상태 흐름**: 모든 변경은 `commit()` 한 곳을 거친다(저장 → 목록 → 차트). 드래그 변경은 차트가 이미 반영된 상태라 `redraw: false`.
- **스크롤 유지**: `gantt.refresh()`는 `scroll_to` 위치로 되돌아가서 저장할 때마다 화면이 튄다. refresh 전 `scrollLeft`를 저장했다가 복원한다. 그런데 같은 값으로 복원하면 scroll 이벤트가 안 나서 상단 월 표시(`current-upper`)가 사라지므로 scroll 이벤트를 직접 발생시킨다.
- **저장 형식**: `localStorage['my-gantt:tasks']`에 태스크 배열 JSON. 값이 없거나 깨졌으면 샘플 데이터로 시작하고, 빈 배열(`[]`)은 "사용자가 다 지운 상태"로 보고 그대로 빈 화면을 보여준다. `dependencies`는 문자열이 아니라 id 배열로 통일했다.
