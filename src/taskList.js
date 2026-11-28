// 왼쪽 태스크 목록 패널을 그리는 모듈 (그룹 접기·들여쓰기, 계획/실제 날짜, 행마다 시작·완료/수정/복제/삭제 버튼, 선택 행 강조)
import { escapeHTML, formatDate, parseISODate, plural, toISODate } from './utils.js';
import { isLate, scheduleStatus, statusText } from './status.js';
import { childCounts } from './tree.js';

const rowsEl = document.getElementById('task-rows');
const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
const countEl = document.getElementById('task-count');

// lucide 아이콘(grip-vertical, pencil, copy, trash-2, notebook-text, circle-alert, chevron-right), ISC 라이선스
const gripIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/></svg>`;
const editIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/></svg>`;
const copyIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`;
const deleteIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>`;
const noteIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 6h4"/><path d="M2 10h4"/><path d="M2 14h4"/><path d="M2 18h4"/><rect width="16" height="20" x="4" y="2" rx="2"/><path d="M9.5 8h5"/><path d="M9.5 12H16"/><path d="M9.5 16H14"/></svg>`;
const alertIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>`;
// lucide play, check
const playIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><polygon points="6 3 20 12 6 21 6 3"/></svg>`;
const checkIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>`;
const chevronIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>`;

const shortDate = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
const formatShort = (iso) => shortDate.format(parseISODate(iso));

/**
 * 날짜 칸: 실제 날짜가 기록돼 있으면 실제 날짜(밝게), 계획과 다르면 아래 줄에 작게 "plan Nov 27".
 * 기록이 없으면 계획 날짜(흐리게). warn이 있으면 앞에 경고 아이콘과 설명
 */
function dateCell(label, plan, actual, warn, word = label) {
  const shown = actual ?? plan;
  const titleParts = [actual ? `Actual ${word} ${formatDate(actual)}${actual !== plan ? ` · planned ${formatDate(plan)}` : ''}` : `Planned ${word} ${formatDate(plan)}`];
  if (warn) titleParts.unshift(warn);
  const icon = warn ? `<span class="late-icon">${alertIcon}</span>` : '';
  const sr = `<span class="sr-only">${escapeHTML(titleParts.join('. '))}. </span>`;
  const planLine = actual && actual !== plan ? `<span class="plan-date" aria-hidden="true">plan ${formatShort(plan)}</span>` : '';
  return `<span class="task-date task-${label}${actual ? ' is-actual' : ''}${warn ? ' has-warning' : ''}" title="${escapeHTML(titleParts.join('\n'))}">${sr}<span class="date-main" aria-hidden="true">${icon}${formatDate(shown)}</span>${planLine}</span>`;
}

// 시작·완료 기록 단추: 시작 전이면 Start, 시작했으면 Finish, 끝났거나 자식이 있는 그룹이면 없음
function progressAction(task, name, hasKids) {
  if ((task.type === 'group' && hasKids) || task.progress >= 100) return '';
  if (task.type === 'milestone' || task.actualStart) {
    return `<button type="button" class="icon-btn" data-action="finish" aria-label="Mark ${name} done today" title="Done today — record today as the actual end (100%)">${checkIcon}</button>`;
  }
  return `<button type="button" class="icon-btn" data-action="start" aria-label="Start ${name} today" title="Start today — record today as the actual start">${playIcon}</button>`;
}

/**
 * @param {object} opts
 * @param {object[]} opts.rows 보이는 행 (접힌 그룹의 자식·필터에 안 맞는 행 제외)
 * @param {object[]} opts.all 지금 프로젝트의 모든 태스크 (개수·자식 수 계산용)
 * @param {string | null} opts.selectedId
 * @param {boolean} opts.canReorder 끌어서 순서 바꾸기를 보여 줄지 (필터 중에는 끔)
 * @param {boolean} [opts.filtered] 검색·필터 중이면 "3 of 18 tasks"
 * @param {string} [opts.today] "YYYY-MM-DD"
 */
