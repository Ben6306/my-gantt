// 실제 날짜 기록(src/actuals.js)과 선택 필드·그룹 계산에서의 처리를 확인하는 테스트
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { actualText, applyActualRules, dayDiff, finishTask, startTask } from '../src/actuals.js';
import { optionalFields } from '../src/taskFields.js';
import { duplicateTask, normalizeTree } from '../src/tree.js';

const TODAY = '2026-11-28';
const t = (extra = {}) => ({ id: '1', name: 'A', start: '2026-11-27', end: '2026-11-30', progress: 0, dependencies: '', color: 'blue', ...extra });

test('Start는 오늘을 실제 시작으로, Finish는 오늘 끝남 + 100%', () => {
  assert.equal(startTask(t(), TODAY).actualStart, TODAY);
  const done = finishTask(t({ actualStart: '2026-11-28' }), '2026-12-01');
  assert.deepEqual([done.actualStart, done.actualEnd, done.progress], ['2026-11-28', '2026-12-01', 100]);
});

test('시작을 기록하지 않고 Finish하면 계획대로 시작한 것으로 (계획 시작이 미래면 오늘)', () => {
  assert.equal(finishTask(t(), TODAY).actualStart, '2026-11-27');
  assert.equal(finishTask(t({ start: '2026-12-05', end: '2026-12-06' }), TODAY).actualStart, TODAY);
  const ms = finishTask(t({ type: 'milestone', end: '2026-11-27' }), TODAY);
  assert.deepEqual([ms.actualStart, ms.actualEnd, ms.progress], [TODAY, TODAY, 100]);
});

test('진행률을 처음 올리면 실제 시작이 오늘로 들어간다', () => {
  const [next] = applyActualRules([t()], [t({ progress: 30 })], TODAY);
  assert.equal(next.actualStart, TODAY);
  // 이미 있으면 그대로
  const [kept] = applyActualRules([t()], [t({ progress: 30, actualStart: '2026-11-27' })], TODAY);
  assert.equal(kept.actualStart, '2026-11-27');
});

test('100%가 되면 실제 종료가 오늘로, 100%에서 내리면 지운다', () => {
  const [done] = applyActualRules([t({ progress: 50, actualStart: '2026-11-27' })], [t({ progress: 100, actualStart: '2026-11-27' })], TODAY);
  assert.equal(done.actualEnd, TODAY);
  const finished = t({ progress: 100, actualStart: '2026-11-27', actualEnd: TODAY });
  const [reopened] = applyActualRules([finished], [{ ...finished, progress: 80 }], TODAY);
  assert.equal('actualEnd' in reopened, false);
  assert.equal(reopened.actualStart, '2026-11-27');
});

test('실제 종료를 직접 넣으면 100%가 된다', () => {
  const [next] = applyActualRules([t({ progress: 40 })], [t({ progress: 40, actualStart: '2026-11-27', actualEnd: '2026-11-29' })], TODAY);
  assert.deepEqual([next.progress, next.actualEnd], [100, '2026-11-29']);
});

test('새 태스크와 그룹은 자동 기록하지 않는다', () => {
  const [fresh] = applyActualRules([], [t({ progress: 100 })], TODAY);
  assert.equal('actualEnd' in fresh, false);
  const g = t({ type: 'group' });
  const [group] = applyActualRules([g], [{ ...g, progress: 50 }], TODAY);
  assert.equal('actualStart' in group, false);
});

test('계획 대비 문구', () => {
  assert.equal(dayDiff('2026-11-27', '2026-11-29'), 2);
  assert.equal(actualText(t()), '');
  assert.equal(actualText(t({ actualStart: '2026-11-28' })), 'started 1 day late · in progress');
  assert.equal(actualText(t({ actualStart: '2026-11-27', actualEnd: '2026-11-29' })), 'started on time · finished 1 day early');
  assert.equal(actualText(t({ type: 'milestone', end: '2026-11-27', actualStart: TODAY, actualEnd: TODAY })), 'done 1 day late');
});

test('실제 날짜 정리: 종료만 있거나 순서가 틀리면 버리고, 마일스톤은 완료일 하나', () => {
  assert.deepEqual(optionalFields({ actualStart: '2026-11-27', actualEnd: '2026-11-29' }), { actualStart: '2026-11-27', actualEnd: '2026-11-29' });
  assert.deepEqual(optionalFields({ actualEnd: '2026-11-29' }), {});
  assert.deepEqual(optionalFields({ actualStart: '2026-11-29', actualEnd: '2026-11-27' }), { actualStart: '2026-11-29' });
  assert.deepEqual(optionalFields({ type: 'milestone', actualEnd: '2026-11-29' }), { type: 'milestone', actualStart: '2026-11-29', actualEnd: '2026-11-29' });
  assert.deepEqual(optionalFields({ type: 'milestone', actualStart: '2026-11-29' }), { type: 'milestone' });
});

test('그룹의 실제 시작은 먼저 시작한 자식, 실제 종료는 모든 자식이 끝났을 때만', () => {
  const kids = (a, b) =>
    normalizeTree([t({ id: 'g', type: 'group', actualStart: '2026-01-01', actualEnd: '2026-01-02' }), { ...t({ id: 'a', parent: 'g' }), ...a }, { ...t({ id: 'b', parent: 'g' }), ...b }])[0];
  const g1 = kids({ actualStart: '2026-11-28', actualEnd: '2026-11-29', progress: 100 }, { actualStart: '2026-11-27' });
  assert.deepEqual([g1.actualStart, 'actualEnd' in g1], ['2026-11-27', false]);
  const g2 = kids({ actualStart: '2026-11-28', actualEnd: '2026-11-29', progress: 100 }, { actualStart: '2026-11-27', actualEnd: '2026-12-02', progress: 100 });
  assert.deepEqual([g2.actualStart, g2.actualEnd], ['2026-11-27', '2026-12-02']);
  const g3 = kids({}, {});
  assert.equal('actualStart' in g3, false);
});

test('복제본에는 실제 날짜가 없다', () => {
  const { tasks } = duplicateTask([t({ actualStart: '2026-11-27', actualEnd: '2026-11-29', progress: 100 })], '1', 2);
  assert.equal('actualStart' in tasks[1], false);
  assert.equal('actualEnd' in tasks[1], false);
});
