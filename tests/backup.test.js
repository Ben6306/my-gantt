// 백업 파일 생성·검증 로직(src/backup.js)과 날짜 표시 헬퍼를 확인하는 테스트
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allBackupFileName, backupFileName, buildAllBackup, buildBackup, parseAnyBackup, parseBackup } from '../src/backup.js';
import { sampleTasks } from '../src/sampleTasks.js';
import { formatDate, plural } from '../src/utils.js';

const task = (overrides = {}) => ({ id: '1', name: 'Plan', start: '2026-12-01', end: '2026-12-05', progress: 40, dependencies: '', ...overrides });

test('내보낸 백업을 다시 불러오면 같은 태스크와 프로젝트 이름이 나온다', () => {
  const text = JSON.stringify(buildBackup({ tasks: sampleTasks, projectName: 'Website launch' }, new Date('2026-11-28T00:00:00Z')));
  const { tasks, projectName, droppedDeps } = parseBackup(text);
  assert.deepEqual(tasks, sampleTasks);
  assert.equal(projectName, 'Website launch');
  assert.equal(droppedDeps, 0);
});

test('백업에는 앱 식별자, 버전, 내보낸 시각, 프로젝트 이름이 들어간다', () => {
  const backup = buildBackup({ tasks: [], projectName: 'Q1 roadmap' }, new Date('2026-11-28T00:00:00Z'));
  assert.equal(backup.app, 'my-gantt');
  assert.equal(backup.version, 1);
  assert.equal(backup.exportedAt, '2026-11-28T00:00:00.000Z');
  assert.equal(backup.projectName, 'Q1 roadmap');
});

test('파일 이름은 프로젝트 이름과 날짜로 만들고, 쓸 수 없는 문자는 뺀다', () => {
  const day = new Date(2026, 10, 28);
  assert.equal(backupFileName('Website launch', day), 'Website-launch-2026-11-28.json');
  assert.equal(backupFileName('a/b:c*', day), 'abc-2026-11-28.json');
  assert.equal(backupFileName('  ', day), 'gantt-2026-11-28.json');
});

test('태스크 배열만 있는 JSON도 받고, 이때 프로젝트 이름은 없다', () => {
  const { tasks, projectName } = parseBackup(JSON.stringify([task()]));
  assert.equal(tasks.length, 1);
  assert.equal(projectName, null);
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
  assert.deepEqual(Object.keys(t).sort(), ['color', 'dependencies', 'end', 'id', 'name', 'progress', 'start']);
});

test('올바른 색상은 그대로 두고, 없거나 모르는 색상은 순서대로 기본 색을 준다', () => {
  const { tasks } = parseBackup(
    JSON.stringify([task({ color: 'pink' }), task({ id: '2' }), task({ id: '3', color: '#ff0000' })]),
  );
  assert.deepEqual(
    tasks.map((t) => t.color),
    ['pink', 'blue', 'sky'],
  );
});

test('존재하지 않는 선행 태스크와 자기 자신 연결은 빼고 개수를 알려준다', () => {
  const { tasks, droppedDeps } = parseBackup(JSON.stringify([task(), task({ id: '2', dependencies: '1, 9, 2' })]));
  assert.equal(tasks[1].dependencies, '1');
  assert.equal(droppedDeps, 2);
});

const rejects = (input, pattern) => assert.throws(() => parseBackup(typeof input === 'string' ? input : JSON.stringify(input)), pattern);

test('JSON이 아니면 거부한다', () => rejects('not json', /isn’t valid JSON/));
test('태스크 목록이 없으면 거부한다', () => rejects({ foo: 1 }, /No task list found/));
test('id가 없으면 거부한다', () => rejects([task({ id: '' })], /The 1st task has no id/));
test('이름이 없으면 거부한다', () => rejects([task(), task({ id: '2', name: '  ' })], /The 2nd task has no name/));
test('날짜 형식이 틀리면 거부한다', () => rejects([task({ start: '2026/12/01' })], /invalid start date/));
test('없는 날짜는 거부한다', () => rejects([task({ end: '2026-02-30' })], /invalid end date/));
test('종료일이 시작일보다 빠르면 거부한다', () => rejects([task({ end: '2026-11-30' })], /ends before it starts/));
test('진행률이 범위를 벗어나면 거부한다', () => rejects([task({ progress: 120 })], /progress value outside 0–100/));
test('진행률이 숫자가 아니면 거부한다', () => rejects([task({ progress: 'abc' })], /progress value outside 0–100/));
test('중복 id는 거부한다', () => rejects([task(), task()], /“1” is used more than once/));

test('날짜는 영어 약식으로 보여준다', () => {
  assert.equal(formatDate('2026-12-01'), 'Dec 1, 2026');
  assert.equal(formatDate('2027-01-31'), 'Jan 31, 2027');
});

test('개수 표시는 단수/복수를 맞춘다', () => {
  assert.equal(plural(1, 'task'), '1 task');
  assert.equal(plural(0, 'task'), '0 tasks');
  assert.equal(plural(5, 'day'), '5 days');
});

test('모든 프로젝트 백업(version 2)을 만들고 다시 읽는다', () => {
  const projects = [
    { id: 'p1', name: 'A', tasks: [task()] },
    { id: 'p2', name: 'B', tasks: [] },
  ];
  const backup = buildAllBackup({ projects }, new Date('2026-11-28T00:00:00Z'));
  assert.equal(backup.version, 2);
  assert.deepEqual(backup.projects.map((p) => p.name), ['A', 'B']);
  assert.equal('id' in backup.projects[0], false); // 불러오면 새 프로젝트가 되므로 id는 넣지 않는다
  const { projects: read } = parseAnyBackup(JSON.stringify(backup));
  assert.deepEqual(read.map((p) => [p.name, p.tasks.length]), [['A', 1], ['B', 0]]);
  assert.equal(allBackupFileName(new Date(2026, 10, 28)), 'my-gantt-all-projects-2026-11-28.json');
});

test('한 프로젝트 백업과 태스크 배열도 프로젝트 하나로 읽는다', () => {
  const one = parseAnyBackup(JSON.stringify(buildBackup({ tasks: [task()], projectName: 'Solo' })));
  assert.deepEqual(one.projects.map((p) => p.name), ['Solo']);
  assert.equal(parseAnyBackup(JSON.stringify([task()])).projects[0].name, null);
});

test('전체 백업 안의 잘못된 프로젝트는 이름을 붙여 알려 준다', () => {
  assert.throws(
    () => parseAnyBackup(JSON.stringify({ projects: [{ name: 'Bad', tasks: [task({ end: '2026-11-30' })] }] })),
    /In “Bad”: .*ends before it starts/,
  );
  assert.throws(() => parseAnyBackup(JSON.stringify({ projects: [] })), /no projects/);
});
