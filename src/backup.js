// 태스크를 JSON 백업 파일로 만들고, 불러온 백업 파일을 검증·정규화하는 순수 함수 모음
import { fileStem, joinDeps, parseDeps, toISODate } from './utils.js';
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

// "2026-02-30"처럼 형식은 맞지만 없는 날짜도 걸러낸다
function isValidDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  return toISODate(new Date(y, m - 1, d)) === value;
}

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

  if (!isValidDate(raw.start)) throw new Error(`“${name}” has an invalid start date (expected YYYY-MM-DD).`);
  if (!isValidDate(raw.end)) throw new Error(`“${name}” has an invalid end date (expected YYYY-MM-DD).`);
  if (raw.end < raw.start) throw new Error(`“${name}” ends before it starts.`);

  const progress = Number(raw.progress ?? 0);
  if (!Number.isFinite(progress) || progress < 0 || progress > 100) {
    throw new Error(`“${name}” has a progress value outside 0–100.`);
  }

  return {
    id,
    name,
    start: raw.start,
    end: raw.end,
    progress: Math.round(progress),
    dependencies: parseDeps(raw.dependencies),
    // 색이 없거나 모르는 값이면 오류 대신 순서대로 기본 색을 준다
    color: isColorKey(raw.color) ? raw.color : colorFor(index),
  };
}

/**
 * 불러온 파일 내용을 검증해 앱에서 쓰는 형태로 바꾼다.
 * 이 앱의 백업 형식({ app, version, projectName, tasks })과 태스크 배열만 있는 JSON 둘 다 받는다.
 * 문제가 있으면 사용자에게 그대로 보여줄 영어 메시지로 Error를 던진다.
 * @returns {{ tasks: object[], projectName: string | null, droppedDeps: number }}
 *   droppedDeps는 존재하지 않는 선행 태스크라서 뺀 연결 수
 */
export function parseBackup(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('The file isn’t valid JSON. It may be damaged or not a backup file.');
  }

  const list = Array.isArray(data) ? data : data?.tasks;
  if (!Array.isArray(list)) throw new Error('No task list found. Make sure this is a backup exported from this app.');

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

  const projectName = typeof data?.projectName === 'string' && data.projectName.trim() ? data.projectName.trim() : null;

  return { tasks: result, projectName, droppedDeps };
}
