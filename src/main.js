// 앱 진입점: 태스크 상태를 들고 왼쪽 목록과 frappe-gantt 차트를 함께 렌더링
import Gantt from 'frappe-gantt';
import './style.css';
import { sampleTasks } from './sampleTasks.js';

let tasks = sampleTasks.map((t) => ({ ...t }));

const rowsEl = document.getElementById('task-rows');

const toISODate = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const formatDate = (iso) => iso.replaceAll('-', '.');

const escapeHTML = (str) =>
  str.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function renderList() {
  rowsEl.replaceChildren(
    ...tasks.map((task) => {
      const li = document.createElement('li');
      li.className = 'task-row';
      li.dataset.id = task.id;
      li.innerHTML = `
        <span class="task-name" title="${escapeHTML(task.name)}">${escapeHTML(task.name)}</span>
        <span class="task-date">${formatDate(task.start)}</span>
        <span class="task-date">${formatDate(task.end)}</span>
        <span class="task-progress">
          <span class="progress-track"><span class="progress-fill" style="width:${task.progress}%"></span></span>
          <span class="progress-value">${task.progress}%</span>
        </span>`;
      return li;
    }),
  );
}

function updateTask(id, changes) {
  tasks = tasks.map((t) => (t.id === id ? { ...t, ...changes } : t));
  renderList();
}

// frappe-gantt는 넘겨받은 객체를 직접 수정하므로 복사본을 넘긴다
const chartTasks = () => tasks.map((t) => ({ ...t }));

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
  on_date_change: (task, start, end) => {
    updateTask(task.id, { start: toISODate(start), end: toISODate(end) });
  },
  on_progress_change: (task, progress) => {
    updateTask(task.id, { progress: Math.round(progress) });
  },
});

document.querySelectorAll('.view-modes button').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.view-modes button').forEach((b) => b.classList.toggle('active', b === btn));
    gantt.change_view_mode(btn.dataset.mode);
  });
});

document.getElementById('today-btn').addEventListener('click', () => gantt.scroll_current());

renderList();
