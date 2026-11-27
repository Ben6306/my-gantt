// 태스크 목록을 로컬스토리지에 저장하고 불러오는 모듈
const STORAGE_KEY = 'my-gantt:tasks';

// 저장된 값이 없거나 깨져 있거나 스토리지를 쓸 수 없으면 null을 돌려준다
export function loadTasks() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveTasks(tasks) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  } catch {
    // 사생활 보호 모드 등으로 저장이 막혀도 화면은 계속 동작하게 둔다
  }
}
