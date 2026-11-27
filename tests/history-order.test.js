// 실행 취소 이력(src/history.js)과 목록 순서 이동(moveItem)을 확인하는 테스트
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHistory } from '../src/history.js';
import { moveItem } from '../src/utils.js';

test('되돌리면 바뀌기 전 상태와 무엇을 했는지가 나온다', () => {
  const h = createHistory();
  h.record(['a'], 'Add task');
  const entry = h.undo(['a', 'b']);
  assert.deepEqual(entry, { state: ['a'], label: 'Add task' });
  assert.equal(h.canUndo, false);
  assert.equal(h.canRedo, true);
});

test('다시 실행하면 되돌리기 전 상태가 나온다', () => {
  const h = createHistory();
  h.record(['a'], 'Add task');
  h.undo(['a', 'b']);
  assert.deepEqual(h.redo(['a']), { state: ['a', 'b'], label: 'Add task' });
  assert.equal(h.canUndo, true);
  assert.equal(h.canRedo, false);
});

test('여러 번 되돌리고 다시 실행해도 순서가 맞는다', () => {
  const h = createHistory();
  h.record(0, 'one');
  h.record(1, 'two');
  assert.deepEqual(h.undo(2), { state: 1, label: 'two' });
  assert.deepEqual(h.undo(1), { state: 0, label: 'one' });
  assert.equal(h.undo(0), null);
  assert.deepEqual(h.redo(0), { state: 1, label: 'one' });
  assert.deepEqual(h.redo(1), { state: 2, label: 'two' });
  assert.equal(h.redo(2), null);
});

test('다음에 되돌릴 것과 다시 실행할 것의 이름을 알려준다', () => {
  const h = createHistory();
  assert.equal(h.undoLabel, null);
  h.record(0, 'one');
  h.record(1, 'two');
  assert.equal(h.undoLabel, 'two');
  h.undo(2);
  assert.equal(h.undoLabel, 'one');
  assert.equal(h.redoLabel, 'two');
});

test('되돌린 뒤 새로 바꾸면 다시 실행할 것은 사라진다', () => {
  const h = createHistory();
  h.record(0, 'one');
  h.undo(1);
  h.record(0, 'other');
  assert.equal(h.canRedo, false);
});

test('이력은 정해진 개수까지만 남는다', () => {
  const h = createHistory(2);
  h.record(0, 'a');
  h.record(1, 'b');
  h.record(2, 'c');
  assert.equal(h.undo(3).label, 'c');
  assert.equal(h.undo(2).label, 'b');
  assert.equal(h.undo(1), null);
});

test('항목을 앞뒤로 옮기고 원본은 그대로 둔다', () => {
  const list = ['a', 'b', 'c', 'd'];
  assert.deepEqual(moveItem(list, 0, 2), ['b', 'c', 'a', 'd']);
  assert.deepEqual(moveItem(list, 3, 0), ['d', 'a', 'b', 'c']);
  assert.deepEqual(moveItem(list, 1, 1), list);
  assert.deepEqual(moveItem(list, 1, 99), ['a', 'c', 'd', 'b']);
  assert.deepEqual(list, ['a', 'b', 'c', 'd']);
});
