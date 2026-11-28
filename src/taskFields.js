// 태스크의 선택 필드(종류·그룹·접힘·메모·기준선·실제 날짜)를 정리하는 순수 함수. 기본값인 필드는 저장하지 않는다
import { isValidDate } from './utils.js';

export const NOTES_MAX = 2000;
const OPTIONAL_KEYS = ['type', 'parent', 'collapsed', 'notes', 'baselineStart', 'baselineEnd', 'actualStart', 'actualEnd'];

export const isMilestone = (t) => t.type === 'milestone';
export const isGroup = (t) => t.type === 'group';

/**
 * 선택 필드만 골라 정리한다.
 * - type: 'milestone' | 'group'만 남기고 그 밖(없음, 'task')은 일반 태스크라 뺀다
 * - parent: 그룹이 아닌 태스크만 (그룹은 한 단계라 부모를 가질 수 없다). 부모가 실제 그룹인지는 tree.js가 확인한다
 * - collapsed: 그룹만, true일 때만
 * - notes: 앞뒤 공백을 뺀 내용이 있을 때만
 * - baselineStart·baselineEnd: 둘 다 올바른 날짜이고 순서가 맞을 때만
 * - actualStart·actualEnd(실제 시작·종료): 종료는 시작이 있고 그 뒤일 때만. 마일스톤은 완료일 하나(actualEnd)라 둘을 같게
 */
export function optionalFields(raw) {
  const out = {};
  if (raw.type === 'milestone' || raw.type === 'group') out.type = raw.type;
  const parent = raw.parent == null ? '' : String(raw.parent).trim();
  if (parent && out.type !== 'group') out.parent = parent;
  if (out.type === 'group' && raw.collapsed === true) out.collapsed = true;
  if (typeof raw.notes === 'string' && raw.notes.trim()) out.notes = raw.notes.trim().slice(0, NOTES_MAX);
  if (isValidDate(raw.baselineStart) && isValidDate(raw.baselineEnd) && raw.baselineStart <= raw.baselineEnd) {
    out.baselineStart = raw.baselineStart;
    out.baselineEnd = raw.baselineEnd;
  }
  if (out.type === 'milestone') {
    if (isValidDate(raw.actualEnd)) out.actualStart = out.actualEnd = raw.actualEnd;
  } else if (isValidDate(raw.actualStart)) {
    out.actualStart = raw.actualStart;
    if (isValidDate(raw.actualEnd) && raw.actualEnd >= raw.actualStart) out.actualEnd = raw.actualEnd;
  }
  return out;
}

// 다른 필드는 그대로 두고 선택 필드만 다시 정리한다. 마일스톤은 하루짜리라 종료일을 시작일에 맞춘다
export function cleanTask(task) {
  const rest = { ...task };
  for (const key of OPTIONAL_KEYS) delete rest[key];
  const extra = optionalFields(task);
  if (extra.type === 'milestone') rest.end = rest.start;
  return { ...rest, ...extra };
}
