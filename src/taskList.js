// 왼쪽 태스크 목록 패널을 그리는 모듈 (그룹 접기·들여쓰기, 행마다 수정/복제/삭제 버튼, 선택 행 강조)
import { escapeHTML, formatDate, plural, toISODate } from './utils.js';
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
const chevronIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>`;

/**
 * @param {object} opts
 * @param {object[]} opts.rows 보이는 행 (접힌 그룹의 자식·필터에 안 맞는 행 제외)
 * @param {object[]} opts.all 지금 프로젝트의 모든 태스크 (개수·자식 수 계산용)
 * @param {string | null} opts.selectedId
 * @param {boolean} opts.canReorder 끌어서 순서 바꾸기를 보여 줄지 (필터 중에는 끔)
 * @param {string} [opts.today] "YYYY-MM-DD"
 */
export function renderTaskList({ rows, all, selectedId, canReorder, today = toISODate(new Date()) }) {
  // 개수와 늦은 태스크 수는 그룹을 빼고 센다 (그룹 상태는 자식에서 나오므로 두 번 세지 않게)
  const items = all.filter((t) => t.type !== 'group');
  const late = items.filter((t) => isLate(scheduleStatus(t, today))).length;
  countEl.textContent = plural(items.length, 'task') + (late ? ` · ${late} late` : '');
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
      const lateText = escapeHTML(statusText(status, task.progress));
      const group = task.type === 'group';
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
          <span class="task-date">${formatDate(task.start)}</span>
          <span class="task-date task-end"${late ? ` title="${lateText}"` : ''}>${late ? `<span class="late-icon">${alertIcon}</span><span class="sr-only">${lateText}. </span>` : ''}${formatDate(task.end)}</span>
          <span class="task-progress">
            <span class="progress-track"><span class="progress-fill" style="width:${task.progress}%"></span></span>
            <span class="progress-value">${task.progress}%</span>
          </span>
          <span class="row-actions">
            <button type="button" class="icon-btn" data-action="edit" aria-label="Edit ${name}" title="Edit">${editIcon}</button>
            <button type="button" class="icon-btn" data-action="duplicate" aria-label="Duplicate ${name}" title="Duplicate (${isMac ? '⌘D' : 'Ctrl+D'})">${copyIcon}</button>
            <button type="button" class="icon-btn danger" data-action="delete" aria-label="Delete ${name}" title="Delete">${deleteIcon}</button>
          </span>
        </li>`;
    })
    .join('');
}
