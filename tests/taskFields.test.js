// 태스크 선택 필드 정리(src/taskFields.js)와 백업 불러오기에서의 처리를 확인하는 테스트
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanTask, optionalFields } from '../src/taskFields.js';
import { parseBackup } from '../src/backup.js';

const base = { id: '1', name: 'A', start: '2026-12-01', end: '2026-12-05', progress: 0, dependencies: '', color: 'blue' };

test('기본값인 선택 필드는 남기지 않는다', () => {
  assert.deepEqual(optionalFields({ type: 'task', parent: '', collapsed: false, notes: '  ' }), {});
  assert.deepEqual(cleanTask({ ...base, type: 'task', notes: '' }), base);
});

test('마일스톤은 종료일을 시작일에 맞춘다', () => {
  assert.deepEqual(cleanTask({ ...base, type: 'milestone' }), { ...base, end: '2026-12-01', type: 'milestone' });
});

test('그룹은 부모를 가질 수 없고, 접힘은 그룹만', () => {
  assert.deepEqual(optionalFields({ type: 'group', parent: '3', collapsed: true }), { type: 'group', collapsed: true });
  assert.deepEqual(optionalFields({ parent: 3, collapsed: true }), { parent: '3' });
});

test('메모는 앞뒤 공백을 빼고, 기준선은 두 날짜가 모두 맞을 때만', () => {
  assert.deepEqual(optionalFields({ notes: '  hi\nthere ' }), { notes: 'hi\nthere' });
  assert.deepEqual(optionalFields({ baselineStart: '2026-12-01', baselineEnd: '2026-12-03' }), {
    baselineStart: '2026-12-01',
    baselineEnd: '2026-12-03',
  });
  assert.deepEqual(optionalFields({ baselineStart: '2026-12-05', baselineEnd: '2026-12-03' }), {});
  assert.deepEqual(optionalFields({ baselineStart: '2026-12-01' }), {});
});

test('백업의 마일스톤은 종료일이 없거나 달라도 시작일로 불러온다', () => {
  const { tasks } = parseBackup(
    JSON.stringify([
      { id: 1, name: 'Launch', start: '2026-12-10', type: 'milestone' },
      { id: 2, name: 'Odd', start: '2026-12-10', end: '2026-12-20', type: 'milestone', notes: 'n' },
    ]),
  );
  assert.equal(tasks[0].end, '2026-12-10');
  assert.equal(tasks[1].end, '2026-12-10');
  assert.equal(tasks[1].notes, 'n');
});