export function renderTaskList({ rows, all, selectedId, canReorder, filtered = false, today = toISODate(new Date()) }) {
  // 개수와 늦은 태스크 수는 그룹을 빼고 센다 (그룹 상태는 자식에서 나오므로 두 번 세지 않게)
  const items = all.filter((t) => t.type !== 'group');
  const late = items.filter((t) => isLate(scheduleStatus(t, today))).length;
  const shown = rows.filter((t) => t.type !== 'group').length;
  countEl.textContent =
    (filtered ? `${shown} of ${plural(items.length, 'task')}` : plural(items.length, 'task')) + (late ? ` · ${late} late` : '');
  countEl.classList.toggle('has-late', late > 0);

  if (!rows.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = all.length ? 'No tasks match.' : 'No tasks yet. Click “Add task” to get started.';
    rowsEl.replaceChildren(li);
    return;
  }

  const counts = childCounts(all);
  rowsEl.innerHTML = rows
    .map((task) => {
      const name = escapeHTML(task.name);
      // 마우스를 올리면 전체 이름과 메모
      const tooltip = escapeHTML(task.notes ? `${task.name}\n\n${task.notes}` : task.name);
      const selected = task.id === selectedId;
      const status = scheduleStatus(task, today);
      const late = isLate(status);
      const lateText = statusText(status, task.progress);
      const group = task.type === 'group';
      const milestone = task.type === 'milestone';
      const kids = counts.get(task.id) ?? 0;
      const classes = [
        'task-row',
        `c-${escapeHTML(task.color)}`,
        selected && 'is-selected',
        task.progress === 100 && 'is-done',
        late && `is-${status.status}`,
        task.type === 'milestone' && 'is-milestone',
        group && 'is-group',
        task.parent && 'is-child',
      ].filter(Boolean);
      // 그룹은 접기 단추(자식이 없으면 자리만), 자식은 들여쓰기
      const toggle = group
        ? kids
          ? `<button type="button" class="group-toggle" data-action="toggle" aria-expanded="${!task.collapsed}" aria-label="${task.collapsed ? 'Expand' : 'Collapse'} ${name}" title="${task.collapsed ? 'Expand' : 'Collapse'} (→/←) · ${plural(kids, 'task')}">${chevronIcon}</button>`
          : '<span class="group-toggle" aria-hidden="true"></span>'
        : '';
      const handle = canReorder
        ? `<span class="drag-handle" draggable="true" title="Drag to reorder (Alt+↑/↓)">${gripIcon}</span>`
        : '';
      return `
        <li class="${classes.join(' ')}" data-id="${escapeHTML(task.id)}"${task.parent ? ` data-parent="${escapeHTML(task.parent)}"` : ''} tabindex="0"${selected ? ' aria-current="true"' : ''}${group && kids ? ` aria-expanded="${!task.collapsed}"` : ''}>
          ${handle}
          <span class="task-name" title="${tooltip}">${toggle}<span class="color-dot"></span><span class="task-name-text">${name}</span>${task.notes ? `<span class="note-icon" aria-label="Has notes">${noteIcon}</span>` : ''}</span>
          ${dateCell('start', task.start, milestone ? undefined : task.actualStart, status.status === 'lateStart' ? lateText : '', milestone ? 'date' : 'start')}
          ${dateCell('end', task.end, task.actualEnd, late && status.status !== 'lateStart' ? lateText : '', milestone ? 'done date' : 'end')}
          <span class="task-progress">
            <span class="progress-track"><span class="progress-fill" style="width:${task.progress}%"></span></span>
            <span class="progress-value">${task.progress}%</span>
          </span>
          <span class="row-actions">
            ${progressAction(task, name, kids > 0)}
            <button type="button" class="icon-btn" data-action="edit" aria-label="Edit ${name}" title="Edit">${editIcon}</button>
            <button type="button" class="icon-btn" data-action="duplicate" aria-label="Duplicate ${name}" title="Duplicate (${isMac ? '⌘D' : 'Ctrl+D'})">${copyIcon}</button>
            <button type="button" class="icon-btn danger" data-action="delete" aria-label="Delete ${name}" title="Delete">${deleteIcon}</button>
          </span>
        </li>`;
    })
    .join('');
}
