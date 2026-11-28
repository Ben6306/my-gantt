// PNG 내보내기용 타임라인 계산: 기간·칸·x좌표·헤더 라벨 (DOM 없는 순수 함수)
import { addDays, parseISODate, toISODate } from './utils.js';
import { holidayName } from './holidays.js';

const DAY_MS = 86400000;
const monthYear = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' });
const monthShort = new Intl.DateTimeFormat('en-US', { month: 'short' });
const monthDay = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });

// 서머타임이 있는 지역에서도 날짜 차이가 정수로 나오도록 반올림한다
const daysBetween = (a, b) => Math.round((b - a) / DAY_MS);

// 그 주의 월요일
const startOfWeek = (d) => addDays(d, -((d.getDay() + 6) % 7));

/**
 * 태스크 전체 기간을 덮는 타임라인을 만든다. 태스크가 1개 이상이어야 한다.
 * - Day: 앞 2일, 뒤 2일 여유
 * - Week: 월요일 기준, 앞뒤 1주 여유
 * - Month: 첫 태스크의 달부터 마지막 태스크의 달까지
 * @returns {{ columns: {date: Date, x: number, label: string, weekend: boolean, holiday: string | null}[],
 *             groups: {label: string, x: number, width: number}[],
 *             width: number, start: Date, end: Date, x: (date: Date) => number }}
 *   x(date)는 타임라인 왼쪽 끝에서 그 시각까지의 거리(px). end는 마지막 칸이 끝나는 시각(미포함).
 */
export function buildTimeline(tasks, { mode, columnWidth }) {
  const min = new Date(Math.min(...tasks.map((t) => parseISODate(t.start).getTime())));
  const max = new Date(Math.max(...tasks.map((t) => parseISODate(t.end).getTime())));

  let start;
  let end;
  let next;
  if (mode === 'Month') {
    start = new Date(min.getFullYear(), min.getMonth(), 1);
    end = new Date(max.getFullYear(), max.getMonth() + 1, 1);
    next = (d) => new Date(d.getFullYear(), d.getMonth() + 1, 1);
  } else if (mode === 'Week') {
    start = addDays(startOfWeek(min), -7);
    end = addDays(startOfWeek(max), 14);
    next = (d) => addDays(d, 7);
  } else {
    start = addDays(min, -2);
    end = addDays(max, 3);
    next = (d) => addDays(d, 1);
  }

  const x = (date) => {
    const dayFraction = (date.getHours() + date.getMinutes() / 60) / 24;
    if (mode === 'Month') {
      const months = (date.getFullYear() - start.getFullYear()) * 12 + date.getMonth() - start.getMonth();
      const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
      return (months + (date.getDate() - 1 + dayFraction) / daysInMonth) * columnWidth;
    }
    const days = daysBetween(start, new Date(date.getFullYear(), date.getMonth(), date.getDate())) + dayFraction;
    return (mode === 'Week' ? days / 7 : days) * columnWidth;
  };

  const columns = [];
  for (let d = start, i = 0; d < end; d = next(d), i++) {
    columns.push({
      date: d,
      x: i * columnWidth,
      label: mode === 'Day' ? String(d.getDate()) : mode === 'Week' ? monthDay.format(d) : monthShort.format(d),
      weekend: mode === 'Day' && (d.getDay() === 0 || d.getDay() === 6),
      // 공휴일 이름 (일 보기에서만, 아니면 null)
      holiday: mode === 'Day' ? holidayName(toISODate(d)) : null,
    });
  }

  // 위쪽 헤더: 일·주는 월 단위("December 2026"), 월은 연도 단위로 묶는다
  const groupLabel = (d) => (mode === 'Month' ? String(d.getFullYear()) : monthYear.format(d));
  const groups = [];
  for (const col of columns) {
    const label = groupLabel(col.date);
    const last = groups.at(-1);
    if (last && last.label === label) last.width += columnWidth;
    else groups.push({ label, x: col.x, width: columnWidth });
  }

  return { columns, groups, width: columns.length * columnWidth, start, end, x };
}
