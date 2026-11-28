// 실제 시작·종료일 기록(Start/Finish, 진행률에 따른 자동 기록)과 계획 대비 차이를 계산하는 순수 함수
import { calendarDays } from './holidays.js';

// from → to 날짜 차이(일). to가 늦으면 양수
export const dayDiff = (from, to) => (from <= to ? calendarDays(from, to) - 1 : -(calendarDays(to, from) - 1));

const minDate = (a, b) => (a <= b ? a : b);

// 오늘 시작했다고 기록 (진행률은 그대로)
export const startTask = (task, today) => ({ ...task, actualStart: today });

/**
 * 오늘 끝났다고 기록하고 진행률 100%.
 * 실제 시작이 비어 있으면 계획대로 시작했다고 본다(계획 시작일, 그게 미래면 오늘). 마일스톤은 둘 다 오늘
 */
export function finishTask(task, today) {
  if (task.type === 'milestone') return { ...task, actualStart: today, actualEnd: today, progress: 100 };
  const actualStart = task.actualStart ?? minDate(task.start, today);
  return { ...task, actualStart, actualEnd: today < actualStart ? actualStart : today, progress: 100 };
}

/**
 * 진행률이 바뀔 때 실제 날짜를 자동으로 맞춘다 (같은 id의 바뀌기 전 태스크와 비교, 새 태스크·그룹은 건드리지 않음).
 * - 실제 종료를 새로 넣었는데 100% 미만 → 100%
 * - 0%에서 처음 올렸고 실제 시작이 없으면 → 실제 시작 = 오늘
 * - 100%가 됐고 실제 종료가 없으면 → 오늘 끝남 (finishTask)
 * - 100%에서 내렸고 실제 종료를 따로 고치지 않았으면 → 실제 종료를 지움 (아직 안 끝남)
 */
export function applyActualRules(prevTasks, nextTasks, today) {
  const before = new Map(prevTasks.map((t) => [t.id, t]));
  return nextTasks.map((t) => {
    const prev = before.get(t.id);
    if (!prev || t.type === 'group') return t;
    let next = t;
    if (next.actualEnd && !prev.actualEnd && next.progress < 100) next = { ...next, progress: 100 };
    if (next.progress > 0 && prev.progress === 0 && !next.actualStart && next.type !== 'milestone') {
      next = startTask(next, today);
    }
    if (next.progress >= 100 && prev.progress < 100 && !next.actualEnd) next = finishTask(next, today);
    if (next.progress < 100 && prev.progress >= 100 && next.actualEnd && next.actualEnd === prev.actualEnd) {
      const { actualEnd, ...rest } = next;
      next = next.type === 'milestone' ? (({ actualStart, ...r }) => r)(rest) : rest;
    }
    return next;
  });
}

const days = (n) => `${Math.abs(n)} ${Math.abs(n) === 1 ? 'day' : 'days'}`;
const when = (n, word) => (n === 0 ? `${word} on time` : `${word} ${days(n)} ${n > 0 ? 'late' : 'early'}`);

// 팝업·툴팁용: "started 1 day late · finished 2 days late", "done 1 day early" 등. 실제 기록이 없으면 ''
export function actualText(task) {
  if (!task.actualStart) return '';
  if (task.type === 'milestone') return when(dayDiff(task.start, task.actualEnd), 'done');
  const started = when(dayDiff(task.start, task.actualStart), 'started');
  if (!task.actualEnd) return `${started} · in progress`;
  return `${started} · ${when(dayDiff(task.end, task.actualEnd), 'finished')}`;
}
