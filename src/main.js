// 앱 진입점: 태스크 상태를 들고 왼쪽 목록·frappe-gantt 차트·모달을 서로 연결
import Gantt from 'frappe-gantt';
// 동료 PC(윈도우 등)에서도 같은 글꼴로 보이도록 Pretendard를 함께 배포한다. 쓰는 글자 조각만 내려받는다.
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import './style.css';
import { sampleTasks } from './sampleTasks.js';
import { loadLegacyProject, loadProjectsState, saveProjectsState } from './storage.js';
import { createProject, initState, removeProject } from './projects.js';
import { renderTaskList } from './taskList.js';
import { openTaskModal } from './taskModal.js';
import { confirmDialog } from './confirmDialog.js';
import { backupFileName, buildBackup, parseBackup } from './backup.js';
import { showToast } from './toast.js';
import { addDays, escapeHTML, formatDate, joinDeps, moveItem, parseDeps, parseISODate, plural, toISODate } from './utils.js';
import { colorFor, isColorKey } from './colors.js';
import { DEFAULT_ZOOM, MODE_DEFAULT_ZOOM, ZOOM_LEVELS, fitZoom, spanDays } from './zoom.js';
import { exportPng } from './exportPng.js';
import { createHistory } from './history.js';
import { initListResizer } from './listResizer.js';

const DEFAULT_PROJECT_NAME = 'Untitled project';

// 이전 버전 데이터 맞추기: dependencies 배열 → 문자열, 색상이 없으면 순서대로 기본 색
const normalize = (list) =>
  list.map((t, i) => ({
    ...t,
    dependencies: joinDeps(parseDeps(t.dependencies)),
    color: isColorKey(t.color) ? t.color : colorFor(i),
  }));

// 저장된 프로젝트 목록을 읽는다. 처음이면 예전 단일 프로젝트 데이터(설치한 앱의 기존 태스크)를 첫 프로젝트로 옮긴다
const legacy = loadLegacyProject();
const initial = initState({
  stored: loadProjectsState(),
  legacyTasks: legacy.tasks,
  legacyName: legacy.name,
  fallbackTasks: sampleTasks,
  defaultName: DEFAULT_PROJECT_NAME,
});
// 프로젝트 목록. 지금 프로젝트의 태스크·이름은 아래 tasks·projectName에서 고치고 persist()로 목록에 되돌려 쓴다
let projects = initial.projects.map((p) => ({ ...p, tasks: normalize(p.tasks) }));
let currentId = initial.currentId;
const currentProject = () => projects.find((p) => p.id === currentId);
let tasks = currentProject().tasks;
let selectedId = null;
let projectName = '';
let zoomIndex = DEFAULT_ZOOM;

// 실행 취소 이력은 메모리에만 둔다 (새로고침하면 사라짐)
const history = createHistory(100);
const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
const UNDO_KEY = isMac ? '⌘Z' : 'Ctrl+Z';
const REDO_KEY = isMac ? '⇧⌘Z' : 'Ctrl+Y';
let recordingBatch = false;
// 차트에서 막대를 끄는 동안 frappe-gantt는 마우스가 움직일 때마다 날짜 변경을 알린다(bar.js update_bar_position).
// 누른 순간부터 뗄 때까지를 한 번으로 기록하기 위한 상태
let pointerDownOnChart = false;
let gestureRecorded = false;

// 바뀌기 전 상태를 이력에 남긴다. 한 동작에서 이어지는 변경은 하나로 묶는다
// (막대를 끄는 동안의 연속 변경과 의존 태스크 이동, 태스크와 이름을 함께 바꾸는 불러오기)
function record(label) {
  if (recordingBatch) return;
  if (pointerDownOnChart) {
    if (gestureRecorded) return;
    gestureRecorded = true;
  }
  history.record(snapshot(), label);
  recordingBatch = true;
  setTimeout(() => {
    recordingBatch = false;
  });
}

// 지금 프로젝트의 작업 사본(tasks·projectName)을 목록에 반영한 전체 상태 (이력·저장용)
function snapshot() {
  return {
    projects: projects.map((p) => (p.id === currentId ? { ...p, name: projectName, tasks } : p)),
    currentId,
  };
}

