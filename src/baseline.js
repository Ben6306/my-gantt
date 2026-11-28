// 기준선(처음 계획한 날짜)을 저장·삭제하고, 지금 일정이 기준선에서 며칠 밀렸는지 계산하는 순수 함수
import { calendarDays } from './holidays.js';

export const hasBaseline = (tasks) => tasks.some((t) => t.baselineStart);

// 모든 태스크의 지금 날짜를 기준선으로 (그룹은 자식으로 계산된 지금 기간)
export const setBaseline = (tasks) => tasks.map((t) => ({ ...t, baselineStart: t.start, baselineEnd: t.end }));

export const clearBaseline = (tasks) =>
  tasks.map(({ baselineStart, baselineEnd, ...rest }) => rest);

// 기준선 대비 시작·종료가 며칠 늦어졌는지(음수면 앞당겨짐). 기준선이 없으면 null
export function baselineSlip(task) {
  if (!task.baselineStart) return null;
  const diff = (from, to) => (from <= to ? calendarDays(from, to) - 1 : -(calendarDays(to, from) - 1));
  return { start: diff(task.baselineStart, task.start), end: diff(task.baselineEnd, task.end) };
}

// 팝업용 한 줄: "finishes 3 days late", "on schedule" 등
export function slipText(slip) {
  if (!slip) return '';
  const days = (n) => `${Math.abs(n)} ${Math.abs(n) === 1 ? 'day' : 'days'}`;
  if (slip.end > 0) return `finishes ${days(slip.end)} late`;
  if (slip.end < 0) return `finishes ${days(slip.end)} early`;
  if (slip.start !== 0) return `starts ${days(slip.start)} ${slip.start > 0 ? 'late' : 'early'}, same finish`;
  return 'on schedule';
}
