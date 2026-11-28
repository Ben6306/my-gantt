// 태스크 목록 구조를 다루는 순수 함수: 복제 (DOM·저장소 없음)
import { joinDeps, parseDeps } from './utils.js';

/**
 * id 태스크를 복제해 원본(그룹이면 자식들까지) 바로 아래에 넣는다.
 * 그룹을 복제하면 자식도 함께 복제하고, 복제본끼리의 의존성은 복제본을 가리키게 바꾼다.
 * 기준선은 복제본이 계획에 없던 것이라 넣지 않는다.
 * @param {object[]} tasks
 * @param {string} id
 * @param {number} firstId 새 id로 쓸 첫 숫자 (복제본마다 1씩 늘린다)
 * @returns {{ tasks: object[], id: string } | null} 바뀐 목록과 복제한 태스크의 새 id
 */
export function duplicateTask(tasks, id, firstId) {
  const index = tasks.findIndex((t) => t.id === id);
  if (index === -1) return null;
  const block = [tasks[index], ...tasks.filter((t) => t.parent === id)];
  const idMap = new Map(block.map((t, i) => [t.id, String(firstId + i)]));
  const copies = block.map((t) => {
    const { baselineStart, baselineEnd, ...rest } = t;
    return {
      ...rest,
      id: idMap.get(t.id),
      name: t.id === id ? `${t.name} (copy)` : t.name,
      ...(t.parent ? { parent: idMap.get(t.parent) ?? t.parent } : {}),
      dependencies: joinDeps(parseDeps(t.dependencies).map((d) => idMap.get(d) ?? d)),
    };
  });
  // 원본 묶음(원본 + 바로 뒤에 이어지는 자식들) 다음 자리
  let end = index + 1;
  while (end < tasks.length && tasks[end].parent === id) end++;
  return { tasks: [...tasks.slice(0, end), ...copies, ...tasks.slice(end)], id: idMap.get(id) };
}
