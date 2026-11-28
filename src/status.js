// 태스크 일정 상태(완료·기한 지남·시작 늦음·뒤처짐)를 오늘 날짜, 진행률, 실제 시작 기록으로 계산하는 순수 함수
import { calendarDays } from './holidays.js';

// 지난 기간 비율보다 진행률이 이만큼(%p) 넘게 낮으면 '뒤처짐'
export const BEHIND_MARGIN = 20;

const daysBetween = (fromISO, toISO) => calendarDays(fromISO, toISO) - 1;

/**
 * @param {{start: string, end: string, progress: number, actualStart?: string}} task
 * @param {string} todayISO "YYYY-MM-DD"
 * @returns {{status: 'done'} | {status: 'overdue', days: number} | {status: 'lateStart', days: number}
 *   | {status: 'behind', expected: number} | {status: 'ok'}}
 *   overdue.days: 종료일 다음 날부터 오늘까지 지난 날 수, lateStart.days: 계획 시작일부터 지난 날 수,
 *   behind.expected: 지난 기간 비율(%)
 */
export function scheduleStatus(task, todayISO) {
  if (task.progress >= 100) return { status: 'done' };
  if (task.end < todayISO) return { status: 'overdue', days: daysBetween(task.end, todayISO) };
  // 계획 시작일이 지났는데 시작 기록도 진행률도 없음
  if (task.start < todayISO && !task.actualStart && task.progress === 0) {
    return { status: 'lateStart', days: daysBetween(task.start, todayISO) };
  }
  if (task.start < todayISO) {
    // 오늘 전까지 지난 날 / 전체 날. 첫날은 0%, 마지막 날은 (n-1)/n
    const expected = Math.round((daysBetween(task.start, todayISO) / calendarDays(task.start, task.end)) * 100);
    if (task.progress + BEHIND_MARGIN < expected) return { status: 'behind', expected };
  }
  return { status: 'ok' };
}

// 목록·팝업에 보여 줄 한 줄 설명. 문제가 없으면 ''
export function statusText(result, progress) {
  if (result.status === 'overdue') return `Overdue by ${result.days} ${result.days === 1 ? 'day' : 'days'}`;
  if (result.status === 'lateStart') return `Not started yet — planned to start ${result.days} ${result.days === 1 ? 'day' : 'days'} ago`;
  if (result.status === 'behind') return `Behind schedule: ${progress}% done, about ${result.expected}% expected`;
  return '';
}

export const isLate = (result) => ['overdue', 'lateStart', 'behind'].includes(result.status);
