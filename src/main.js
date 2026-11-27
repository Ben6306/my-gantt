// 앱 진입점: 태스크 상태를 들고 왼쪽 목록·frappe-gantt 차트·모달을 서로 연결
import Gantt from 'frappe-gantt';
import './style.css';
import { sampleTasks } from './sampleTasks.js';
import { loadTasks, saveTasks } from './storage.js';
import { renderTaskList } from './taskList.js';
import { openTaskModal } from './taskModal.js';
import { confirmDialog } from './confirmDialog.js';
import { addDays, escapeHTML, formatDate, joinDeps, parseDeps, toISODate } from './utils.js';

// 이전 버전은 dependencies를 배열로 저장했으므로 문자열 형식으로 맞춘다
const normalize = (list) => list.map((t) => ({ ...t, dependencies: joinDeps(parseDeps(t.dependencies)) }));

let tasks = normalize(loadTasks() ?? sampleTasks);
let selectedId = null;

const rowsEl = document.getElementById('task-rows');

const nextId = () => String(Math.max(0, ...tasks.map((t) => Number(t.id)).filter(Number.isFinite)) + 1);

// frappe-gantt는 넘겨받은 객체를 직접 수정하므로 복사본을 넘긴다
const chartTasks = () => tasks.map((t) => ({ ...t, dependencies: parseDeps(t.dependencies) }));

// 선택된 태스크의 차트 행과 막대를 강조한다. 차트를 다시 그리면 클래스가 사라지므로 렌더링마다 호출한다.
function highlightChart(chart = gantt) {
  chart.$svg.querySelectorAll('.is-selected').forEach((el) => el.classList.remove('is-selected'));
  if (!selectedId) return;
  const index = tasks.findIndex((t) => t.id === selectedId);
  chart.$svg.querySelectorAll('.grid-row')[index]?.classList.add('is-selected');
  chart.$svg.querySelector(`.bar-wrapper[data-id="${CSS.escape(selectedId)}"]`)?.classList.add('is-selected');
}

function scrollChartTo(id) {
  const bar = gantt.$svg.querySelector(`.bar-wrapper[data-id="${CSS.escape(id)}"] .bar`);
  if (!bar) return;
  gantt.$container.scrollTo({ left: Math.max(0, Number(bar.getAttribute('x')) - 80), behavior: 'smooth' });
}

function selectTask(id, { scrollChart = false } = {}) {
  selectedId = id;
  rowsEl.querySelectorAll('.task-row').forEach((row) => {
    const selected = row.dataset.id === id;
    row.classList.toggle('is-selected', selected);
    row.toggleAttribute('aria-current', selected);
  });
  highlightChart();
  if (scrollChart) scrollChartTo(id);
}

// 상태를 바꾸는 유일한 경로: 저장 → 목록 갱신 → (필요하면) 차트 다시 그리기
function commit(next, { redraw = true } = {}) {
  tasks = next;
  saveTasks(tasks);
  renderTaskList(tasks, selectedId);
  if (redraw) {
    // refresh는 스크롤을 처음 위치로 되돌리므로 보던 위치를 유지한다
    const { scrollLeft } = gantt.$container;
    gantt.refresh(chartTasks());
    gantt.$container.scrollLeft = scrollLeft;
    // 같은 위치로 되돌리면 scroll 이벤트가 안 나서 상단 월 표시(current-upper)가 비므로 직접 발생시킨다
    gantt.$container.dispatchEvent(new Event('scroll'));
  }
  highlightChart();
}

function updateTask(id, changes, options) {
  commit(
    tasks.map((t) => (t.id === id ? { ...t, ...changes } : t)),
    options,
  );
}

async function requestDelete(id) {
  const task = tasks.find((t) => t.id === id);
  if (!task) return false;
  const ok = await confirmDialog({
    title: '태스크 삭제',
    message: `‘${task.name}’ 태스크를 삭제할까요? 삭제하면 되돌릴 수 없습니다.`,
    confirmText: '삭제',
  });
  if (!ok) return false;

  if (selectedId === id) selectedId = null;
  commit(
    tasks
      .filter((t) => t.id !== id)
      .map((t) => ({ ...t, dependencies: joinDeps(parseDeps(t.dependencies).filter((d) => d !== id)) })),
  );
  return true;
}

async function resetProject() {
  const ok = await confirmDialog({
    title: '새 프로젝트',
    message: tasks.length
      ? `현재 태스크 ${tasks.length}개를 모두 지우고 빈 프로젝트로 시작할까요? 되돌릴 수 없습니다.`
      : '이미 빈 프로젝트입니다. 그래도 초기화할까요?',
    confirmText: '모두 지우기',
  });
  if (!ok) return;
  selectedId = null;
  commit([]);
}

function openAdd() {
  const today = new Date();
  openTaskModal({
    task: { name: '', start: toISODate(today), end: toISODate(addDays(today, 4)), progress: 0, dependencies: '' },
    isNew: true,
    tasks,
    onSave: (data) => {
      const id = nextId();
      selectedId = id;
      commit([...tasks, { id, ...data }]);
      scrollChartTo(id);
    },
  });
}

function openEdit(id) {
  const task = tasks.find((t) => t.id === id);
  if (!task) return;
  gantt.hide_popup();
  selectTask(id);
  openTaskModal({
    task,
    isNew: false,
    tasks,
    onSave: (data) => updateTask(id, data),
    onDelete: () => requestDelete(id),
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
  on_view_change() {
    // 라이브러리가 정하는 컨테이너 높이는 가로 스크롤바 두께만큼 모자라 세로 스크롤이 생기므로 보정한다
    const el = this.$container;
    el.style.height = `${this.grid_height + (el.offsetHeight - el.clientHeight)}px`;
    highlightChart(this);
  },
  on_click: (task) => selectTask(task.id),
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
document.getElementById('reset-btn').addEventListener('click', resetProject);

rowsEl.addEventListener('click', (e) => {
  const row = e.target.closest('.task-row');
  if (!row) return;
  const action = e.target.closest('[data-action]')?.dataset.action;
  if (action === 'edit') openEdit(row.dataset.id);
  else if (action === 'delete') requestDelete(row.dataset.id);
  else selectTask(row.dataset.id, { scrollChart: true });
});

rowsEl.addEventListener('keydown', (e) => {
  if (!e.target.classList.contains('task-row')) return;
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    selectTask(e.target.dataset.id, { scrollChart: true });
  }
});

renderTaskList(tasks, selectedId);
