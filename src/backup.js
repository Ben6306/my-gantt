// 태스크를 JSON 백업 파일로 만들고, 불러온 백업 파일을 검증·정규화하는 순수 함수 모음
import { fileStem, isValidDate, joinDeps, parseDeps, toISODate } from './utils.js';
import { optionalFields } from './taskFields.js';
import { colorFor, isColorKey } from './colors.js';

const APP_ID = 'my-gantt';
const BACKUP_VERSION = 1;

export function buildBackup({ tasks, projectName }, now = new Date()) {
  return {
    app: APP_ID,
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    projectName,
    tasks,
  };
}

export const backupFileName = (projectName, now = new Date()) => `${fileStem(projectName)}-${toISODate(now)}.json`;

const ordinal = (n) => {
  const suffix = n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th';
  return `${n}${suffix}`;
};

function normalizeTask(raw, index) {
  const where = `The ${ordinal(index + 1)} task`;
  if (!raw || typeof raw !== 'object') throw new Error(`${where} is not in a valid format.`);

  const id = typeof raw.id === 'number' || typeof raw.id === 'string' ? String(raw.id).trim() : '';
  if (!id) throw new Error(`${where} has no id.`);

  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  if (!name) throw new Error(`${where} has no name.`);

  const extra = optionalFields(raw);
  if (!isValidDate(raw.start)) throw new Error(`“${name}” has an invalid start date (expected YYYY-MM-DD).`);
  // 마일스톤은 하루짜리라 종료일을 보지 않고 시작일로 맞춘다
  const end = extra.type === 'milestone' ? raw.start : raw.end;
  if (!isValidDate(end)) throw new Error(`“${name}” has an invalid end date (expected YYYY-MM-DD).`);
  if (end < raw.start) throw new Error(`“${name}” ends before it starts.`);

  const progress = Number(raw.progress ?? 0);
  if (!Number.isFinite(progress) || progress < 0 || progress > 100) {
    throw new Error(`“${name}” has a progress value outside 0–100.`);
  }

  return {
    id,
    name,
    start: raw.start,
    end,
    progress: Math.round(progress),
    dependencies: parseDeps(raw.dependencies),
    // 색이 없거나 모르는 값이면 오류 대신 순서대로 기본 색을 준다
    color: isColorKey(raw.color) ? raw.color : colorFor(index),
    ...extra,
  };
}

/**
 * 태스크 배열을 검증해 앱에서 쓰는 형태로 바꾼다 (JSON 백업과 CSV 불러오기가 함께 쓴다).
 * 문제가 있으면 사용자에게 그대로 보여줄 영어 메시지로 Error를 던진다.
 * @returns {{ tasks: object[], droppedDeps: number }} droppedDeps는 존재하지 않는 선행 태스크라서 뺀 연결 수
 */
export function parseTaskList(list) {
  const tasks = list.map(normalizeTask);

  const ids = new Set();
  for (const t of tasks) {
    if (ids.has(t.id)) throw new Error(`The id “${t.id}” is used more than once.`);
    ids.add(t.id);
  }

  let droppedDeps = 0;
  const result = tasks.map((t) => {
    const kept = t.dependencies.filter((d) => ids.has(d) && d !== t.id);
    droppedDeps += t.dependencies.length - kept.length;
    return { ...t, dependencies: joinDeps(kept) };
  });
  return { tasks: result, droppedDeps };
}

function readJSON(text) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('The file isn’t valid JSON. It may be damaged or not a backup file.');
  }
}

// 한 프로젝트 백업({ projectName, tasks }) 또는 태스크 배열
function parseProject(data) {
  const list = Array.isArray(data) ? data : data?.tasks;
  if (!Array.isArray(list)) throw new Error('No task list found. Make sure this is a backup exported from this app.');
  const { tasks, droppedDeps } = parseTaskList(list);
  const projectName = typeof data?.projectName === 'string' && data.projectName.trim() ? data.projectName.trim() : null;
  return { tasks, projectName, droppedDeps };
}

/**
 * 한 프로젝트 백업 파일을 검증해 앱에서 쓰는 형태로 바꾼다.
 * 이 앱의 백업 형식({ app, version, projectName, tasks })과 태스크 배열만 있는 JSON 둘 다 받는다.
 * @returns {{ tasks: object[], projectName: string | null, droppedDeps: number }}
 */
export const parseBackup = (text) => parseProject(readJSON(text));

// 모든 프로젝트를 담는 백업 (version 2). 자동 저장 파일과 "Export all projects"가 쓴다
export function buildAllBackup({ projects }, now = new Date()) {
  return {
    app: APP_ID,
    version: 2,
    exportedAt: now.toISOString(),
    projects: projects.map((p) => ({ name: p.name, tasks: p.tasks })),
  };
}

export const allBackupFileName = (now = new Date()) => `my-gantt-all-projects-${toISODate(now)}.json`;

/**
 * 어떤 백업이든(한 프로젝트, 모든 프로젝트, 태스크 배열) 프로젝트 목록으로 읽는다.
 * @returns {{ projects: { name: string | null, tasks: object[] }[], droppedDeps: number }}
 *   name이 null이면 파일에 이름이 없는 것 (부르는 쪽에서 파일 이름 등으로 채운다)
 */
export function parseAnyBackup(text) {
  const data = readJSON(text);
  if (!Array.isArray(data?.projects)) {
    const { tasks, projectName, droppedDeps } = parseProject(data);
    return { projects: [{ name: projectName, tasks }], droppedDeps };
  }
  if (!data.projects.length) throw new Error('This backup has no projects.');
  let droppedDeps = 0;
  const projects = data.projects.map((p, i) => {
    const name = typeof p?.name === 'string' && p.name.trim() ? p.name.trim() : `Project ${i + 1}`;
    try {
      const result = parseProject(p);
      droppedDeps += result.droppedDeps;
      return { name, tasks: result.tasks };
    } catch (err) {
      throw new Error(`In “${name}”: ${err.message}`);
    }
  });
  return { projects, droppedDeps };
}
