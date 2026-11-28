// 프로젝트 목록과 화면 설정을 로컬스토리지에 저장하고 불러오는 모듈
const PROJECTS_KEY = 'my-gantt:projects';
const CURRENT_KEY = 'my-gantt:current-project';
const LIST_WIDTH_KEY = 'my-gantt:list-width';
const LAST_BACKUP_KEY = 'my-gantt:last-backup';
// 프로젝트 전환 이전(한 프로젝트만 저장하던 때)의 키. 읽어서 첫 프로젝트로 옮기기만 하고, 지우지 않는다(만일을 위한 백업)
const LEGACY_TASKS_KEY = 'my-gantt:tasks';
const LEGACY_NAME_KEY = 'my-gantt:project-name';

// 스토리지를 쓸 수 없거나(사생활 보호 모드 등) 값이 깨졌으면 null
function read(key, parse = (v) => v) {
  try {
    const value = localStorage.getItem(key);
    return value === null ? null : parse(value);
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // 저장이 막혀도 화면은 계속 동작하게 둔다
  }
}

export const loadProjectsState = () => {
  const projects = read(PROJECTS_KEY, JSON.parse);
  return Array.isArray(projects) ? { projects, currentId: read(CURRENT_KEY) } : null;
};

export function saveProjectsState({ projects, currentId }) {
  write(PROJECTS_KEY, JSON.stringify(projects));
  write(CURRENT_KEY, currentId);
}

export function loadLegacyProject() {
  const tasks = read(LEGACY_TASKS_KEY, JSON.parse);
  return { tasks: Array.isArray(tasks) ? tasks : null, name: read(LEGACY_NAME_KEY) };
}

export const loadListWidth = () => read(LIST_WIDTH_KEY, Number);

export const saveListWidth = (width) => write(LIST_WIDTH_KEY, String(width));

// 마지막으로 JSON을 내보내거나 자동 저장한 시각 (헤더 백업 상태 표시용). 없으면 null
export const loadLastBackup = () => {
  const value = read(LAST_BACKUP_KEY, (v) => new Date(v));
  return value && !Number.isNaN(value.getTime()) ? value : null;
};

export const saveLastBackup = (date) => write(LAST_BACKUP_KEY, date.toISOString());
