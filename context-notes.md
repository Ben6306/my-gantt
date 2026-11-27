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
