// 태스크 목록 구조를 다루는 순수 함수: 그룹 정렬·자동 계산, 보이는 행, 순서 바꾸기, 복제 (DOM·저장소 없음)
import { joinDeps, parseDeps } from './utils.js';
import { calendarDays } from './holidays.js';

/*
 * 그룹은 한 단계만 있다: 그룹(type 'group') 아래에 일반 태스크·마일스톤(parent = 그룹 id).
 * 목록 배열에서 자식은 항상 부모 그룹 바로 뒤에 이어진다(normalizeTree가 맞춘다).
 */
const isGroup = (t) => t.type === 'group';

/**
 * 그룹 구조를 맞춘다.
 * - 없는 그룹이나 그룹이 아닌 태스크를 가리키는 parent는 지운다 (그룹 밖으로)
 * - 그룹은 의존성을 갖지 않고, 다른 태스크도 그룹을 선행으로 두지 않는다
 * - 자식을 부모 그룹 바로 뒤로 모은다 (자식끼리의 순서는 그대로)
 * - 자식이 있는 그룹의 기간은 자식 전체를 덮고, 진행률은 자식 기간으로 가중 평균한다
 */
export function normalizeTree(tasks) {
  const groupIds = new Set(tasks.filter(isGroup).map((t) => t.id));
  const fixed = tasks.map((t) => {
    const next = { ...t };
    if (next.parent && !groupIds.has(next.parent)) delete next.parent;
    const deps = parseDeps(next.dependencies);
    const kept = isGroup(next) ? [] : deps.filter((d) => !groupIds.has(d));
    if (kept.length !== deps.length) next.dependencies = joinDeps(kept);
    return next;
  });

  const children = new Map();
  for (const t of fixed) {
    if (t.parent) children.set(t.parent, [...(children.get(t.parent) ?? []), t]);
  }

  const ordered = [];
  for (const t of fixed) {
    if (t.parent) continue;
    const kids = children.get(t.id) ?? [];
    ordered.push(kids.length ? rollup(t, kids) : t);
    ordered.push(...kids);
  }
  return ordered;
}

// 그룹 = 자식 전체. 실제 시작은 먼저 시작한 자식, 실제 종료는 모든 자식이 끝났을 때 가장 늦은 것
function rollup(group, kids) {
  let start = kids[0].start;
  let end = kids[0].end;
  let weight = 0;
  let done = 0;
  for (const k of kids) {
    if (k.start < start) start = k.start;
    if (k.end > end) end = k.end;
    const days = calendarDays(k.start, k.end);
    weight += days;
    done += days * k.progress;
  }
  const { actualStart: _s, actualEnd: _e, ...rest } = group;
  const started = kids.filter((k) => k.actualStart).map((k) => k.actualStart).sort();
  const finished = kids.every((k) => k.actualEnd) ? kids.map((k) => k.actualEnd).sort() : [];
  return {
    ...rest,
    start,
    end,
    progress: Math.round(done / weight),
    ...(started.length ? { actualStart: started[0] } : {}),
    ...(finished.length ? { actualEnd: finished.at(-1) } : {}),
  };
}

// 그룹 id → 자식 수
export const childCounts = (tasks) => {
  const counts = new Map();
  for (const t of tasks) if (t.parent) counts.set(t.parent, (counts.get(t.parent) ?? 0) + 1);
  return counts;
};

/**
 * 화면에 보일 행. 접힌 그룹의 자식은 숨긴다.
 * match가 있으면(검색·필터) 맞는 태스크와, 자식이 맞는 그룹만 남긴다. 이때는 접힘과 상관없이 맞는 자식을 보여 준다.
 */
export function visibleTasks(tasks, match = null) {
  if (!match) {
    const collapsed = new Set(tasks.filter((t) => isGroup(t) && t.collapsed).map((t) => t.id));
    return tasks.filter((t) => !t.parent || !collapsed.has(t.parent));
  }
  const keep = new Set();
  for (const t of tasks) {
    if (!match(t)) continue;
    keep.add(t.id);
    if (t.parent) keep.add(t.parent);
  }
  return tasks.filter((t) => keep.has(t.id));
}

