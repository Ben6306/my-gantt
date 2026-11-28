// 태스크 목록 구조 함수(src/tree.js)를 확인하는 테스트
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dropAnchor, duplicateTask, moveNextTo, moveSibling, normalizeTree, visibleTasks } from '../src/tree.js';

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

const ids = (list) => list.map((x) => x.id).join(' ');

test('자식은 부모 그룹 바로 뒤로 모이고, 없는 그룹을 가리키면 그룹 밖으로', () => {
  const list = normalizeTree([t('a', { parent: 'g' }), t('x'), t('g', { type: 'group' }), t('b', { parent: 'g' }), t('c', { parent: 'zz' })]);
  assert.equal(ids(list), 'x g a b c');
  assert.equal('parent' in list[4], false);
});

test('그룹 기간은 자식 전체, 진행률은 자식 기간 가중 평균', () => {
  const list = normalizeTree([
    t('g', { type: 'group', start: '2026-01-01', end: '2026-01-01', progress: 0 }),
    t('a', { parent: 'g', start: '2026-12-01', end: '2026-12-03', progress: 100 }), // 3일
    t('b', { parent: 'g', start: '2026-12-05', end: '2026-12-10', progress: 50 }), // 6일
  ]);
  assert.equal(list[0].start, '2026-12-01');
  assert.equal(list[0].end, '2026-12-10');
  assert.equal(list[0].progress, 67); // (300 + 300) / 9
});

test('자식 없는 그룹은 자기 날짜를 그대로 둔다', () => {
  const [g] = normalizeTree([t('g', { type: 'group', start: '2026-03-01', end: '2026-03-04', progress: 10 })]);
  assert.deepEqual([g.start, g.end, g.progress], ['2026-03-01', '2026-03-04', 10]);
});

test('그룹은 의존성을 갖지 않고 선행이 될 수도 없다', () => {
  const list = normalizeTree([t('g', { type: 'group', dependencies: '1' }), t('1', { dependencies: 'g, 2' }), t('2')]);
  assert.equal(list.find((x) => x.id === 'g').dependencies, '');
  assert.equal(list.find((x) => x.id === '1').dependencies, '2');
});

const tree = () =>
  normalizeTree([
    t('1'),
    t('g', { type: 'group' }),
    t('a', { parent: 'g' }),
    t('b', { parent: 'g' }),
    t('h', { type: 'group', collapsed: true }),
    t('c', { parent: 'h', name: 'needle' }),
    t('2'),
  ]);

test('접힌 그룹의 자식은 숨기고, 검색 중에는 맞는 자식과 그 그룹을 보여 준다', () => {
  assert.equal(ids(visibleTasks(tree())), '1 g a b h 2');
  assert.equal(ids(visibleTasks(tree(), (x) => x.name === 'needle')), 'h c');
});

test('형제끼리 자리 바꾸기: 그룹은 자식과 함께, 자식은 그룹 안에서만', () => {
  assert.equal(ids(moveSibling(tree(), 'g', -1)), 'g a b 1 h c 2');
  assert.equal(ids(moveSibling(tree(), '1', 1)), 'g a b 1 h c 2');
  assert.equal(ids(moveSibling(tree(), 'b', -1)), '1 g b a h c 2');
  assert.equal(moveSibling(tree(), 'b', 1), null); // 그룹 밖으로는 못 나간다
  assert.equal(moveSibling(tree(), '1', -1), null);
});

test('끌어 놓기: 자식은 같은 그룹 안에만, 그 밖에는 묶음 옆에', () => {
  assert.equal(dropAnchor(tree(), 'a', 'b'), 'b');
  assert.equal(dropAnchor(tree(), 'a', '1'), null);
  assert.equal(dropAnchor(tree(), '2', 'a'), 'g'); // 자식 위에 놓으면 그 그룹 묶음 옆
  assert.equal(dropAnchor(tree(), 'g', 'a'), null); // 자기 묶음
  assert.equal(ids(moveNextTo(tree(), '2', 'g', false)), '1 2 g a b h c');
  assert.equal(ids(moveNextTo(tree(), 'g', '2', true)), '1 h c 2 g a b');
  assert.equal(ids(moveNextTo(tree(), 'a', 'b', true)), '1 g b a h c 2');
});