function persist() {
  projects = snapshot().projects;
  saveProjectsState({ projects, currentId });
}

const rowsEl = document.getElementById('task-rows');
const listEl = document.querySelector('.task-list');
const projectNameInput = document.getElementById('project-name');

const nextId = () => String(Math.max(0, ...tasks.map((t) => Number(t.id)).filter(Number.isFinite)) + 1);

// 막대 색은 custom_class(.c-<색>)로 style.css에서 입힌다.
// color는 넘기지 않는다: frappe-gantt가 task.color를 막대 fill에 그대로 넣어서 'blue'·'red'가 원색으로 칠해진다.
const chartTasks = () =>
  tasks.map(({ color, ...t }) => ({ ...t, dependencies: parseDeps(t.dependencies), custom_class: `c-${color}` }));

function setProjectName(name, { save = true, label } = {}) {
  const next = name.trim() || DEFAULT_PROJECT_NAME;
  if (label && next !== projectName) record(label);
  projectName = next;
  projectNameInput.value = projectName;
  document.title = `${projectName} · Gantt`;
  if (save) persist();
  updateHistoryControls();
  renderProjectMenu();
}

// 선택된 태스크의 차트 행과 막대를 강조한다. 차트를 다시 그리면 클래스가 사라지므로 렌더링마다 호출한다.
function highlightChart(chart = gantt) {
  chart.$svg.querySelectorAll('.is-selected').forEach((el) => el.classList.remove('is-selected'));
  if (!selectedId) return;
  const index = tasks.findIndex((t) => t.id === selectedId);
  chart.$svg.querySelectorAll('.grid-row')[index]?.classList.add('is-selected');
  chart.$svg.querySelector(`.bar-wrapper[data-id="${CSS.escape(selectedId)}"]`)?.classList.add('is-selected');
}

// 막대가 보이게 가로로 옮기고, 세로로는 날짜 헤더에 가리거나 화면 아래로 벗어난 경우에만 옮긴다
function scrollChartTo(id) {
  const bar = gantt.$svg.querySelector(`.bar-wrapper[data-id="${CSS.escape(id)}"] .bar`);
  if (!bar) return;
  const el = gantt.$container;
  const y = Number(bar.getAttribute('y'));
  const barH = gantt.options.bar_height;
  const pad = gantt.options.padding;
  let top = el.scrollTop;
  if (y - pad < top + gantt.config.header_height) top = y - pad - gantt.config.header_height;
  else if (y + barH + pad > top + el.clientHeight) top = y + barH + pad - el.clientHeight;
  el.scrollTo({ left: Math.max(0, Number(bar.getAttribute('x')) - 80), top: Math.max(0, top), behavior: 'smooth' });
}

// 차트는 목록보다 조금 길다(frappe 아래 여백 + 가로 스크롤바). 그만큼 목록 아래를 채워 맨 아래까지 내려도 행이 맞게 한다
function fitListSpacer(chart = gantt) {
  const el = chart.$container;
  const rowsHeight = chart.config.header_height + (chart.options.bar_height + chart.options.padding) * chart.tasks.length;
  const extra = chart.grid_height - rowsHeight + (el.offsetHeight - el.clientHeight);
  listEl.style.setProperty('--list-spacer', `${Math.max(0, extra)}px`);
}

/*
 * 차트를 다시 그리거나 줌해도 보던 곳을 지키기 위해 픽셀 대신 '시각'을 기억한다.
 * frappe-gantt는 스크롤할 때 시작 날짜를 앞으로 계속 늘리고(infinite_padding), refresh하면 원래 범위로 되돌린다.
 * 그래서 픽셀 위치를 그대로 되돌리면 엉뚱한 날짜(몇 달 뒤)로 가 버린다.
 * gantt.dates는 칸마다 시작 시각이라 칸 너비·보기 단위가 바뀌어도 같은 시각을 찾을 수 있다.
 */
// 차트 화면 왼쪽에서 px만큼 떨어진 지점의 시각(ms)
function timeAtView(px) {
  const { dates } = gantt;
  const cw = gantt.config.column_width;
  const pos = gantt.$container.scrollLeft + px;
  const i = Math.min(Math.max(Math.floor(pos / cw), 0), dates.length - 2);
  return dates[i].getTime() + ((pos - i * cw) / cw) * (dates[i + 1] - dates[i]);
}

