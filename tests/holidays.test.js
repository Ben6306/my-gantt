// 공휴일 목록과 근무일 계산(src/holidays.js)을 확인하는 테스트
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HOLIDAYS, calendarDays, holidayName, isWorkingDay, workingDays } from '../src/holidays.js';
import { parseISODate, toISODate } from '../src/utils.js';
import { buildTimeline } from '../src/timeline.js';

test('공휴일 날짜는 실제로 있는 날이고 겹치지 않는다', () => {
  const dates = HOLIDAYS.map((h) => h.date);
  assert.equal(new Set(dates).size, dates.length);
  for (const d of dates) assert.equal(toISODate(parseISODate(d)), d, d);
  // 날짜 순서대로 적어 둔다 (다음 해를 더할 때 빠뜨린 곳을 찾기 쉽게)
  assert.deepEqual([...dates].sort(), dates);
});

test('대체공휴일과 새 공휴일(노동절·제헌절)이 들어 있다', () => {
  assert.equal(holidayName('2026-12-25'), 'Christmas Day');
  assert.equal(holidayName('2026-10-05'), 'Substitute holiday');
  assert.equal(holidayName('2026-07-17'), 'Constitution Day');
  assert.equal(holidayName('2027-12-27'), 'Substitute holiday');
  assert.equal(holidayName('2026-12-24'), null);
});

test('근무일은 주말과 공휴일을 뺀다', () => {
  // 2026-12-21(월) ~ 2026-12-27(일): 25일 성탄절, 26·27일 주말 → 4일
  assert.equal(workingDays('2026-12-21', '2026-12-27'), 4);
  assert.equal(calendarDays('2026-12-21', '2026-12-27'), 7);
  // 설 연휴 주간 2026-02-16(월) ~ 02-20(금): 16~18일 연휴 → 2일
  assert.equal(workingDays('2026-02-16', '2026-02-20'), 2);
  // 하루짜리
  assert.equal(workingDays('2026-12-01', '2026-12-01'), 1);
  assert.equal(workingDays('2026-12-05', '2026-12-05'), 0); // 토요일
  assert.equal(isWorkingDay(parseISODate('2026-12-25')), false);
});

test('PNG 타임라인의 일 칸에 공휴일 표시가 붙는다', () => {
  const tl = buildTimeline([{ id: '1', name: 'a', start: '2026-12-22', end: '2026-12-28', progress: 0 }], {
    mode: 'Day',
    columnWidth: 30,
  });
  const col = (iso) => tl.columns.find((c) => toISODate(c.date) === iso);
  assert.equal(col('2026-12-25').holiday, 'Christmas Day');
  assert.equal(col('2026-12-24').holiday, null);
});
