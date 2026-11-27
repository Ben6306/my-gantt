// 첫 실행 시 보여줄 간트 샘플 태스크 데이터
export const sampleTasks = [
  { id: 't1', name: '요구사항 분석', start: '2026-11-23', end: '2026-11-27', progress: 100 },
  { id: 't2', name: 'UI/UX 디자인', start: '2026-11-30', end: '2026-12-08', progress: 60, dependencies: ['t1'] },
  { id: 't3', name: '데이터베이스 설계', start: '2026-11-30', end: '2026-12-04', progress: 80, dependencies: ['t1'] },
  { id: 't4', name: '프론트엔드 개발', start: '2026-12-09', end: '2026-12-22', progress: 10, dependencies: ['t2'] },
  { id: 't5', name: '백엔드 API 개발', start: '2026-12-07', end: '2026-12-22', progress: 20, dependencies: ['t3'] },
  { id: 't6', name: '통합 테스트', start: '2026-12-23', end: '2026-12-29', progress: 0, dependencies: ['t4', 't5'] },
  { id: 't7', name: '배포 및 오픈', start: '2026-12-30', end: '2026-12-31', progress: 0, dependencies: ['t6'] },
];
