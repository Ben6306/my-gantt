// 차트 줌 단계와 '화면에 맞추기' 계산 (DOM 없는 순수 함수)
import { parseISODate } from './utils.js';

// 확대(위) → 축소(아래). 주·월 칸 너비는 헤더 글자("Nov 30 - 6 Dec", "September")가 들어가는 만큼까지만 줄인다.
export const ZOOM_LEVELS = [
  { mode: 'Day', columnWidth: 64 },
  { mode: 'Day', columnWidth: 45 },
  { mode: 'Day', columnWidth: 30 },
  { mode: 'Day', columnWidth: 20 },
  { mode: 'Week', columnWidth: 140 },
  { mode: 'Week', columnWidth: 100 },
  { mode: 'Month', columnWidth: 120 },
  { mode: 'Month', columnWidth: 90 },
];

export const DEFAULT_ZOOM = 1;

// Day/Week/Month 버튼을 누르면 가는 단계
export const MODE_DEFAULT_ZOOM = { Day: 1, Week: 4, Month: 6 };

const DAYS_PER_COLUMN = { Day: 1, Week: 7, Month: 30.44 };
const DAY_MS = 86400000;

// 첫 태스크 시작일부터 마지막 태스크 종료일까지 일 수 (양 끝 포함)
export function spanDays(tasks) {
  if (!tasks.length) return 0;
  const starts = tasks.map((t) => parseISODate(t.start).getTime());
  const ends = tasks.map((t) => parseISODate(t.end).getTime());
  return Math.round((Math.max(...ends) - Math.min(...starts)) / DAY_MS) + 1;
}

// 일정 전체에 양쪽 한 칸씩 여유를 둔 너비(px)
export const scheduleWidth = (level, days) => (days / DAYS_PER_COLUMN[level.mode] + 2) * level.columnWidth;

// 일정 전체가 들어가는 가장 확대된 단계. 아무 단계도 안 들어가면 가장 축소된 단계
export function fitZoom(days, availableWidth) {
  const index = ZOOM_LEVELS.findIndex((level) => scheduleWidth(level, days) <= availableWidth);
  return index === -1 ? ZOOM_LEVELS.length - 1 : index;
}