// 그 시각이 차트 화면 왼쪽에서 px 떨어진 곳에 오도록 스크롤
function scrollTimeTo(time, px) {
  const { dates } = gantt;
  const cw = gantt.config.column_width;
  let i = dates.findIndex((d, k) => k === dates.length - 1 || dates[k + 1].getTime() > time);
  i = Math.min(Math.max(i, 0), dates.length - 2);
  const pos = i * cw + ((time - dates[i]) / (dates[i + 1] - dates[i])) * cw;
  gantt.$container.scrollLeft = Math.max(0, pos - px);
}

function applyZoom(index, { anchorTime } = {}) {
  zoomIndex = Math.min(Math.max(index, 0), ZOOM_LEVELS.length - 1);
  const level = ZOOM_LEVELS[zoomIndex];
  const center = gantt.$container.clientWidth / 2;
  // 줌 전후로 화면 가운데 날짜가 그대로 있게 한다
  const time = anchorTime ?? timeAtView(center);
  gantt.options.column_width = level.columnWidth;
  gantt.change_view_mode(level.mode);
  scrollTimeTo(time, anchorTime === undefined ? center : 0);
  gantt.$container.dispatchEvent(new Event('scroll'));
  updateZoomControls();
}

function updateZoomControls() {
  const { mode } = ZOOM_LEVELS[zoomIndex];
  document.querySelectorAll('.view-modes button').forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
  document.getElementById('zoom-in').disabled = zoomIndex === 0;
  document.getElementById('zoom-out').disabled = zoomIndex === ZOOM_LEVELS.length - 1;
}

// 일정 전체가 한 화면에 들어오는 단계로 바꾸고, 첫 태스크가 왼쪽에서 한 칸 띄워 보이게 한다
function fitToScreen() {
  if (!tasks.length) return;
  const index = fitZoom(spanDays(tasks), gantt.$container.clientWidth);
  const first = tasks.reduce((m, t) => (t.start < m ? t.start : m), tasks[0].start);
  applyZoom(index, { anchorTime: parseISODate(first).getTime() });
  gantt.$container.scrollLeft -= gantt.config.column_width;
}

// 태스크를 바꾸는 유일한 경로: (label이 있으면) 이력 기록 → 저장 → 목록 갱신 → (필요하면) 차트 다시 그리기
function commit(next, { redraw = true, label } = {}) {
  if (label) record(label);
  tasks = next;
  persist();
  renderTaskList(tasks, selectedId);
  if (redraw) redrawChart({ keepScroll: true });
  highlightChart();
  updateHistoryControls();
  renderProjectMenu();
}

// keepScroll: 보던 날짜 유지(같은 프로젝트를 고친 경우). 아니면 다른 프로젝트라서 일정 시작·맨 위로
function redrawChart({ keepScroll }) {
  const time = timeAtView(0);
  gantt.refresh(chartTasks());
  if (keepScroll) {
    scrollTimeTo(time, 0);
  } else {
    if (tasks.length) gantt.set_scroll_position('start');
    gantt.$container.scrollTop = 0;
  }
  // 같은 위치로 되돌리면 scroll 이벤트가 안 나서 상단 월 표시(current-upper)가 비므로 직접 발생시킨다
  gantt.$container.dispatchEvent(new Event('scroll'));
}

// 지금 프로젝트(currentId)를 화면에 그린다
function showProject({ keepScroll = false } = {}) {
  tasks = currentProject().tasks;
  if (selectedId && !tasks.some((t) => t.id === selectedId)) selectedId = null;
  setProjectName(currentProject().name, { save: false });
  renderTaskList(tasks, selectedId);
  redrawChart({ keepScroll });
  highlightChart();
  updateHistoryControls();
}

// 프로젝트 목록·지금 프로젝트를 바꾸고 저장한 뒤 화면을 다시 그린다 (이력 기록은 부르는 쪽에서)
function setProjects(next, nextCurrentId) {
  const sameProject = nextCurrentId === currentId;
  projects = next;
  currentId = nextCurrentId;
  if (!sameProject) selectedId = null;
  saveProjectsState({ projects, currentId });
  showProject({ keepScroll: sameProject });
}

