// 왼쪽 태스크 목록 패널을 그리는 모듈 (행마다 수정/삭제 버튼, 선택 행 강조)
import { escapeHTML, formatDate, plural, toISODate } from './utils.js';
import { isLate, scheduleStatus, statusText } from './status.js';

const rowsEl = document.getElementById('task-rows');
const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
const countEl = document.getElementById('task-count');

// lucide 아이콘(grip-vertical, pencil, trash-2), ISC 라이선스
const gripIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/></svg>`;
const editIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/></svg>`;
// lucide copy, notebook-text
const copyIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`;
const noteIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 6h4"/><path d="M2 10h4"/><path d="M2 14h4"/><path d="M2 18h4"/><rect width="16" height="20" x="4" y="2" rx="2"/><path d="M9.5 8h5"/><path d="M9.5 12H16"/><path d="M9.5 16H14"/></svg>`;

// lucide circle-alert
const alertIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>`;
const deleteIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>`;

export function renderTaskList(tasks, selectedId, today = toISODate(new Date())) {
  const statuses = new Map(tasks.map((t) => [t.id, scheduleStatus(t, today)]));
  const late = [...statuses.values()].filter(isLate).length;
  countEl.textContent = plural(tasks.length, 'task') + (late ? ` · ${late} late` : '');
  countEl.classList.toggle('has-late', late > 0);

  if (!tasks.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'No tasks yet. Click “Add task” to get started.';
    rowsEl.replaceChildren(li);
    return;
  }

  rowsEl.innerHTML = tasks
    .map((task) => {
      const name = escapeHTML(task.name);
      // 마우스를 올리면 전체 이름과 메모
      const tooltip = escapeHTML(task.notes ? `${task.name}\n\n${task.notes}` : task.name);
      const selected = task.id === selectedId;
      const status = statuses.get(task.id);
      const late = isLate(status);
      const lateText = escapeHTML(statusText(status, task.progress));
      return `
        <li class="task-row c-${escapeHTML(task.color)}${selected ? ' is-selected' : ''}${task.progress === 100 ? ' is-done' : ''}${late ? ` is-${status.status}` : ''}${task.type === 'milestone' ? ' is-milestone' : ''}" data-id="${escapeHTML(task.id)}" tabindex="0"${selected ? ' aria-current="true"' : ''}>
          <span class="drag-handle" draggable="true" title="Drag to reorder (Alt+↑/↓)">${gripIcon}</span>
          <span class="task-name" title="${tooltip}"><span class="color-dot"></span><span class="task-name-text">${name}</span>${task.notes ? `<span class="note-icon" aria-label="Has notes">${noteIcon}</span>` : ''}</span>
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
