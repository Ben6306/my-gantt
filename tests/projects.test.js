// 여러 프로젝트 상태(src/projects.js): 예전 데이터 옮기기, 저장 데이터 검증, 프로젝트 삭제를 확인하는 테스트
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProject, initState, removeProject } from '../src/projects.js';

const base = { fallbackTasks: [{ id: 'sample' }], defaultName: 'Untitled project' };
const p = (id, name = id) => ({ id, name, tasks: [{ id: `${id}-1` }] });

test('저장된 프로젝트 목록이 있으면 그대로 쓴다', () => {
  const stored = { projects: [p('a'), p('b')], currentId: 'b' };
  assert.deepEqual(initState({ ...base, stored }), stored);
});

test('지금 프로젝트 id가 목록에 없으면 첫 프로젝트로', () => {
  const state = initState({ ...base, stored: { projects: [p('a'), p('b')], currentId: 'zzz' } });
  assert.equal(state.currentId, 'a');
});

test('형식이 깨진 프로젝트는 버리고, 이름이 비면 기본 이름', () => {
  const state = initState({ ...base, stored: { projects: [null, { id: 'x' }, { id: 'a', name: ' ', tasks: [] }], currentId: 'a' } });
  assert.deepEqual(state, { projects: [{ id: 'a', name: 'Untitled project', tasks: [] }], currentId: 'a' });
});

test('저장된 목록이 없으면 예전 단일 프로젝트 데이터를 첫 프로젝트로 옮긴다', () => {
  const legacyTasks = [{ id: '1', name: 'Plan' }];
  const state = initState({ ...base, stored: null, legacyTasks, legacyName: 'Test1' });
  assert.equal(state.projects.length, 1);
  assert.equal(state.projects[0].name, 'Test1');
  assert.equal(state.projects[0].tasks, legacyTasks);
  assert.equal(state.currentId, state.projects[0].id);
});

test('예전 데이터가 빈 배열이면 샘플로 바꾸지 않는다', () => {
  const state = initState({ ...base, stored: null, legacyTasks: [], legacyName: null });
  assert.deepEqual(state.projects[0].tasks, []);
  assert.equal(state.projects[0].name, 'Untitled project');
});

test('아무 데이터도 없으면 샘플 태스크로 시작한다', () => {
  const state = initState({ ...base, stored: null, legacyTasks: null, legacyName: null });
  assert.deepEqual(state.projects[0].tasks, [{ id: 'sample' }]);
});

test('지금 프로젝트를 지우면 같은 자리의 다음 프로젝트로 옮긴다', () => {
  const state = { projects: [p('a'), p('b'), p('c')], currentId: 'b' };
  assert.deepEqual(removeProject(state, 'b', 'X'), { projects: [p('a'), p('c')], currentId: 'c' });
});

test('마지막 자리의 지금 프로젝트를 지우면 바로 위 프로젝트로', () => {
  const state = { projects: [p('a'), p('b')], currentId: 'b' };
  assert.equal(removeProject(state, 'b', 'X').currentId, 'a');
});

test('다른 프로젝트를 지우면 지금 프로젝트는 그대로', () => {
  const state = { projects: [p('a'), p('b')], currentId: 'b' };
  assert.equal(removeProject(state, 'a', 'X').currentId, 'b');
});

test('마지막 하나를 지우면 빈 프로젝트를 새로 만든다', () => {
  const state = removeProject({ projects: [p('a')], currentId: 'a' }, 'a', 'Untitled project');
  assert.equal(state.projects.length, 1);
  assert.equal(state.projects[0].name, 'Untitled project');
  assert.deepEqual(state.projects[0].tasks, []);
  assert.equal(state.currentId, state.projects[0].id);
});

test('새 프로젝트는 서로 다른 id를 받는다', () => {
  assert.notEqual(createProject('a').id, createProject('b').id);
});
