// 줌 단계 선택(src/zoom.js)과 PNG용 타임라인 계산(src/timeline.js)을 확인하는 테스트
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ZOOM_LEVELS, fitZoom, spanDays } from '../src/zoom.js';
import { buildTimeline } from '../src/timeline.js';
import { sampleTasks } from '../src/sampleTasks.js';

const t = (start, end) => ({ id: start, name: start, start, end, progress: 0 });

test('일정 일 수는 첫 시작일부터 마지막 종료일까지 양 끝을 포함한다', () => {
  assert.equal(spanDays(sampleTasks), 31); // Dec 1 – Dec 31
  assert.equal(spanDays([t('2026-12-01', '2026-12-01')]), 1);
  assert.equal(spanDays([]), 0);
});

test('짧은 일정은 가장 확대된 단계를 고른다', () => {
  // 10일 + 여유 2칸 = 12칸 × 64px = 768px
  assert.equal(fitZoom(10, 1000), 0);
});

test('한 달 일정은 1000px에 들어가는 일 단계를 고른다', () => {
  // 64px: 2112, 45px: 1485, 30px: 990 → 30px
  assert.deepEqual(ZOOM_LEVELS[fitZoom(31, 1000)], { mode: 'Day', columnWidth: 30 });
});

test('넓으면 주 단위로 넘어간다', () => {
  // 일 20px: (90+2)×20 = 1840 → 안 됨, 주 140px: (90/7+2)×140 ≈ 2080 → 안 됨, 주 100px ≈ 1486 → 됨
  assert.deepEqual(ZOOM_LEVELS[fitZoom(90, 1500)], { mode: 'Week', columnWidth: 100 });
});

test('아무 단계도 안 들어가면 가장 축소된 단계', () => {
  assert.equal(fitZoom(3650, 800), ZOOM_LEVELS.length - 1);
});

test('일 단위 타임라인: 앞뒤 2일 여유, 날짜 위치, 주말 표시', () => {
  const tl = buildTimeline([t('2026-12-01', '2026-12-05')], { mode: 'Day', columnWidth: 20 });
  assert.equal(tl.columns[0].label, '29'); // Nov 29
  assert.equal(tl.columns.length, 9); // Nov 29 – Dec 7
  assert.equal(tl.width, 180);
  assert.equal(tl.x(new Date(2026, 11, 1)), 40);
  assert.equal(tl.x(new Date(2026, 11, 1, 12)), 50); // 정오는 칸 가운데
  assert.equal(tl.columns.find((c) => c.label === '5').weekend, true); // 2026-12-05는 토요일
  assert.equal(tl.columns.find((c) => c.label === '4').weekend, false);
  assert.deepEqual(
    tl.groups.map((g) => [g.label, g.width]),
    [
      ['November 2026', 40],
      ['December 2026', 140],
    ],
  );
});

test('주 단위 타임라인: 월요일에 맞추고 앞뒤 1주 여유', () => {
  // 2026-12-02는 수요일 → 그 주 월요일 11/30, 한 주 앞 11/23부터
  const tl = buildTimeline([t('2026-12-02', '2026-12-10')], { mode: 'Week', columnWidth: 70 });
  assert.equal(tl.columns[0].label, 'Nov 23');
  assert.equal(tl.columns.length, 4); // 11/23, 11/30, 12/7, 12/14
  assert.equal(tl.x(new Date(2026, 10, 30)), 70);
  assert.equal(tl.x(new Date(2026, 11, 2)), 90); // 수요일 = 월요일 + 2/7칸
});

test('월 단위 타임라인: 달 안의 위치는 그 달 일 수 비율', () => {
  const tl = buildTimeline([t('2026-12-10', '2027-01-20')], { mode: 'Month', columnWidth: 124 });
  assert.deepEqual(
    tl.columns.map((c) => c.label),
    ['Dec', 'Jan'],
  );
  assert.equal(tl.x(new Date(2026, 11, 1)), 0);
  assert.equal(tl.x(new Date(2026, 11, 16)), 60); // 15/31 × 124
  assert.equal(tl.x(new Date(2027, 0, 1)), 124);
  assert.deepEqual(
    tl.groups.map((g) => g.label),
    ['2026', '2027'],
  );
});
