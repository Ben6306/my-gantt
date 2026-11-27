// 왼쪽 태스크 목록 패널을 그리는 모듈 (행마다 수정/삭제 버튼, 선택 행 강조)
import { escapeHTML, formatDate, plural } from './utils.js';

const rowsEl = document.getElementById('task-rows');
const countEl = document.getElementById('task-count');

// lucide 아이콘(grip-vertical, pencil, trash-2), ISC 라이선스
const gripIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/></svg>`;
const editIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/></svg>`;
const deleteIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>`;

export function renderTaskList(tasks, selectedId) {
  countEl.textContent = plural(tasks.length, 'task');

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
      const selected = task.id === selectedId;
      return `
        <li class="task-row c-${escapeHTML(task.color)}${selected ? ' is-selected' : ''}${task.progress === 100 ? ' is-done' : ''}" data-id="${escapeHTML(task.id)}" tabindex="0"${selected ? ' aria-current="true"' : ''}>
          <span class="drag-handle" draggable="true" title="Drag to reorder (Alt+↑/↓)">${gripIcon}</span>
          <span class="task-name" title="${name}"><span class="color-dot"></span><span class="task-name-text">${name}</span></span>
          <span class="task-date">${formatDate(task.start)}</span>
          <span class="task-date">${formatDate(task.end)}</span>
          <span class="task-progress">
            <span class="progress-track"><span class="progress-fill" style="width:${task.progress}%"></span></span>
            <span class="progress-value">${task.progress}%</span>
          </span>
          <span class="row-actions">
            <button type="button" class="icon-btn" data-action="edit" aria-label="Edit ${name}" title="Edit">${editIcon}</button>
            <button type="button" class="icon-btn danger" data-action="delete" aria-label="Delete ${name}" title="Delete">${deleteIcon}</button>
          </span>
        </li>`;
    })
    .join('');
}
