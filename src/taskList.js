// 왼쪽 태스크 목록 패널을 그리는 모듈 (행마다 수정/삭제 버튼, 선택 행 강조)
import { escapeHTML, formatDate } from './utils.js';

const rowsEl = document.getElementById('task-rows');
const countEl = document.getElementById('task-count');

const editIcon = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M11.3 2.3a1.4 1.4 0 0 1 2 2L5.6 12l-2.8.7.7-2.8z"/></svg>`;
const deleteIcon = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5"/></svg>`;

export function renderTaskList(tasks, selectedId) {
  countEl.textContent = `태스크 ${tasks.length}개`;

  if (!tasks.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = '태스크가 없습니다. ‘+ 태스크 추가’로 시작해 보세요.';
    rowsEl.replaceChildren(li);
    return;
  }

  rowsEl.innerHTML = tasks
    .map((task) => {
      const name = escapeHTML(task.name);
      const selected = task.id === selectedId;
      return `
        <li class="task-row${selected ? ' is-selected' : ''}" data-id="${escapeHTML(task.id)}" tabindex="0"${selected ? ' aria-current="true"' : ''}>
          <span class="task-name" title="${name}">${name}</span>
          <span class="task-date">${formatDate(task.start)}</span>
          <span class="task-date">${formatDate(task.end)}</span>
          <span class="task-progress">
            <span class="progress-track"><span class="progress-fill" style="width:${task.progress}%"></span></span>
            <span class="progress-value">${task.progress}%</span>
          </span>
          <span class="row-actions">
            <button type="button" class="icon-btn" data-action="edit" aria-label="${name} 수정" title="수정">${editIcon}</button>
            <button type="button" class="icon-btn danger" data-action="delete" aria-label="${name} 삭제" title="삭제">${deleteIcon}</button>
          </span>
        </li>`;
    })
    .join('');
}
