// 태스크 목록과 프로젝트 이름을 로컬스토리지에 저장하고 불러오는 모듈
const TASKS_KEY = 'my-gantt:tasks';
const PROJECT_NAME_KEY = 'my-gantt:project-name';

// 저장된 값이 없거나 깨져 있거나 스토리지를 쓸 수 없으면 null을 돌려준다
export function loadTasks() {
  try {
    const parsed = JSON.parse(localStorage.getItem(TASKS_KEY));
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveTasks(tasks) {
  try {
    localStorage.setItem(TASKS_KEY, JSON.stringify(tasks));
  } catch {
    // 사생활 보호 모드 등으로 저장이 막혀도 화면은 계속 동작하게 둔다
  }
}

export function loadProjectName() {
  try {
    return localStorage.getItem(PROJECT_NAME_KEY);
  } catch {
    return null;
  }
}

export function saveProjectName(name) {
  try {
    localStorage.setItem(PROJECT_NAME_KEY, name);
  } catch {
    // 위와 같은 이유로 무시한다
  }
}
