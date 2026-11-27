// 앱 진입점: 태스크 상태를 들고 왼쪽 목록과 frappe-gantt 차트를 함께 렌더링
import Gantt from 'frappe-gantt';
import './style.css';
import { sampleTasks } from './sampleTasks.js';
import { loadTasks, saveTasks } from './storage.js';
import { openTaskModal } from './taskModal.js';

let tasks = loadTasks() ?? sampleTasks;

const rowsEl = document.getElementById('task-rows');

const toISODate = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const addDays = (date, days) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

const formatDate = (iso) => iso.replaceAll('-', '.');

const escapeHTML = (str) =>
  str.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const newId = () => `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function renderList() {
  if (!tasks.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = '태스크가 없습니다. ‘+ 태스크 추가’로 시작해 보세요.';
    rowsEl.replaceChildren(li);
    return;
  }

  rowsEl.replaceChildren(
    ...tasks.map((task) => {
      const li = document.createElement('li');
      li.innerHTML = `
        <button type="button" class="task-row" data-id="${escapeHTML(task.id)}">
          <span class="task-name" title="${escapeHTML(task.name)}">${escapeHTML(task.name)}</span>
          <span class="task-date">${formatDate(task.start)}</span>
          <span class="task-date">${formatDate(task.end)}</span>
          <span class="task-progress">
            <span class="progress-track"><span class="progress-fill" style="width:${task.progress}%"></span></span>
            <span class="progress-value">${task.progress}%</span>
          </span>
        </button>`;
      return li;
    }),
  );
}

// frappe-gantt는 넘겨받은 객체를 직접 수정하므로 복사본을 넘긴다
const chartTasks = () => tasks.map((t) => ({ ...t, dependencies: [...(t.dependencies ?? [])] }));

// 상태를 바꾸는 유일한 경로: 저장 → 목록 갱신 → (필요하면) 차트 다시 그리기
function commit(next, { redraw = true } = {}) {
  tasks = next;
  saveTasks(tasks);
  renderList();
  if (redraw) {
    // refresh는 스크롤을 처음 위치로 되돌리므로 보던 위치를 유지한다
    const { scrollLeft } = gantt.$container;
    gantt.refresh(chartTasks());
    gantt.$container.scrollLeft = scrollLeft;
    // 같은 위치로 되돌리면 scroll 이벤트가 안 나서 상단 월 표시(current-upper)가 비므로 직접 발생시킨다
    gantt.$container.dispatchEvent(new Event('scroll'));
  }
}

function updateTask(id, changes, options) {
  commit(
    tasks.map((t) => (t.id === id ? { ...t, ...changes } : t)),
    options,
  );
}

function deleteTask(id) {
  commit(
    tasks
      .filter((t) => t.id !== id)
      .map((t) => ({ ...t, dependencies: (t.dependencies ?? []).filter((d) => d !== id) })),
  );
}

function openAdd() {
  const today = new Date();
  openTaskModal({
    task: { name: '', start: toISODate(today), end: toISODate(addDays(today, 4)), progress: 0, dependencies: [] },
    isNew: true,
    tasks,
    onSave: (data) => commit([...tasks, { id: newId(), ...data }]),
  });
}

function openEdit(id) {
  const task = tasks.find((t) => t.id === id);
  if (!task) return;
  gantt.hide_popup();
  openTaskModal({
    task,
    isNew: false,
    tasks,
    onSave: (data) => updateTask(id, data),
    onDelete: () => deleteTask(id),
  });
}

const gantt = new Gantt('#gantt', chartTasks(), {
  language: 'ko',
  view_mode: 'Day',
  bar_height: 30,
  padding: 18,
  upper_header_height: 45,
  lower_header_height: 30,
  bar_corner_radius: 6,
  scroll_to: 'start',
  today_button: false,
  view_mode_select: false,
  popup: (ctx) => {
    const { task } = ctx;
    ctx.set_title(escapeHTML(task.name));
    ctx.set_subtitle('');
    const start = formatDate(toISODate(task._start));
    const end = formatDate(toISODate(new Date(task._end.getTime() - 1000)));
    ctx.set_details(`${start} ~ ${end} (${task.actual_duration}일)<br/>진행률 ${Math.round(task.progress)}%`);
  },
  // 라이브러리가 정하는 컨테이너 높이는 가로 스크롤바 두께만큼 모자라 세로 스크롤이 생기므로 보정한다
  on_view_change() {
    const el = this.$container;
    el.style.height = `${this.grid_height + (el.offsetHeight - el.clientHeight)}px`;
  },
  on_double_click: (task) => openEdit(task.id),
  on_date_change: (task, start, end) => {
    updateTask(task.id, { start: toISODate(start), end: toISODate(end) }, { redraw: false });
  },
  on_progress_change: (task, progress) => {
    updateTask(task.id, { progress: Math.round(progress) }, { redraw: false });
  },
});

document.querySelectorAll('.view-modes button').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.view-modes button').forEach((b) => b.classList.toggle('active', b === btn));
    gantt.change_view_mode(btn.dataset.mode);
  });
});

document.getElementById('today-btn').addEventListener('click', () => gantt.scroll_current());
document.getElementById('add-btn').addEventListener('click', openAdd);

rowsEl.addEventListener('click', (e) => {
  const row = e.target.closest('.task-row');
  if (row) openEdit(row.dataset.id);
});

renderList();
