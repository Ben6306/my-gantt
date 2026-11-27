// 저장된 데이터가 없을 때 보여줄 샘플 태스크 데이터
export const sampleTasks = [
  { id: '1', name: 'Project planning', start: '2026-12-01', end: '2026-12-05', progress: 40, dependencies: '', color: 'purple' },
  { id: '2', name: 'Requirements', start: '2026-12-04', end: '2026-12-10', progress: 20, dependencies: '1', color: 'blue' },
  { id: '3', name: 'Design', start: '2026-12-08', end: '2026-12-15', progress: 0, dependencies: '2', color: 'pink' },
  { id: '4', name: 'Development', start: '2026-12-12', end: '2026-12-28', progress: 0, dependencies: '3', color: 'green' },
  { id: '5', name: 'Testing and launch', start: '2026-12-26', end: '2026-12-31', progress: 0, dependencies: '4', color: 'orange' },
];
