// 백업 파일 생성·검증 로직(src/backup.js)을 확인하는 테스트
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { backupFileName, buildBackup, parseBackup } from '../src/backup.js';
import { sampleTasks } from '../src/sampleTasks.js';

const task = (overrides = {}) => ({ id: '1', name: '기획', start: '2026-12-01', end: '2026-12-05', progress: 40, dependencies: '', ...overrides });

test('내보낸 백업을 다시 불러오면 같은 태스크가 나온다', () => {
  const text = JSON.stringify(buildBackup(sampleTasks, new Date('2026-11-28T00:00:00Z')));
  const { tasks, droppedDeps } = parseBackup(text);
  assert.deepEqual(tasks, sampleTasks);
  assert.equal(droppedDeps, 0);
});

test('백업에는 앱 식별자, 버전, 내보낸 시각이 들어간다', () => {
  const backup = buildBackup([], new Date('2026-11-28T00:00:00Z'));
  assert.equal(backup.app, 'my-gantt');
  assert.equal(backup.version, 1);
  assert.equal(backup.exportedAt, '2026-11-28T00:00:00.000Z');
});

test('파일 이름에 날짜가 들어간다', () => {
  assert.equal(backupFileName(new Date(2026, 10, 28)), 'gantt-backup-2026-11-28.json');
});

test('태스크 배열만 있는 JSON도 받는다', () => {
  const { tasks } = parseBackup(JSON.stringify([task()]));
  assert.equal(tasks.length, 1);
});

test('빈 프로젝트 백업도 받는다', () => {
  assert.deepEqual(parseBackup(JSON.stringify({ tasks: [] })).tasks, []);
});

test('숫자 id, 배열 의존성, 소수 진행률, 빠진 진행률을 앱 형식으로 맞춘다', () => {
  const { tasks } = parseBackup(
    JSON.stringify([task({ id: 1 }), task({ id: 2, dependencies: [1], progress: 33.6 }), task({ id: 3, progress: undefined })]),
  );
  assert.deepEqual(
    tasks.map((t) => [t.id, t.dependencies, t.progress]),
    [
      ['1', '', 40],
      ['2', '1', 34],
      ['3', '', 0],
    ],
  );
});

test('알 수 없는 필드는 버린다', () => {
  const [t] = parseBackup(JSON.stringify([task({ _start: 'x', custom: 1 })])).tasks;
  assert.deepEqual(Object.keys(t).sort(), ['dependencies', 'end', 'id', 'name', 'progress', 'start']);
});

test('존재하지 않는 선행 태스크와 자기 자신 연결은 빼고 개수를 알려준다', () => {
  const { tasks, droppedDeps } = parseBackup(JSON.stringify([task(), task({ id: '2', dependencies: '1, 9, 2' })]));
  assert.equal(tasks[1].dependencies, '1');
  assert.equal(droppedDeps, 2);
});

const rejects = (input, pattern) => assert.throws(() => parseBackup(typeof input === 'string' ? input : JSON.stringify(input)), pattern);

test('JSON이 아니면 거부한다', () => rejects('not json', /JSON 파일을 읽을 수 없습니다/));
test('태스크 목록이 없으면 거부한다', () => rejects({ foo: 1 }, /태스크 목록을 찾을 수 없습니다/));
test('id가 없으면 거부한다', () => rejects([task({ id: '' })], /1번째 태스크에 id가 없습니다/));
test('이름이 없으면 거부한다', () => rejects([task(), task({ id: '2', name: '  ' })], /2번째 태스크에 이름이 없습니다/));
test('날짜 형식이 틀리면 거부한다', () => rejects([task({ start: '2026/12/01' })], /시작일이 올바른 날짜/));
test('없는 날짜는 거부한다', () => rejects([task({ end: '2026-02-30' })], /종료일이 올바른 날짜/));
test('종료일이 시작일보다 빠르면 거부한다', () => rejects([task({ end: '2026-11-30' })], /종료일이 시작일보다 빠릅니다/));
test('진행률이 범위를 벗어나면 거부한다', () => rejects([task({ progress: 120 })], /진행률이 0~100/));
test('진행률이 숫자가 아니면 거부한다', () => rejects([task({ progress: 'abc' })], /진행률이 0~100/));
test('중복 id는 거부한다', () => rejects([task(), task()], /id ‘1’가 두 번 이상/));