function switchProject(id) {
  if (id !== currentId) setProjects(projects, id);
}

function newProject() {
  record('New project');
  const project = createProject(DEFAULT_PROJECT_NAME);
  setProjects([...projects, project], project.id);
  // 바로 새 이름을 입력할 수 있게 한다
  projectNameInput.focus();
  projectNameInput.select();
}

async function requestDeleteProject() {
  const ok = await confirmDialog({
    title: 'Delete project',
    message: `Delete “${projectName}” and its ${plural(tasks.length, 'task')}? You can undo this with ${UNDO_KEY}.`,
    confirmText: 'Delete project',
  });
  if (!ok) return;
  record(`Delete project “${projectName}”`);
  const next = removeProject({ projects, currentId }, currentId, DEFAULT_PROJECT_NAME);
  setProjects(next.projects, next.currentId);
}

const projectMenu = document.getElementById('project-menu');
const projectMenuBtn = document.getElementById('project-menu-btn');

function renderProjectMenu() {
  const list = document.getElementById('project-list');
  list.replaceChildren(
    ...projects.map((p) => {
      const isCurrent = p.id === currentId;
      // 지금 프로젝트는 고치는 중인 이름·태스크 수를 보여 준다
      const name = isCurrent ? projectName : p.name;
      const count = isCurrent ? tasks.length : p.tasks.length;
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `project-item${isCurrent ? ' is-current' : ''}`;
      btn.dataset.id = p.id;
      if (isCurrent) btn.setAttribute('aria-current', 'true');
      const nameEl = document.createElement('span');
      nameEl.className = 'project-item-name';
      nameEl.textContent = name;
      nameEl.title = name;
      const countEl = document.createElement('span');
      countEl.className = 'project-item-count';
      countEl.textContent = String(count);
      btn.append(nameEl, countEl);
      li.append(btn);
      return li;
    }),
  );
  document.getElementById('delete-project-btn').textContent =
    projects.length > 1 ? 'Delete this project' : 'Delete this project (clears it)';
}

function updateHistoryControls() {
  const undoBtn = document.getElementById('undo-btn');
  const redoBtn = document.getElementById('redo-btn');
  undoBtn.disabled = !history.canUndo;
  redoBtn.disabled = !history.canRedo;
  undoBtn.title = history.canUndo ? `Undo ${history.undoLabel} (${UNDO_KEY})` : `Undo (${UNDO_KEY})`;
  redoBtn.title = history.canRedo ? `Redo ${history.redoLabel} (${REDO_KEY})` : `Redo (${REDO_KEY})`;
}

// 이력의 상태로 되돌린다. 다른 프로젝트에서 일어난 변경이면 그 프로젝트로 옮겨 가 보여 준다
function applySnapshot(state) {
  setProjects(state.projects, state.currentId);
}

function undo() {
  const entry = history.undo(snapshot());
  if (!entry) return;
  applySnapshot(entry.state);
  showToast(`Undid: ${entry.label}`);
}

function redo() {
  const entry = history.redo(snapshot());
  if (!entry) return;
  applySnapshot(entry.state);
  showToast(`Redid: ${entry.label}`);
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
    title: 'Delete task',
    message: `Delete “${task.name}”? You can undo this with ${UNDO_KEY}.`,
    confirmText: 'Delete',
  });
  if (!ok) return false;

  if (selectedId === id) selectedId = null;
  commit(
    tasks
      .filter((t) => t.id !== id)
      .map((t) => ({ ...t, dependencies: joinDeps(parseDeps(t.dependencies).filter((d) => d !== id)) })),
    { label: `Delete “${task.name}”` },
  );
  return true;
}

async function exportImage(button) {
  if (!tasks.length) {
    showToast('Add a task before exporting an image.');
    return;
  }
  button.disabled = true;
  try {
    const { mode, columnWidth } = ZOOM_LEVELS[zoomIndex];
    const fileName = await exportPng({ tasks, projectName, mode, columnWidth });
    showToast(`Exported ${plural(tasks.length, 'task')} to ${fileName}.`);
  } catch (err) {
    showToast(`Couldn’t export the image. ${err.message}`, { type: 'error' });
  } finally {
    button.disabled = false;
  }
}

