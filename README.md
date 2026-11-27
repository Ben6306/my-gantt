# 간트 차트

Vite + Vanilla JS + [frappe-gantt](https://github.com/frappe/gantt)로 만든 개인용 간트차트입니다. 백엔드 없이 브라우저에서만 동작하고, 데이터는 localStorage에 자동 저장됩니다.

**바로 쓰기**: https://ben6306.github.io/my-gantt/

## 실행

```bash
npm install
npm run dev
```

터미널에 표시되는 주소(기본값 http://localhost:5173)를 브라우저에서 엽니다.

배포용 빌드는 `npm run build`이며 결과물은 `dist/`에 생깁니다. `npm run preview`로 빌드 결과를 미리 볼 수 있습니다.

## 기능

- 왼쪽 태스크 목록: 이름·시작일·종료일·진행률, 행마다 수정/삭제 버튼, 클릭하면 목록과 차트에서 함께 강조
- 오른쪽 간트 차트: 의존성 화살표, 드래그로 기간·진행률 변경, 일/주/월 보기
- 태스크 추가/수정 모달: 종료일 ≥ 시작일, 진행률 0~100 정수 검증, 순환 의존 방지
- 헤더의 "새 프로젝트" 버튼: 확인 후 모든 태스크를 지우고 빈 프로젝트로 시작
- 헤더의 "내보내기"·"불러오기" 버튼: JSON 파일로 백업하고 복원 (아래 "백업과 복원" 참고)
- 모든 변경은 즉시 localStorage(`my-gantt:tasks`)에 저장

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
  style.css           레이아웃과 frappe-gantt 테마
tests/
  backup.test.js      백업 검증 테스트 (npm test)
```

## 데이터 형식

```js
{ id: "2", name: "요구사항 정리", start: "2026-12-04", end: "2026-12-10", progress: 20, dependencies: "1" }
```

`dependencies`는 선행 태스크 id를 쉼표로 이은 문자열입니다(예: `"1, 3"`, 없으면 `""`).

## 백업과 복원

데이터는 쓰는 브라우저 안에만 저장됩니다. 브라우저 데이터를 지우거나 다른 브라우저·컴퓨터로 옮기면 보이지 않으니 가끔 내보내기 해 두세요.

- **내보내기**: `gantt-backup-날짜.json` 파일이 다운로드 폴더에 저장됩니다.
- **불러오기**: 백업 파일을 고르면 확인 후 지금 태스크를 파일 내용으로 **바꿉니다**(합치지 않습니다).
- 날짜·진행률·id가 잘못된 파일은 불러오지 않고 이유를 알려 줍니다. 없는 태스크를 가리키는 선행 연결은 빼고 불러옵니다.
- 백업 형식 대신 태스크 배열만 있는 JSON도 불러올 수 있습니다.

```json
{ "app": "my-gantt", "version": 1, "exportedAt": "2026-11-28T00:00:00.000Z", "tasks": [ ... ] }
```

## 배포

`master` 브랜치에 푸시하면 GitHub Actions(`.github/workflows/deploy.yml`)가 테스트와 빌드를 거쳐 GitHub Pages에 자동으로 배포합니다. 진행 상황은 저장소의 Actions 탭에서 볼 수 있습니다.

배포된 사이트와 `localhost`는 브라우저 저장 공간이 따로라서 데이터가 공유되지 않습니다. 옮기려면 한쪽에서 내보내기 한 파일을 다른 쪽에서 불러오세요.

## 테스트

```bash
npm test
```
