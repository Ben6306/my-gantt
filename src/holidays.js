// 한국 공휴일 목록(대체공휴일 포함)과 근무일 수 계산 (DOM 없는 순수 함수)
import { addDays, parseISODate, toISODate } from './utils.js';

/*
 * 출처: 우주항공청 월력요항을 정리한 달력(kholidayz.com, 2026-11-28 확인).
 * 2026년부터 노동절(5/1)·제헌절(7/17)이 공휴일. 음력 명절과 선거일은 해마다 달라서 새해가 오기 전에 다음 해를 더해야 한다.
 */
export const HOLIDAYS = [
  ['2025-01-01', 'New Year’s Day'],
  ['2025-01-27', 'Temporary holiday'],
  ['2025-01-28', 'Seollal holiday'],
  ['2025-01-29', 'Seollal'],
  ['2025-01-30', 'Seollal holiday'],
  ['2025-03-01', 'Independence Movement Day'],
  ['2025-03-03', 'Substitute holiday'],
  ['2025-05-05', 'Children’s Day · Buddha’s Birthday'],
  ['2025-05-06', 'Substitute holiday'],
  ['2025-06-03', 'Presidential election'],
  ['2025-06-06', 'Memorial Day'],
  ['2025-08-15', 'Liberation Day'],
  ['2025-10-03', 'National Foundation Day'],
  ['2025-10-05', 'Chuseok holiday'],
  ['2025-10-06', 'Chuseok'],
  ['2025-10-07', 'Chuseok holiday'],
  ['2025-10-08', 'Substitute holiday'],
  ['2025-10-09', 'Hangul Day'],
  ['2025-12-25', 'Christmas Day'],

  ['2026-01-01', 'New Year’s Day'],
  ['2026-02-16', 'Seollal holiday'],
  ['2026-02-17', 'Seollal'],
  ['2026-02-18', 'Seollal holiday'],
  ['2026-03-01', 'Independence Movement Day'],
  ['2026-03-02', 'Substitute holiday'],
  ['2026-05-01', 'Labor Day'],
  ['2026-05-05', 'Children’s Day'],
  ['2026-05-24', 'Buddha’s Birthday'],
  ['2026-05-25', 'Substitute holiday'],
  ['2026-06-03', 'Local elections'],
  ['2026-06-06', 'Memorial Day'],
  ['2026-07-17', 'Constitution Day'],
  ['2026-08-15', 'Liberation Day'],
  ['2026-08-17', 'Substitute holiday'],
  ['2026-09-24', 'Chuseok holiday'],
  ['2026-09-25', 'Chuseok'],
  ['2026-09-26', 'Chuseok holiday'],
  ['2026-10-03', 'National Foundation Day'],
  ['2026-10-05', 'Substitute holiday'],
  ['2026-10-09', 'Hangul Day'],
  ['2026-12-25', 'Christmas Day'],

  ['2027-01-01', 'New Year’s Day'],
  ['2027-02-06', 'Seollal holiday'],
  ['2027-02-07', 'Seollal'],
  ['2027-02-08', 'Seollal holiday'],
  ['2027-02-09', 'Substitute holiday'],
  ['2027-03-01', 'Independence Movement Day'],
  ['2027-05-01', 'Labor Day'],
  ['2027-05-03', 'Substitute holiday'],
  ['2027-05-05', 'Children’s Day'],
  ['2027-05-13', 'Buddha’s Birthday'],
  ['2027-06-06', 'Memorial Day'],
  ['2027-07-17', 'Constitution Day'],
  ['2027-07-19', 'Substitute holiday'],
  ['2027-08-15', 'Liberation Day'],
  ['2027-08-16', 'Substitute holiday'],
  ['2027-09-14', 'Chuseok holiday'],
  ['2027-09-15', 'Chuseok'],
  ['2027-09-16', 'Chuseok holiday'],
  ['2027-10-03', 'National Foundation Day'],
  ['2027-10-04', 'Substitute holiday'],
  ['2027-10-09', 'Hangul Day'],
  ['2027-10-11', 'Substitute holiday'],
  ['2027-12-25', 'Christmas Day'],
  ['2027-12-27', 'Substitute holiday'],
].map(([date, name]) => ({ date, name }));

const BY_DATE = new Map(HOLIDAYS.map((h) => [h.date, h.name]));

// "2026-12-25" → "Christmas Day", 공휴일이 아니면 null
export const holidayName = (iso) => BY_DATE.get(iso) ?? null;

export const isWeekend = (date) => date.getDay() === 0 || date.getDay() === 6;

export const isWorkingDay = (date) => !isWeekend(date) && !BY_DATE.has(toISODate(date));

// 시작일~종료일(둘 다 포함) 중 주말·공휴일을 뺀 날 수
export function workingDays(startISO, endISO) {
  const end = parseISODate(endISO);
  let count = 0;
  for (let d = parseISODate(startISO); d <= end; d = addDays(d, 1)) {
    if (isWorkingDay(d)) count++;
  }
  return count;
}

// 시작일~종료일(둘 다 포함) 전체 날 수
export const calendarDays = (startISO, endISO) =>
  Math.round((parseISODate(endISO) - parseISODate(startISO)) / 86400000) + 1;