function exportBackup() {
  const blob = new Blob([JSON.stringify(buildBackup({ tasks, projectName }), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = backupFileName(projectName);
  a.click();
  setTimeout(() => URL.revokeObjectURL(url));
  showToast(`Exported ${plural(tasks.length, 'task')} to ${a.download}.`);
}

async function importBackup(file) {
  let result;
  try {
    result = parseBackup(await file.text());
  } catch (err) {
    showToast(`Couldn’t import the file. ${err.message}`, { type: 'error' });
    return;
  }

  // 지금 프로젝트를 덮어쓰지 않고 새 프로젝트로 추가한다 (잃는 것이 없으므로 묻지 않는다)
  const name = result.projectName ?? file.name.replace(/\.json$/i, '');
  record(`Import “${name}”`);
  const project = createProject(name, result.tasks);
  setProjects([...projects, project], project.id);
  const dropped = result.droppedDeps ? ` Removed ${plural(result.droppedDeps, 'link')} to missing tasks.` : '';
  showToast(`Imported “${name}” as a new project with ${plural(result.tasks.length, 'task')}.${dropped}`);
}

function openAdd() {
  const today = new Date();
  openTaskModal({
    task: {
      name: '',
      start: toISODate(today),
      end: toISODate(addDays(today, 4)),
      progress: 0,
      dependencies: '',
      color: colorFor(tasks.length),
    },
    isNew: true,
    tasks,
    onSave: (data) => {
      const id = nextId();
      selectedId = id;
      commit([...tasks, { id, ...data }], { label: `Add “${data.name}”` });
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
    onSave: (data) => {
      updateTask(id, data, { label: `Edit “${task.name}”` });
      // 날짜를 바꿨을 수 있으므로 저장한 태스크가 보이는 곳으로 이동한다
      scrollChartTo(id);
    },
    onDelete: () => requestDelete(id),
  });
}

const gantt = new Gantt('#gantt', chartTasks(), {
  language: 'en',
  view_mode: ZOOM_LEVELS[DEFAULT_ZOOM].mode,
  // 줌은 이 값을 바꿔서 한다 (지정하면 모든 보기 단위의 칸 너비를 덮어쓴다)
  column_width: ZOOM_LEVELS[DEFAULT_ZOOM].columnWidth,
  // 행 높이 = bar_height + padding = 40, 헤더 높이 = 36 + 30 + 10 = 76 (style.css의 --row-h, --head-h와 맞춘다)
  bar_height: 24,
  padding: 16,
  upper_header_height: 36,
  lower_header_height: 30,
  bar_corner_radius: 4,
  scroll_to: 'start',
  today_button: false,
  view_mode_select: false,
  popup: (ctx) => {
    const { task } = ctx;
    ctx.set_title(escapeHTML(task.name));
    ctx.set_subtitle('');
    const start = formatDate(toISODate(task._start));
    const end = formatDate(toISODate(new Date(task._end.getTime() - 1000)));
    ctx.set_details(`${start} – ${end} (${plural(task.actual_duration, 'day')})<br/>Progress ${Math.round(task.progress)}%`);
  },
  on_view_change() {
    fitListSpacer(this);
    highlightChart(this);
  },
  on_click: (task) => selectTask(task.id),
  on_double_click: (task) => openEdit(task.id),
  on_date_change: (task, start, end) => {
    updateTask(task.id, { start: toISODate(start), end: toISODate(end) }, { redraw: false, label: `Move “${task.name}”` });
  },
  on_progress_change: (task, progress) => {
    updateTask(task.id, { progress: Math.round(progress) }, { redraw: false, label: `Change progress of “${task.name}”` });
  },
});

document.querySelectorAll('.view-modes button').forEach((btn) => {
  btn.addEventListener('click', () => applyZoom(MODE_DEFAULT_ZOOM[btn.dataset.mode]));
});
document.getElementById('zoom-in').addEventListener('click', () => applyZoom(zoomIndex - 1));
document.getElementById('zoom-out').addEventListener('click', () => applyZoom(zoomIndex + 1));
document.getElementById('fit-btn').addEventListener('click', fitToScreen);

document.getElementById('today-btn').addEventListener('click', () => gantt.scroll_current());
document.getElementById('png-btn').addEventListener('click', (e) => exportImage(e.currentTarget));
document.getElementById('add-btn').addEventListener('click', openAdd);
document.getElementById('new-project-btn').addEventListener('click', newProject);

// 프로젝트 메뉴(popover): 버튼 아래에 붙여 연다. Esc·바깥 클릭으로 닫히는 것은 브라우저가 해 준다
projectMenu.addEventListener('toggle', (e) => {
  const open = e.newState === 'open';
  projectMenuBtn.setAttribute('aria-expanded', String(open));
  if (open) {
    const r = projectMenuBtn.getBoundingClientRect();
    projectMenu.style.top = `${r.bottom + 6}px`;
    projectMenu.style.left = `${Math.max(8, r.left - 8)}px`;
    projectMenu.querySelector('.is-current')?.focus();
  }
});
projectMenu.addEventListener('click', (e) => {
  const item = e.target.closest('.project-item');
  if (item) {
    projectMenu.hidePopover();
    switchProject(item.dataset.id);
  } else if (e.target.closest('#menu-new-project-btn')) {
    projectMenu.hidePopover();
    newProject();
  } else if (e.target.closest('#delete-project-btn')) {
    projectMenu.hidePopover();
    requestDeleteProject();
  }
});
document.getElementById('export-btn').addEventListener('click', exportBackup);

const importInput = document.getElementById('import-file');
document.getElementById('import-btn').addEventListener('click', () => importInput.click());
importInput.addEventListener('change', () => {
  const [file] = importInput.files;
  // 같은 파일을 다시 골라도 change가 일어나도록 비운다
  importInput.value = '';
  if (file) importBackup(file);
});

// 캡처 단계로 받아 frappe 처리보다 먼저 표시한다. 떼는 것은 frappe의 svg mouseup(마지막 날짜 변경) 뒤에 document에서 풀린다.
gantt.$container.addEventListener(
  'mousedown',
  () => {
    pointerDownOnChart = true;
    gestureRecorded = false;
  },
  true,
);
document.addEventListener('mouseup', () => {
  pointerDownOnChart = false;
});

// 목록과 차트의 세로 스크롤을 맞춘다. 같은 값이면 scroll 이벤트가 다시 나지 않아 서로 무한히 부르지 않는다
gantt.$container.addEventListener('scroll', () => {
  if (listEl.scrollTop !== gantt.$container.scrollTop) listEl.scrollTop = gantt.$container.scrollTop;
});
listEl.addEventListener('scroll', () => {
  if (gantt.$container.scrollTop !== listEl.scrollTop) gantt.$container.scrollTop = listEl.scrollTop;
});
// 창 크기가 바뀌면 가로 스크롤바가 생기거나 사라질 수 있다
window.addEventListener('resize', () => fitListSpacer());

document.getElementById('undo-btn').addEventListener('click', undo);
document.getElementById('redo-btn').addEventListener('click', redo);

// ⌘Z/⇧⌘Z (윈도우 Ctrl+Z/Ctrl+Y). 입력칸에서는 글자 되돌리기가 되도록, 모달이 열려 있으면 건드리지 않는다
document.addEventListener('keydown', (e) => {
  if (e.target.closest?.('input, textarea, select, [contenteditable]')) return;
  if (document.querySelector('dialog[open]')) return;
  if (!(isMac ? e.metaKey : e.ctrlKey) || e.altKey) return;
  const key = e.key.toLowerCase();
  if (key === 'z' && !e.shiftKey) {
    e.preventDefault();
    undo();
  } else if ((key === 'z' && e.shiftKey) || (key === 'y' && !isMac)) {
    e.preventDefault();
    redo();
  }
});

// 프로젝트 이름: 입력을 마치면(포커스가 빠지면) 저장, Enter로 확정, Esc로 취소
projectNameInput.addEventListener('change', () => setProjectName(projectNameInput.value, { label: 'Rename project' }));
projectNameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') projectNameInput.blur();
  if (e.key === 'Escape') {
    projectNameInput.value = projectName;
    projectNameInput.blur();
  }
});

rowsEl.addEventListener('click', (e) => {
  const row = e.target.closest('.task-row');
  if (!row) return;
  const action = e.target.closest('[data-action]')?.dataset.action;
  if (action === 'edit') openEdit(row.dataset.id);
  else if (action === 'delete') requestDelete(row.dataset.id);
  else selectTask(row.dataset.id, { scrollChart: true });
});

// 태스크를 목록의 to 자리로 옮긴다 (차트 순서도 같이 바뀐다)
function reorderTask(id, to) {
  const from = tasks.findIndex((t) => t.id === id);
  if (from === -1 || to === from || to < 0 || to >= tasks.length) return false;
  commit(moveItem(tasks, from, to), { label: `Reorder “${tasks[from].name}”` });
  return true;
}

rowsEl.addEventListener('keydown', (e) => {
  if (!e.target.classList.contains('task-row')) return;
  const { id } = e.target.dataset;
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    selectTask(id, { scrollChart: true });
  } else if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
    // Alt+↑/↓: 한 칸 옮기고, 다시 그려진 같은 행에 포커스를 돌려준다
    e.preventDefault();
    const index = tasks.findIndex((t) => t.id === id);
    selectedId = id;
    if (reorderTask(id, index + (e.key === 'ArrowUp' ? -1 : 1))) {
      rowsEl.querySelector(`.task-row[data-id="${CSS.escape(id)}"]`)?.focus();
    }
  }
});

