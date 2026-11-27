// 태스크를 JSON 백업 파일로 만들고, 불러온 백업 파일을 검증·정규화하는 순수 함수 모음
import { joinDeps, parseDeps, toISODate } from './utils.js';

const APP_ID = 'my-gantt';
const BACKUP_VERSION = 1;

export function buildBackup(tasks, now = new Date()) {
  return {
    app: APP_ID,
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    tasks,
  };
}

export const backupFileName = (now = new Date()) => `gantt-backup-${toISODate(now)}.json`;

// "2026-02-30"처럼 형식은 맞지만 없는 날짜도 걸러낸다
function isValidDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  return toISODate(new Date(y, m - 1, d)) === value;
}

function normalizeTask(raw, index) {
  const where = `${index + 1}번째 태스크`;
  if (!raw || typeof raw !== 'object') throw new Error(`${where}의 형식이 올바르지 않습니다.`);

  const id = typeof raw.id === 'number' || typeof raw.id === 'string' ? String(raw.id).trim() : '';
  if (!id) throw new Error(`${where}에 id가 없습니다.`);

  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  if (!name) throw new Error(`${where}에 이름이 없습니다.`);

  if (!isValidDate(raw.start)) throw new Error(`‘${name}’의 시작일이 올바른 날짜(YYYY-MM-DD)가 아닙니다.`);
  if (!isValidDate(raw.end)) throw new Error(`‘${name}’의 종료일이 올바른 날짜(YYYY-MM-DD)가 아닙니다.`);
  if (raw.end < raw.start) throw new Error(`‘${name}’의 종료일이 시작일보다 빠릅니다.`);

  const progress = Number(raw.progress ?? 0);
  if (!Number.isFinite(progress) || progress < 0 || progress > 100) {
    throw new Error(`‘${name}’의 진행률이 0~100 사이 숫자가 아닙니다.`);
  }

  return { id, name, start: raw.start, end: raw.end, progress: Math.round(progress), dependencies: parseDeps(raw.dependencies) };
}

/**
 * 불러온 파일 내용을 검증해 앱에서 쓰는 태스크 배열로 바꾼다.
 * 이 앱의 백업 형식({ app, version, tasks })과 태스크 배열만 있는 JSON 둘 다 받는다.
 * 문제가 있으면 사용자에게 그대로 보여줄 한국어 메시지로 Error를 던진다.
 * @returns {{ tasks: object[], droppedDeps: number }} droppedDeps는 존재하지 않는 선행 태스크라서 뺀 연결 수
 */
export function parseBackup(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('JSON 파일을 읽을 수 없습니다. 파일이 손상되었거나 백업 파일이 아닙니다.');
  }

  const list = Array.isArray(data) ? data : data?.tasks;
  if (!Array.isArray(list)) throw new Error('태스크 목록을 찾을 수 없습니다. 이 앱에서 내보낸 백업 파일인지 확인해 주세요.');

  const tasks = list.map(normalizeTask);

  const ids = new Set();
  for (const t of tasks) {
    if (ids.has(t.id)) throw new Error(`id ‘${t.id}’가 두 번 이상 쓰였습니다.`);
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
