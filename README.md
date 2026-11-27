# 간트 차트

Vite + Vanilla JS + [frappe-gantt](https://github.com/frappe/gantt)로 만든 개인용 간트차트입니다. 백엔드 없이 브라우저에서만 동작하고, 데이터는 localStorage에 자동 저장됩니다.

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
- 모든 변경은 즉시 localStorage(`my-gantt:tasks`)에 저장

## 파일 구조

```
index.html            화면 뼈대와 모달 마크업
src/
  main.js             상태 관리, 차트 생성, 목록·모달 연결
  taskList.js         왼쪽 태스크 목록 렌더링
  taskModal.js        추가/수정 모달 폼과 검증
  confirmDialog.js    삭제·초기화 확인 모달
  storage.js          localStorage 저장/불러오기
  sampleTasks.js      저장된 데이터가 없을 때 쓰는 샘플
  utils.js            날짜·이스케이프·의존성 문자열 헬퍼
  style.css           레이아웃과 frappe-gantt 테마
```

## 데이터 형식

```js
{ id: "2", name: "요구사항 정리", start: "2026-12-04", end: "2026-12-10", progress: 20, dependencies: "1" }
```

`dependencies`는 선행 태스크 id를 쉼표로 이은 문자열입니다(예: `"1, 3"`, 없으면 `""`).
