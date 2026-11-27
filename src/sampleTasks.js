// 저장된 데이터가 없을 때 보여줄 샘플 태스크 데이터
export const sampleTasks = [
  { id: '1', name: '프로젝트 기획', start: '2026-12-01', end: '2026-12-05', progress: 40, dependencies: '' },
  { id: '2', name: '요구사항 정리', start: '2026-12-04', end: '2026-12-10', progress: 20, dependencies: '1' },
  { id: '3', name: '디자인 작업', start: '2026-12-08', end: '2026-12-15', progress: 0, dependencies: '2' },
  { id: '4', name: '개발', start: '2026-12-12', end: '2026-12-28', progress: 0, dependencies: '3' },
  { id: '5', name: '테스트 및 배포', start: '2026-12-26', end: '2026-12-31', progress: 0, dependencies: '4' },
];
