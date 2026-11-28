// CSV 쓰기·읽기(src/csv.js)와 검증(backup.js parseTaskList)을 함께 확인하는 테스트
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { csvToTasks, parseCSV, tasksToCSV } from '../src/csv.js';
import { parseTaskList } from '../src/backup.js';

const tasks = [
  { id: '1', name: 'Phase 1', start: '2026-12-01', end: '2026-12-10', progress: 40, dependencies: '', color: 'purple', type: 'group' },
  { id: '2', name: 'Design, v2 "final"', start: '2026-12-01', end: '2026-12-05', progress: 80, dependencies: '', color: 'blue', parent: '1', notes: 'line 1\nline 2' },
  { id: '3', name: '=SUM(A1)', start: '2026-12-06', end: '2026-12-10', progress: 0, dependencies: '2', color: 'pink', parent: '1', baselineStart: '2026-12-05', baselineEnd: '2026-12-08' },
  { id: '4', name: 'Launch', start: '2026-12-11', end: '2026-12-11', progress: 0, dependencies: '3', color: 'orange', type: 'milestone' },
];

test('내보낸 CSV를 다시 읽으면 같은 태스크가 나온다 (쉼표·따옴표·줄바꿈·수식 같은 이름 포함)', () => {
  const csv = tasksToCSV(tasks);
  assert.match(csv.split('\r\n')[0], /^id,name,type,group,start,end,progress,dependencies,color,notes,baseline_start,baseline_end$/);
  assert.match(csv, /"Design, v2 ""final"""/);
  assert.match(csv, /'=SUM\(A1\)/); // 엑셀이 수식으로 실행하지 않게
  const { tasks: back, droppedDeps } = parseTaskList(csvToTasks(csv));
  assert.equal(droppedDeps, 0);
  assert.deepEqual(back, tasks);
});

test('BOM, 세미콜론 구분, CRLF, 빈 줄을 처리한다', () => {
  assert.deepEqual(parseCSV('﻿a;b\r\n1;"x;y"\r\n'), [
    ['a', 'b'],
    ['1', 'x;y'],
  ]);
  const list = csvToTasks('name;start;end\nA;2026-12-01;2026-12-02\n\n');
  assert.equal(list.length, 1);
});

test('엑셀이 바꾼 날짜·퍼센트 형식과 다른 열 이름도 받는다, id가 없으면 새로 매긴다', () => {
  const list = csvToTasks('Task,Start date,End date,Progress,Depends on\nA,2026/12/1,2026. 12. 3.,40%,\nB,2026.12.4,2026-12-05,,1');
  assert.deepEqual(
    list.map((t) => [t.id, t.name, t.start, t.end, t.progress, t.dependencies]),
    [
      ['1', 'A', '2026-12-01', '2026-12-03', 40, ''],
      ['2', 'B', '2026-12-04', '2026-12-05', 0, '1'],
    ],
  );
  const { tasks: ok } = parseTaskList(list);
  assert.equal(ok[0].color, 'purple'); // 색이 없으면 순서대로 기본 색
});

test('name·start 열이 없거나 빈 파일이면 거부한다', () => {
  assert.throws(() => csvToTasks('foo,bar\n1,2'), /must have column names/);
  assert.throws(() => csvToTasks('\n\n'), /empty/);
});

test('잘못된 날짜는 검증에서 알려 준다', () => {
  assert.throws(() => parseTaskList(csvToTasks('name,start,end\nA,12/01/2026,2026-12-02')), /invalid start date/);
});
