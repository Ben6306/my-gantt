# 간트 차트

Vite + Vanilla JS + [frappe-gantt](https://github.com/frappe/gantt)로 만든 개인용 간트차트입니다. 화면은 영어입니다. 백엔드 없이 브라우저에서만 동작하고, 데이터는 localStorage에 자동 저장됩니다.

**바로 쓰기**: https://ben6306.github.io/my-gantt/

## 앱으로 설치하기 (추천)

터미널 없이 아이콘을 눌러 여는 방법입니다. 한 번 열어 두면 인터넷이 없어도 실행됩니다.

- **Chrome**: https://ben6306.github.io/my-gantt/ 을 열고 주소창 오른쪽의 설치 아이콘(모니터에 ↓)을 누르거나, ⋮ 메뉴 → 전송, 저장, 공유 → 페이지를 앱으로 설치. 응용 프로그램 폴더·Launchpad에 "Gantt"가 생기고 Dock에 끌어다 둘 수 있습니다.
- **Safari** (macOS Sonoma 이상): 사이트를 열고 파일 → Dock에 추가.

데이터는 설치한 앱의 저장 공간에 따로 저장됩니다. 다른 곳(localhost, 다른 브라우저)에서 쓰던 태스크는 그쪽에서 **Export JSON** → 앱에서 **Import JSON**으로 옮기세요. Safari로 Dock에 추가한 앱은 Safari와도 저장 공간이 따로입니다.

새 버전을 배포하면 인터넷이 연결된 상태에서 앱을 열 때 자동으로 새 버전이 열립니다.

## 개발용 실행

```bash
npm install
npm run dev
```

터미널에 표시되는 주소(기본값 http://localhost:5173)를 브라우저에서 엽니다.

배포용 빌드는 `npm run build`이며 결과물은 `dist/`에 생깁니다. `npm run preview`로 빌드 결과를 미리 볼 수 있습니다.

## 기능

- 왼쪽 태스크 목록: 이름·시작일·종료일·진행률, 행마다 수정/삭제 버튼, 클릭하면 목록과 차트에서 함께 강조
- 오른쪽 간트 차트: 의존성 화살표, 드래그로 기간·진행률 변경, 일/주/월 보기
- 줌: −/+ 버튼으로 8단계(일 64·45·30·20px, 주 140·100px, 월 120·90px), "Fit"으로 전체 일정을 한 화면에
- "Export PNG": 스크롤과 상관없이 모든 태스크와 첫 태스크~마지막 태스크 기간을 지금 줌 그대로 한 장의 이미지로 저장
- 태스크 추가/수정 모달: 색상 10가지 선택, 종료일 ≥ 시작일, 진행률 0~100 정수 검증, 순환 의존 방지
- 헤더의 프로젝트 이름: 클릭해서 바로 바꿀 수 있고 자동 저장
- 헤더의 "New project" 버튼: 확인 후 모든 태스크를 지우고 이름도 초기화
- 헤더의 "Export JSON"·"Import JSON" 버튼: JSON 파일로 백업하고 복원 (아래 "백업과 복원" 참고)
- 실행 취소/다시 실행: ⌘Z / ⇧⌘Z (윈도우 Ctrl+Z / Ctrl+Y), 목록 위 화살표 버튼. 이력은 페이지를 새로고침하면 사라짐
- 목록 순서 바꾸기: 행 왼쪽 손잡이를 끌어서 옮기거나, 행을 선택하고 Alt+↑/↓. 차트 순서도 같이 바뀜
- 모든 변경은 즉시 localStorage(`my-gantt:tasks`, `my-gantt:project-name`)에 저장

## 파일 구조

```
index.html            화면 뼈대와 모달 마크업
src/
  main.js             상태 관리, 차트 생성, 목록·모달 연결
  taskList.js         왼쪽 태스크 목록 렌더링
  taskModal.js        추가/수정 모달 폼과 검증
  confirmDialog.js    삭제·초기화·불러오기 확인 모달
  backup.js           백업 파일 생성과 불러온 파일 검증
  toast.js            화면 아래 안내 메시지
  storage.js          localStorage 저장/불러오기
  sampleTasks.js      저장된 데이터가 없을 때 쓰는 샘플
  utils.js            날짜·이스케이프·의존성 문자열 헬퍼
  colors.js           태스크 색상 팔레트(키·이름)
  zoom.js             줌 단계와 화면 맞추기 계산
  timeline.js         PNG용 기간·칸·좌표·헤더 계산
  exportPng.js        PNG를 캔버스에 그려 내려받기
  history.js          실행 취소/다시 실행 이력
  style.css           레이아웃과 frappe-gantt 테마
public/
  manifest.webmanifest  설치형 웹앱(PWA) 정보
  sw.js               오프라인 실행용 서비스 워커
  favicon.svg, icons/ 탭 아이콘·앱 아이콘
scripts/
  make-icons.mjs      앱 아이콘 PNG 생성
tests/
  backup.test.js      백업 검증 테스트 (npm test)
  zoom-timeline.test.js  줌·타임라인 계산 테스트
  history-order.test.js  실행 취소 이력·순서 이동 테스트
```

## 데이터 형식

```js
{ id: "2", name: "Requirements", start: "2026-12-04", end: "2026-12-10", progress: 20, dependencies: "1", color: "blue" }
```

`dependencies`는 선행 태스크 id를 쉼표로 이은 문자열입니다(예: `"1, 3"`, 없으면 `""`).

`color`는 `purple`, `blue`, `sky`, `teal`, `green`, `yellow`, `orange`, `red`, `pink`, `gray` 중 하나입니다. 없거나 모르는 값이면 순서대로 기본 색이 들어갑니다.

## PNG 내보내기

"Export PNG"는 화면을 캡처하지 않고 태스크 데이터로 이미지를 새로 그립니다. 그래서 세로 스크롤 아래 태스크까지 모두 들어가고, 가로는 첫 태스크부터 마지막 태스크까지만 담깁니다. 지금 화면의 줌(일·주·월, 칸 너비)을 그대로 쓰므로 "Fit"을 누른 뒤 내보내면 한눈에 보는 이미지가 됩니다. 기본 2배 해상도이고, 이미지가 너무 크면 해상도를 낮추며, 그래도 크면 Week나 Month로 줄이라고 안내합니다.

## 동료와 공유하기

데이터는 각자의 브라우저에만 저장되므로, 같은 주소(https://ben6306.github.io/my-gantt/)를 열어도 동료에게 내 태스크가 보이지 않습니다. 지금은 파일을 주고받는 방식으로 공유합니다.

1. 내가 **Export JSON**을 누르면 `프로젝트이름-날짜.json` 파일이 생깁니다.
2. 파일을 메신저나 메일로 동료에게 보냅니다.
3. 동료가 같은 주소에서 **Import JSON**으로 그 파일을 고르면 태스크·색상·프로젝트 이름이 그대로 열립니다.
4. 동료가 고친 뒤 다시 **Export JSON**으로 보내 주면 내가 **Import JSON**으로 받습니다.

주의할 점:
- **한 번에 한 사람만 고치세요.** 불러오기는 합치지 않고 통째로 바꾸므로, 두 사람이 동시에 고친 뒤 주고받으면 나중에 불러온 쪽만 남습니다. "지금 누가 고치는 중"인지 정해 두는 것이 좋습니다.
- 불러오기를 잘못했으면 바로 ⌘Z(Ctrl+Z)로 되돌릴 수 있습니다. 새로고침한 뒤에는 되돌릴 수 없습니다.
- 보기만 하면 되는 사람에게는 **Export PNG** 이미지를 보내면 됩니다.

여러 사람이 실시간으로 함께 고쳐야 한다면 온라인 데이터베이스(Supabase 등)로 저장 방식을 바꾸는 작업이 필요합니다.

## 백업과 복원

데이터는 쓰는 브라우저 안에만 저장됩니다. 브라우저 데이터를 지우거나 다른 브라우저·컴퓨터로 옮기면 보이지 않으니 가끔 내보내기 해 두세요.

- **Export JSON**: `프로젝트이름-날짜.json` 파일이 다운로드 폴더에 저장됩니다. 프로젝트 이름도 함께 들어갑니다.
- **Import JSON**: 백업 파일을 고르면 확인 후 지금 태스크를 파일 내용으로 **바꿉니다**(합치지 않습니다).
- 날짜·진행률·id가 잘못된 파일은 불러오지 않고 이유를 알려 줍니다. 없는 태스크를 가리키는 선행 연결은 빼고 불러옵니다.
- 백업 형식 대신 태스크 배열만 있는 JSON도 불러올 수 있습니다.

```json
{ "app": "my-gantt", "version": 1, "exportedAt": "2026-11-28T00:00:00.000Z", "projectName": "Website launch", "tasks": [ ... ] }
```

## 배포

`master` 브랜치에 푸시하면 GitHub Actions(`.github/workflows/deploy.yml`)가 테스트와 빌드를 거쳐 GitHub Pages에 자동으로 배포합니다. 진행 상황은 저장소의 Actions 탭에서 볼 수 있습니다.

배포된 사이트와 `localhost`는 브라우저 저장 공간이 따로라서 데이터가 공유되지 않습니다. 옮기려면 한쪽에서 내보내기 한 파일을 다른 쪽에서 불러오세요.

## 앱 아이콘

`public/icons/`의 PNG는 `npm run icons`(scripts/make-icons.mjs)로 만듭니다. 로고 색·배치를 바꾸면 스크립트와 `public/favicon.svg`, `index.html`의 로고를 함께 고친 뒤 다시 실행하세요.

## 테스트

```bash
npm test
```