// 손잡이를 끌어 순서 바꾸기 (HTML 드래그 앤 드롭)
let draggingId = null;
let dropIndex = null;

const clearDropMarks = () =>
  rowsEl.querySelectorAll('.drop-before, .drop-after').forEach((r) => r.classList.remove('drop-before', 'drop-after'));

rowsEl.addEventListener('dragstart', (e) => {
  const row = e.target.closest('.task-row');
  if (!row || !e.target.closest('.drag-handle')) return;
  draggingId = row.dataset.id;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', draggingId);
  // 손잡이가 아니라 행 전체가 따라오게 한다
  e.dataTransfer.setDragImage(row, 16, row.offsetHeight / 2);
  row.classList.add('is-dragging');
});

rowsEl.addEventListener('dragover', (e) => {
  const row = e.target.closest('.task-row');
  if (!draggingId || !row) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  const rect = row.getBoundingClientRect();
  const before = e.clientY < rect.top + rect.height / 2;
  clearDropMarks();
  row.classList.add(before ? 'drop-before' : 'drop-after');
  const index = tasks.findIndex((t) => t.id === row.dataset.id);
  dropIndex = before ? index : index + 1;
});

rowsEl.addEventListener('drop', (e) => {
  if (!draggingId || dropIndex === null) return;
  e.preventDefault();
  const from = tasks.findIndex((t) => t.id === draggingId);
  // 자기 자리보다 아래에 놓으면, 꺼낸 만큼 한 칸 당겨진다
  const to = dropIndex > from ? dropIndex - 1 : dropIndex;
  const id = draggingId;
  // 목록을 다시 그리면 끌던 행이 사라져 dragend가 목록까지 오지 않으므로 여기서 정리한다
  draggingId = null;
  dropIndex = null;
  clearDropMarks();
  reorderTask(id, to);
});

rowsEl.addEventListener('dragend', () => {
  draggingId = null;
  dropIndex = null;
  clearDropMarks();
  rowsEl.querySelector('.is-dragging')?.classList.remove('is-dragging');
});

// 설치형 웹앱(PWA): 배포 빌드에서만 서비스 워커를 등록한다. 개발 서버에서 등록하면 옛 파일이 캐시에 남아 헷갈린다
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register('./sw.js').catch(() => {
    // 등록에 실패해도(사생활 보호 모드 등) 앱은 온라인으로 그대로 쓸 수 있다
  });
}

initListResizer({
  board: document.querySelector('.board'),
  handle: document.getElementById('list-resizer'),
  getNames: () => tasks.map((t) => t.name),
  // 차트 폭이 바뀌면 가로 스크롤바가 생기거나 사라질 수 있어 목록 아래 여백을 다시 맞춘다
  onResize: () => fitListSpacer(),
});

setProjectName(currentProject().name, { save: false });
// 예전 데이터에서 옮겨 온 경우 새 형식으로 바로 저장해 둔다 (예전 키는 그대로 남는다)
saveProjectsState({ projects, currentId });
renderTaskList(tasks, selectedId);
updateZoomControls();
