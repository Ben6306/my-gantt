// 태스크 목록 구조 함수(src/tree.js)를 확인하는 테스트
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { duplicateTask } from '../src/tree.js';

const t = (id, extra = {}) => ({ id, name: `T${id}`, start: '2026-12-01', end: '2026-12-02', progress: 0, dependencies: '', color: 'blue', ...extra });

test('복제본은 원본 바로 아래에 "(copy)"로 들어가고 기준선은 빠진다', () => {
  const list = [t('1'), t('2', { dependencies: '1', baselineStart: '2026-12-01', baselineEnd: '2026-12-02', notes: 'n' }), t('3')];
  const result = duplicateTask(list, '2', 4);
  assert.equal(result.id, '4');
  assert.deepEqual(
    result.tasks.map((x) => x.id),
    ['1', '2', '4', '3'],
  );
  const copy = result.tasks[2];
  assert.equal(copy.name, 'T2 (copy)');
  assert.equal(copy.dependencies, '1'); // 바깥 선행 태스크는 그대로
  assert.equal(copy.notes, 'n');
  assert.equal('baselineStart' in copy, false);
});

test('그룹은 자식까지 복제하고, 묶음 안의 의존성은 복제본을 가리킨다', () => {
  const list = [
    t('1', { type: 'group' }),
    t('2', { parent: '1' }),
    t('3', { parent: '1', dependencies: '2' }),
    t('4', { dependencies: '3' }),
  ];
  const result = duplicateTask(list, '1', 10);
  assert.deepEqual(
    result.tasks.map((x) => x.id),
    ['1', '2', '3', '10', '11', '12', '4'],
  );
  assert.equal(result.tasks[3].name, 'T1 (copy)');
  assert.equal(result.tasks[4].name, 'T2');
  assert.equal(result.tasks[4].parent, '10');
  assert.equal(result.tasks[5].dependencies, '11');
});

test('없는 id면 null', () => {
  assert.equal(duplicateTask([t('1')], '9', 2), null);
});
