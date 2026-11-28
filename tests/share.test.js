// 공유 링크 만들기·읽기(src/share.js)를 확인하는 테스트
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeShare, encodeShare, shareDataFromHash, shareUrl } from '../src/share.js';
import { sampleTasks } from '../src/sampleTasks.js';

test('링크에 넣은 프로젝트를 그대로 꺼낸다 (한글·줄바꿈 포함)', async () => {
  const tasks = [...sampleTasks, { ...sampleTasks[0], id: '99', name: '한글 이름', notes: '줄\n바꿈 & ?#=' }];
  const data = await encodeShare({ name: '웹사이트 개편', tasks });
  assert.match(data, /^[A-Za-z0-9_-]+$/); // URL에 그대로 쓸 수 있는 글자만
  assert.deepEqual(await decodeShare(data), { name: '웹사이트 개편', tasks });
});

test('압축해서 JSON보다 짧다', async () => {
  const tasks = Array.from({ length: 30 }, (_, i) => ({ ...sampleTasks[i % sampleTasks.length], id: String(i + 1) }));
  const data = await encodeShare({ name: 'Big', tasks });
  assert.ok(data.length < JSON.stringify(tasks).length / 2, `${data.length}`);
});

test('잘리거나 깨진 링크는 알아들을 수 있는 오류', async () => {
  const data = await encodeShare({ name: 'A', tasks: sampleTasks });
  await assert.rejects(decodeShare(data.slice(0, 20)), /incomplete or damaged/);
  await assert.rejects(decodeShare('!!!'), /incomplete or damaged/);
});

test('주소의 # 부분에서 공유 데이터만 꺼내고, 주소를 만든다', () => {
  assert.equal(shareDataFromHash('#share=abc'), 'abc');
  assert.equal(shareDataFromHash('#share='), null);
  assert.equal(shareDataFromHash('#other'), null);
  assert.equal(shareDataFromHash(''), null);
  assert.equal(shareUrl('https://x.io/my-gantt/#old', 'abc'), 'https://x.io/my-gantt/#share=abc');
});
