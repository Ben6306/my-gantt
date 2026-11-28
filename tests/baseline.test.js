// 기준선 저장·삭제와 밀린 날 계산(src/baseline.js)을 확인하는 테스트
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { baselineSlip, clearBaseline, hasBaseline, setBaseline, slipText } from '../src/baseline.js';

const t = (start, end, extra = {}) => ({ id: start, name: start, start, end, progress: 0, ...extra });

test('지금 날짜를 기준선으로 저장하고 지운다', () => {
  const list = setBaseline([t('2026-12-01', '2026-12-05')]);
  assert.deepEqual(list[0], { ...t('2026-12-01', '2026-12-05'), baselineStart: '2026-12-01', baselineEnd: '2026-12-05' });
  assert.equal(hasBaseline(list), true);
  const cleared = clearBaseline(list);
  assert.deepEqual(cleared[0], t('2026-12-01', '2026-12-05'));
  assert.equal(hasBaseline(cleared), false);
});

test('기준선 대비 밀린 날 수', () => {
  const task = t('2026-12-03', '2026-12-08', { baselineStart: '2026-12-01', baselineEnd: '2026-12-05' });
  assert.deepEqual(baselineSlip(task), { start: 2, end: 3 });
  assert.deepEqual(baselineSlip(t('2026-11-30', '2026-12-04', { baselineStart: '2026-12-01', baselineEnd: '2026-12-05' })), {
    start: -1,
    end: -1,
  });
  assert.equal(baselineSlip(t('2026-12-01', '2026-12-05')), null);
});

test('설명 문구', () => {
  assert.equal(slipText({ start: 2, end: 3 }), 'finishes 3 days late');
  assert.equal(slipText({ start: 0, end: -1 }), 'finishes 1 day early');
  assert.equal(slipText({ start: 2, end: 0 }), 'starts 2 days late, same finish');
  assert.equal(slipText({ start: 0, end: 0 }), 'on schedule');
  assert.equal(slipText(null), '');
});
