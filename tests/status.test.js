// 일정 상태 계산(src/status.js)을 확인하는 테스트
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scheduleStatus, statusText } from '../src/status.js';

const task = (start, end, progress) => ({ start, end, progress });

test('100%면 날짜와 상관없이 완료', () => {
  assert.deepEqual(scheduleStatus(task('2026-01-01', '2026-01-05', 100), '2026-12-01'), { status: 'done' });
});

test('종료일이 지났는데 끝나지 않았으면 기한 지남, 지난 날 수를 센다', () => {
  assert.deepEqual(scheduleStatus(task('2026-12-01', '2026-12-05', 80), '2026-12-08'), { status: 'overdue', days: 3 });
  // 종료일 당일은 아직 기한 안
  assert.equal(scheduleStatus(task('2026-12-01', '2026-12-05', 0), '2026-12-05').status, 'behind');
});

test('지난 기간 비율보다 20%p 넘게 늦으면 뒤처짐', () => {
  // 10일 중 6일 지남 → 60% 예상
  assert.deepEqual(scheduleStatus(task('2026-12-01', '2026-12-10', 30), '2026-12-07'), { status: 'behind', expected: 60 });
  assert.equal(scheduleStatus(task('2026-12-01', '2026-12-10', 40), '2026-12-07').status, 'ok'); // 정확히 20%p
});

test('시작 전이거나 첫날이면 문제 없음', () => {
  assert.equal(scheduleStatus(task('2026-12-10', '2026-12-20', 0), '2026-12-01').status, 'ok');
  assert.equal(scheduleStatus(task('2026-12-10', '2026-12-20', 0), '2026-12-10').status, 'ok');
});

test('하루짜리(마일스톤)는 그날이 지나야 기한 지남', () => {
  assert.equal(scheduleStatus(task('2026-12-10', '2026-12-10', 0), '2026-12-10').status, 'ok');
  assert.equal(scheduleStatus(task('2026-12-10', '2026-12-10', 0), '2026-12-11').status, 'overdue');
});

test('설명 문구', () => {
  assert.equal(statusText({ status: 'overdue', days: 1 }, 50), 'Overdue by 1 day');
  assert.equal(statusText({ status: 'behind', expected: 60 }, 30), 'Behind schedule: 30% done, about 60% expected');
  assert.equal(statusText({ status: 'ok' }, 30), '');
});