// 정리된 목록 → 묶음 [{ head, children }] (그룹이 아닌 태스크는 자식 없는 묶음)
function toBlocks(tasks) {
  const blocks = [];
  const byId = new Map();
  for (const t of tasks) {
    const block = t.parent && byId.get(t.parent);
    if (block) block.children.push(t);
    else {
      const b = { head: t, children: [] };
      blocks.push(b);
      byId.set(t.id, b);
    }
  }
  return blocks;
}

const flatten = (blocks) => blocks.flatMap((b) => [b.head, ...b.children]);

/**
 * id를 같은 단계의 이웃과 자리를 바꾼다 (dir: -1 위, 1 아래).
 * 그룹·그룹 밖 태스크는 묶음째(그룹은 자식과 함께), 자식은 같은 그룹 안에서만 움직인다.
 * @returns {object[] | null} 움직일 수 없으면 null
 */
export function moveSibling(tasks, id, dir) {
  const blocks = toBlocks(tasks);
  const top = blocks.findIndex((b) => b.head.id === id);
  if (top !== -1) {
    const to = top + dir;
    if (to < 0 || to >= blocks.length) return null;
    [blocks[top], blocks[to]] = [blocks[to], blocks[top]];
    return flatten(blocks);
  }
  const block = blocks.find((b) => b.children.some((c) => c.id === id));
  if (!block) return null;
  const i = block.children.findIndex((c) => c.id === id);
  const to = i + dir;
  if (to < 0 || to >= block.children.length) return null;
  [block.children[i], block.children[to]] = [block.children[to], block.children[i]];
  return flatten(blocks);
}

/**
 * 끌어 놓기 대상: id를 놓을 수 있는 자리의 기준 태스크 id. 놓을 수 없으면 null.
 * 자식은 같은 그룹의 다른 자식 옆에만, 그 밖에는 다른 묶음 옆에 (자식 위에 놓으면 그 그룹 묶음 옆)
 */
export function dropAnchor(tasks, id, overId) {
  const dragged = tasks.find((t) => t.id === id);
  const over = tasks.find((t) => t.id === overId);
  if (!dragged || !over || id === overId) return null;
  if (dragged.parent) return over.parent === dragged.parent ? over.id : null;
  const anchor = over.parent ?? over.id;
  return anchor === id ? null : anchor;
}

/**
 * id를 anchorId(dropAnchor의 결과) 앞(after=false)이나 뒤에 놓은 목록. 그룹은 자식과 함께 옮긴다.
 * @returns {object[] | null}
 */
export function moveNextTo(tasks, id, anchorId, after) {
  const blocks = toBlocks(tasks);
  const dragged = tasks.find((t) => t.id === id);
  if (!dragged || dragged.id === anchorId) return null;
  if (dragged.parent) {
    const block = blocks.find((b) => b.head.id === dragged.parent);
    const kids = block.children.filter((c) => c.id !== id);
    const at = kids.findIndex((c) => c.id === anchorId);
    if (at === -1) return null;
    kids.splice(after ? at + 1 : at, 0, dragged);
    block.children = kids;
    return flatten(blocks);
  }
  const from = blocks.findIndex((b) => b.head.id === id);
  const [moving] = blocks.splice(from, 1);
  const at = blocks.findIndex((b) => b.head.id === anchorId);
  if (at === -1) return null;
  blocks.splice(after ? at + 1 : at, 0, moving);
  return flatten(blocks);
}

/**
 * id 태스크를 복제해 원본(그룹이면 자식들까지) 바로 아래에 넣는다.
 * 그룹을 복제하면 자식도 함께 복제하고, 복제본끼리의 의존성은 복제본을 가리키게 바꾼다.
 * 기준선·실제 날짜는 복제본이 계획에 없던, 아직 하지 않은 일이라 넣지 않는다.
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
    const { baselineStart, baselineEnd, actualStart, actualEnd, ...rest } = t;
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
