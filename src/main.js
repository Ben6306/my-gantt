// 앱 진입점: 태스크 상태를 들고 왼쪽 목록·frappe-gantt 차트·모달을 서로 연결
import Gantt from 'frappe-gantt';
// 동료 PC(윈도우 등)에서도 같은 글꼴로 보이도록 Pretendard를 함께 배포한다. 쓰는 글자 조각만 내려받는다.
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import './style.css';
import { sampleTasks } from './sampleTasks.js';
import { loadLastBackup, loadLegacyProject, loadProjectsState, saveLastBackup, saveProjectsState } from './storage.js';
import { createProject, initState, removeProject } from './projects.js';
import { renderTaskList } from './taskList.js';
import { openTaskModal } from './taskModal.js';
import { confirmDialog } from './confirmDialog.js';
import { allBackupFileName, backupFileName, buildAllBackup, buildBackup, parseAnyBackup, parseTaskList } from './backup.js';
import { autosaveSupported, createAutosave } from './autosave.js';
import { csvToTasks, tasksToCSV } from './csv.js';
import { decodeShare, encodeShare, shareDataFromHash, shareUrl } from './share.js';
import { showToast } from './toast.js';
import { addDays, escapeHTML, fileStem, formatDate, joinDeps, parseDeps, parseISODate, plural, toISODate } from './utils.js';
import { TASK_COLORS, colorFor, isColorKey } from './colors.js';
import { DEFAULT_ZOOM, MODE_DEFAULT_ZOOM, ZOOM_LEVELS, fitZoom, spanDays } from './zoom.js';
import { exportPng } from './exportPng.js';
import { createHistory } from './history.js';
import { initListResizer } from './listResizer.js';
import { HOLIDAYS, holidayName, workingDays } from './holidays.js';
import { isLate, scheduleStatus, statusText } from './status.js';
import { cleanTask, isGroup, isMilestone } from './taskFields.js';
import { baselineSlip, clearBaseline, hasBaseline, setBaseline, slipText } from './baseline.js';
import { actualText, applyActualRules, finishTask, startTask } from './actuals.js';
import { childCounts, dropAnchor, duplicateTask, moveNextTo, moveSibling, normalizeTree, visibleTasks } from './tree.js';

const DEFAULT_PROJECT_NAME = 'Untitled project';

// 태스크 목록을 저장 형식으로 정리한다: 선택 필드(종류·메모 등)는 기본값이면 빼고, 마일스톤은 하루짜리로,
// 그룹 자식은 그룹 바로 아래로 모으고 그룹 기간·진행률은 자식으로 계산
const normalizeTasks = (list) => normalizeTree(list.map(cleanTask));

// 이전 버전 데이터 맞추기: dependencies 배열 → 문자열, 색상이 없으면 순서대로 기본 색
const normalize = (list) =>
  normalizeTasks(
    list.map((t, i) => ({
      ...t,
      dependencies: joinDeps(parseDeps(t.dependencies)),
      color: isColorKey(t.color) ? t.color : colorFor(i),
    })),
  );

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
// 공유 링크로 연 읽기 전용 화면: 남의 일정을 보여 줄 뿐 저장·이력에 남기지 않는다 (내 프로젝트는 그대로)
let readOnly = false;

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
// 그룹 자식을 끌면 그룹 막대(자동 기간·진행률)도 바뀌므로, 끌기를 마친 뒤 차트를 한 번 다시 그린다
let redrawAfterGesture = false;

// 바뀌기 전 상태를 이력에 남긴다. 한 동작에서 이어지는 변경은 하나로 묶는다
// (막대를 끄는 동안의 연속 변경과 의존 태스크 이동, 태스크와 이름을 함께 바꾸는 불러오기)
function record(label) {
  if (readOnly || recordingBatch) return;
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

// 브라우저 저장 공간에 쓰고, 파일 자동 저장이 켜져 있으면 잠시 뒤 파일에도 쓴다
function saveState() {
  if (readOnly) return;
  saveProjectsState({ projects, currentId });
  autosave.schedule();
}

function persist() {
  if (readOnly) return;
  projects = snapshot().projects;
  saveState();
}

// 파일 자동 저장. 내용은 모든 프로젝트(지금 고치는 중인 것 포함)
const autosave = createAutosave({
  // 읽기 전용(공유 링크) 화면에서는 tasks가 남의 일정이라 저장된 내 프로젝트 목록 그대로 쓴다
  getData: () => buildAllBackup(readOnly ? { projects } : snapshot()),
  onChange: (state) => {
    if (state.lastSaved) saveLastBackup(state.lastSaved);
    renderBackupStatus();
  },
});

const rowsEl = document.getElementById('task-rows');
const listEl = document.querySelector('.task-list');
const projectNameInput = document.getElementById('project-name');

const nextId = () => String(Math.max(0, ...tasks.map((t) => Number(t.id)).filter(Number.isFinite)) + 1);

// 검색·필터 (메모리에만 두고 저장하지 않는다)
const filters = { query: '', hideDone: false, lateOnly: false, colors: new Set() };
const isFiltering = () => Boolean(filters.query || filters.hideDone || filters.lateOnly || filters.colors.size);

// 태스크가 검색·필터에 맞는지. 그룹은 자식을 통해 보이고(visibleTasks), 자식 없는 그룹만 스스로 판단한다.
// 검색어는 이름·메모, 그리고 소속 그룹 이름에서도 찾는다 (그룹 이름으로 찾으면 그 안의 태스크가 나오게)
function taskMatcher() {
  const query = filters.query.toLowerCase();
  const today = toISODate(new Date());
  const names = new Map(tasks.map((t) => [t.id, t.name]));
  const counts = childCounts(tasks);
  return (t) => {
    if (isGroup(t) && counts.has(t.id)) return false;
    const text = `${t.name}\n${t.notes ?? ''}\n${t.parent ? names.get(t.parent) : ''}`.toLowerCase();
    if (query && !text.includes(query)) return false;
    if (filters.hideDone && t.progress >= 100) return false;
    if (filters.lateOnly && !isLate(scheduleStatus(t, today))) return false;
    if (filters.colors.size && !filters.colors.has(t.color)) return false;
    return true;
  };
}

// 목록·차트에 보이는 행 (접힌 그룹의 자식, 검색·필터에 안 맞는 행은 숨김)
const shownTasks = () => visibleTasks(tasks, isFiltering() ? taskMatcher() : null);

// 막대 색은 custom_class(.c-<색>)로 style.css에서 입힌다.
// color는 넘기지 않는다: frappe-gantt가 task.color를 막대 fill에 그대로 넣어서 'blue'·'red'가 원색으로 칠해진다.
// 숨긴 태스크로 가는 의존성은 뺀다: frappe는 막대를 끌 때 선행 막대를 찾는데(get_bar) 없으면 오류가 난다.
function chartTasks() {
  const shown = shownTasks();
  const ids = new Set(shown.map((t) => t.id));
  return shown.map(({ color, ...t }) => ({
    ...t,
    dependencies: parseDeps(t.dependencies).filter((d) => ids.has(d)),
    custom_class: `c-${color}`,
  }));
}

// 필터 중에는 일부만 보여서 끌어 놓을 자리가 모호하므로 순서 바꾸기를 끈다
function renderList() {
  renderTaskList({ rows: shownTasks(), all: tasks, selectedId, canReorder: !isFiltering(), filtered: isFiltering() });
}

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
  const index = shownTasks().findIndex((t) => t.id === selectedId);
  if (index !== -1) chart.$svg.querySelectorAll('.grid-row')[index]?.classList.add('is-selected');
  chart.$svg.querySelector(`.bar-wrapper[data-id="${CSS.escape(selectedId)}"]`)?.classList.add('is-selected');
}

// 렌더 뒤 차트를 꾸민다: 선택 강조, 늦은 막대 표시, 공휴일 이름 툴팁. 다시 불러도 같은 결과가 되게 한다
function decorateChart(chart = gantt) {
  highlightChart(chart);
  // 월 보기에서는 하루 폭이 3~4px라 주말·공휴일 음영이 바코드처럼 보여서 CSS로 숨긴다
  chart.$container.dataset.mode = chart.options.view_mode;
  const today = toISODate(new Date());
  const counts = childCounts(tasks);
  for (const t of tasks) {
    const wrapper = chart.$svg.querySelector(`.bar-wrapper[data-id="${CSS.escape(t.id)}"]`);
    if (!wrapper) continue;
    const { status } = scheduleStatus(t, today);
    wrapper.classList.toggle('is-overdue', status === 'overdue');
    wrapper.classList.toggle('is-behind', status === 'behind' || status === 'lateStart');
    wrapper.classList.toggle('is-done', t.progress >= 100);
    wrapper.classList.toggle('is-milestone', isMilestone(t));
    // 자식이 있는 그룹은 기간이 자동이라 끌 수 없게 표시 (끌기는 아래 mousedown에서 막는다)
    wrapper.classList.toggle('is-group', isGroup(t));
    wrapper.classList.toggle('is-locked', isGroup(t) && counts.has(t.id));
    if (isMilestone(t)) {
      // 하루 폭 막대를 CSS로 정사각형으로 늘인 뒤 45° 돌려 마름모로 그린다. 막대 자체를 바꾸므로 끄는 동안에도 따라간다
      const rect = wrapper.querySelector('.bar');
      wrapper.style.setProperty('--ms-sx', String(chart.options.bar_height / Math.max(1, rect.getWidth())));
      // 이름은 마름모 오른쪽에(완료일 마름모가 더 오른쪽이면 그 뒤에). frappe가 다음 프레임에 이름 위치를 다시 잡으므로(draw_label) 그 뒤에 옮긴다
      requestAnimationFrame(() => {
        const label = wrapper.querySelector('.bar-label');
        if (!label) return;
        const actual = wrapper.querySelector('.actual-bar');
        const center = Math.max(rect.getX(), actual ? Number(actual.getAttribute('x')) : -Infinity) + rect.getWidth() / 2;
        label.classList.add('big');
        label.setAttribute('x', center + chart.options.bar_height / 2);
      });
    }
  }
  drawBaselines(chart);
  drawActuals(chart, today);
  chart.$svg.querySelectorAll('.holiday-highlight:not(:has(title))').forEach((rect) => {
    const iso = [...rect.classList].find((c) => /^\d{4}-\d{2}-\d{2}$/.test(c));
    const name = iso && holidayName(iso);
    if (!name) return;
    const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
    title.textContent = name;
    rect.append(title);
  });
}

/*
 * 기준선: 막대 바로 아래 얇은 회색 막대. 막대 위치를 기준으로 (기준선 날짜 − 지금 날짜)만큼 옮겨 그린다 —
 * 날짜가 같으면 막대와 정확히 겹친다(월 보기에서 frappe와 계산법이 조금 달라도 어긋나지 않게).
 * 막대보다 아래 층(.bar 층 앞)에 두고 다시 부를 때마다 새로 그린다.
 */
function drawBaselines(chart) {
  chart.$svg.querySelector('.baseline-layer')?.remove();
  if (!hasBaseline(tasks)) return;
  const layer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  layer.setAttribute('class', 'baseline-layer');
  const x = (iso) => posAtTime(parseISODate(iso).getTime(), chart);
  for (const t of tasks) {
    if (!t.baselineStart) continue;
    const bar = chart.$svg.querySelector(`.bar-wrapper[data-id="${CSS.escape(t.id)}"] .bar`);
    if (!bar) continue;
    const nextDay = (iso) => toISODate(addDays(parseISODate(iso), 1));
    const left = bar.getX() + x(t.baselineStart) - x(t.start);
    const right = bar.getX() + bar.getWidth() + x(nextDay(t.baselineEnd)) - x(nextDay(t.end));
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('class', 'baseline-bar');
    rect.setAttribute('x', String(left));
    rect.setAttribute('y', String(bar.getY() + chart.options.bar_height + 2));
    rect.setAttribute('width', String(Math.max(2, right - left)));
    rect.setAttribute('height', '4');
    rect.setAttribute('rx', '2');
    layer.append(rect);
  }
  chart.layers.bar.before(layer);
}

/*
 * 실제 기록: 시작한 태스크는 계획 막대를 빈 점선 테두리로 바꾸고(CSS .has-actual), 실제 기간을 색이 찬 막대로 겹친다.
 * 진행 중이면 실제 시작~오늘. 막대 묶음(.bar-group) 안, 계획 막대 바로 위·이름 아래에 넣는다.
 * 위치는 기준선처럼 계획 막대 위치 + (실제 날짜 − 계획 날짜)의 거리.
 */
function drawActuals(chart, today) {
  const x = (iso) => posAtTime(parseISODate(iso).getTime(), chart);
  const nextDay = (iso) => toISODate(addDays(parseISODate(iso), 1));
  for (const t of tasks) {
    const wrapper = chart.$svg.querySelector(`.bar-wrapper[data-id="${CSS.escape(t.id)}"]`);
    if (!wrapper) continue;
    wrapper.querySelector('.actual-bar')?.remove();
    wrapper.classList.toggle('has-actual', Boolean(t.actualStart));
    if (!t.actualStart) continue;
    const bar = wrapper.querySelector('.bar');
    // 진행 중이면 오늘까지(시작이 오늘 뒤로 적혀 있으면 그날 하루)
    const lastDay = t.actualEnd ?? (today < t.actualStart ? t.actualStart : today);
    const left = bar.getX() + x(t.actualStart) - x(t.start);
    const right = bar.getX() + bar.getWidth() + x(nextDay(lastDay)) - x(nextDay(t.end));
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('class', `actual-bar${t.actualEnd ? '' : ' is-ongoing'}`);
    rect.setAttribute('x', String(left));
    rect.setAttribute('y', bar.getAttribute('y'));
    rect.setAttribute('width', String(Math.max(2, right - left)));
    rect.setAttribute('height', bar.getAttribute('height'));
    rect.setAttribute('rx', bar.getAttribute('rx'));
    bar.after(rect);
    // 막대 밖에 둔 이름(.big)이 계획보다 길어진 실제 막대에 겹치지 않게 더 늦은 끝 뒤로 옮긴다 (frappe가 다음 프레임에 이름을 다시 잡은 뒤)
    if (!isMilestone(t) && right > bar.getX() + bar.getWidth()) {
      requestAnimationFrame(() => {
        const label = wrapper.querySelector('.bar-label.big');
        if (label) label.setAttribute('x', String(right + 5));
      });
    }
  }
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

// 차트 왼쪽 끝(gantt_start)에서 그 시각까지의 거리(px). 칸 사이는 시각 비율로 나눈다
function posAtTime(time, chart = gantt) {
  const { dates } = chart;
  const cw = chart.config.column_width;
  let i = dates.findIndex((d, k) => k === dates.length - 1 || dates[k + 1].getTime() > time);
  i = Math.min(Math.max(i, 0), dates.length - 2);
  return i * cw + ((time - dates[i]) / (dates[i + 1] - dates[i])) * cw;
}

// 그 시각이 차트 화면 왼쪽에서 px 떨어진 곳에 오도록 스크롤
function scrollTimeTo(time, px) {
  gantt.$container.scrollLeft = Math.max(0, posAtTime(time) - px);
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
  const shown = shownTasks();
  if (!shown.length) return;
  const index = fitZoom(spanDays(shown), gantt.$container.clientWidth);
  const first = shown.reduce((m, t) => (t.start < m ? t.start : m), shown[0].start);
  applyZoom(index, { anchorTime: parseISODate(first).getTime() });
  gantt.$container.scrollLeft -= gantt.config.column_width;
}

// 태스크를 바꾸는 유일한 경로: (label이 있으면) 이력 기록 → 저장 → 목록 갱신 → (필요하면) 차트 다시 그리기
function commit(next, { redraw = true, label } = {}) {
  if (label) record(label);
  // 진행률을 처음 올리면 실제 시작, 100%가 되면 실제 종료를 오늘로 기록한다 (actuals.js)
  tasks = normalizeTasks(applyActualRules(tasks, next, toISODate(new Date())));
  persist();
  renderList();
  if (redraw) redrawChart({ keepScroll: true });
  decorateChart();
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
  renderList();
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
  saveState();
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

// 행의 Start/Finish: 오늘을 실제 시작·종료로 기록 (날짜는 모달에서 고칠 수 있다)
function recordActual(id, action) {
  const task = tasks.find((t) => t.id === id);
  if (!task) return;
  const today = toISODate(new Date());
  const next = action === 'start' ? startTask(task, today) : finishTask(task, today);
  selectedId = id;
  updateTask(id, next, { label: `${action === 'start' ? 'Start' : 'Finish'} “${task.name}”` });
  rowsEl.querySelector(`.task-row[data-id="${CSS.escape(id)}"]`)?.focus();
  showToast(
    action === 'start'
      ? `Started “${task.name}” today. Change the date in the task if it started another day.`
      : `Marked “${task.name}” done today (100%). Change the date in the task if it finished another day.`,
  );
}

// 바로 아래에 "(copy)"로 복제하고 복제본을 선택한다 (그룹이면 자식까지)
function duplicate(id) {
  const task = tasks.find((t) => t.id === id);
  const result = task && duplicateTask(tasks, id, Number(nextId()));
  if (!result) return;
  selectedId = result.id;
  commit(result.tasks, { label: `Duplicate “${task.name}”` });
  scrollChartTo(result.id);
  rowsEl.querySelector(`.task-row[data-id="${CSS.escape(result.id)}"]`)?.focus();
}

async function requestDelete(id) {
  const task = tasks.find((t) => t.id === id);
  if (!task) return false;
  // 그룹을 지우면 자식은 지우지 않고 그룹 밖으로 꺼낸다 (normalizeTree가 parent를 정리)
  const kids = childCounts(tasks).get(id) ?? 0;
  const ok = await confirmDialog({
    title: isGroup(task) ? 'Delete group' : 'Delete task',
    message: `Delete “${task.name}”?${kids ? ` Its ${plural(kids, 'task')} will stay, outside the group.` : ''} You can undo this with ${UNDO_KEY}.`,
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

// 화면에 보이는 행(접힌 그룹의 자식 제외) 그대로 그린다
async function exportImage(button) {
  const shown = shownTasks();
  if (!shown.length) {
    showToast('Add a task before exporting an image.');
    return;
  }
  button.disabled = true;
  try {
    const { mode, columnWidth } = ZOOM_LEVELS[zoomIndex];
    const fileName = await exportPng({ tasks: shown, projectName, mode, columnWidth });
    showToast(`Exported ${plural(shown.length, 'row')} to ${fileName}.`);
  } catch (err) {
    showToast(`Couldn’t export the image. ${err.message}`, { type: 'error' });
  } finally {
    button.disabled = false;
  }
}

function download(content, fileName, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url));
}

function markBackedUp() {
  saveLastBackup(new Date());
  renderBackupStatus();
}

function exportBackup() {
  const fileName = backupFileName(projectName);
  download(JSON.stringify(buildBackup({ tasks, projectName }), null, 2), fileName, 'application/json');
  markBackedUp();
  showToast(`Exported ${plural(tasks.length, 'task')} to ${fileName}.`);
}

function exportAllBackup() {
  const fileName = allBackupFileName();
  download(JSON.stringify(buildAllBackup(snapshot()), null, 2), fileName, 'application/json');
  markBackedUp();
  showToast(`Exported ${plural(projects.length, 'project')} to ${fileName}.`);
}

// 불러온 프로젝트들을 새 프로젝트로 추가하고 첫 번째로 전환한다 (지금 프로젝트를 덮어쓰지 않아 묻지 않는다)
function addImportedProjects(imported, droppedDeps) {
  const added = imported.map((p) => createProject(p.name, normalizeTasks(p.tasks)));
  record(added.length === 1 ? `Import “${added[0].name}”` : `Import ${plural(added.length, 'project')}`);
  setProjects([...projects, ...added], added[0].id);
  const dropped = droppedDeps ? ` Removed ${plural(droppedDeps, 'link')} to missing tasks.` : '';
  const what =
    added.length === 1
      ? `“${added[0].name}” as a new project with ${plural(added[0].tasks.length, 'task')}`
      : `${plural(added.length, 'project')} as new projects`;
  showToast(`Imported ${what}.${dropped}`);
}

async function importBackup(file) {
  let result;
  try {
    result = parseAnyBackup(await file.text());
  } catch (err) {
    showToast(`Couldn’t import the file. ${err.message}`, { type: 'error' });
    return;
  }
  const fallbackName = file.name.replace(/\.json$/i, '');
  addImportedProjects(
    result.projects.map((p) => ({ ...p, name: p.name ?? fallbackName })),
    result.droppedDeps,
  );
}

// 선택한 행이 그룹(또는 그룹의 자식)이면 새 태스크를 그 그룹에 넣는다
function groupOfSelection() {
  const selected = tasks.find((t) => t.id === selectedId);
  if (!selected) return '';
  return isGroup(selected) ? selected.id : (selected.parent ?? '');
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
      parent: groupOfSelection(),
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
  if (!task || readOnly) return;
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

const HOLIDAY_SET = new Set(HOLIDAYS.map((h) => h.date));

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
  // 주말은 옅은 회색, 한국 공휴일은 옅은 빨강. 날짜 문자열 대신 함수로 넘긴다(frappe는 문자열을 new Date('YYYY-MM-DD ')로 읽어 Safari에서 깨진다)
  holidays: {
    'var(--g-weekend-highlight-color)': 'weekend',
    'var(--g-holiday-color)': [(d) => HOLIDAY_SET.has(toISODate(d))],
  },
  scroll_to: 'start',
  today_button: false,
  view_mode_select: false,
  popup: (ctx) => {
    const { task } = ctx;
    ctx.set_title(escapeHTML(task.name));
    ctx.set_subtitle('');
    const startISO = toISODate(task._start);
    const endISO = toISODate(new Date(task._end.getTime() - 1000));
    const work = workingDays(startISO, endISO);
    const progress = Math.round(task.progress);
    const status = scheduleStatus({ start: startISO, end: endISO, progress }, toISODate(new Date()));
    const late = isLate(status) ? `<br/><span class="popup-late is-${status.status}">${statusText(status, progress)}</span>` : '';
    const original = tasks.find((t) => t.id === task.id);
    const kids = childCounts(tasks).get(task.id) ?? 0;
    let when = `Plan ${formatDate(startISO)} – ${formatDate(endISO)} (${plural(task.actual_duration, 'day')}, ${work} working)<br/>Progress ${progress}%`;
    if (original && isMilestone(original)) when = `Milestone · plan ${formatDate(startISO)}<br/>${progress >= 100 ? 'Done' : 'Not done'}`;
    else if (original && isGroup(original)) when = `Group of ${plural(kids, 'task')}<br/>${when}`;
    // 실제 기록: "Actual Nov 28 – Dec 1 · started 1 day late · finished 1 day late"
    if (original?.actualStart) {
      const range = isMilestone(original)
        ? formatDate(original.actualEnd)
        : `${formatDate(original.actualStart)} – ${original.actualEnd ? formatDate(original.actualEnd) : 'now'}`;
      when += `<br/><span class="popup-actual">Actual ${range} · ${actualText(original)}</span>`;
    }
    const slip = original && baselineSlip(original);
    const baseline = slip
      ? `<br/><span class="popup-baseline">Baseline ${formatDate(original.baselineStart)} – ${formatDate(original.baselineEnd)} · ${slipText(slip)}</span>`
      : '';
    // 메모는 길면 잘라서, 줄바꿈은 살려서
    const notes = original?.notes
      ? `<div class="popup-notes">${escapeHTML(original.notes.length > 280 ? `${original.notes.slice(0, 280)}…` : original.notes)}</div>`
      : '';
    ctx.set_details(`${when}${late}${baseline}${notes}`);
  },
  on_view_change() {
    fitListSpacer(this);
    decorateChart(this);
  },
  on_click: (task) => selectTask(task.id),
  on_double_click: (task) => openEdit(task.id),
  on_date_change: (task, start, end) => {
    updateTask(task.id, { start: toISODate(start), end: toISODate(end) }, { redraw: false, label: `Move “${task.name}”` });
    if (task.parent) redrawAfterGesture = true;
  },
  on_progress_change: (task, progress) => {
    updateTask(task.id, { progress: Math.round(progress) }, { redraw: false, label: `Change progress of “${task.name}”` });
    if (task.parent) redrawAfterGesture = true;
  },
});

// frappe는 휠로 앞뒤 여백을 늘릴 때 render()만 부르고 view_change를 보내지 않는다. 그때도 꾸미기가 사라지지 않게 감싼다
const renderChart = gantt.render.bind(gantt);
gantt.render = () => {
  renderChart();
  decorateChart();
};

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

// More 메뉴: 헤더 오른쪽 버튼이라 메뉴 오른쪽 끝을 버튼에 맞춘다
const moreMenu = document.getElementById('more-menu');
const moreBtn = document.getElementById('more-btn');
moreMenu.addEventListener('toggle', (e) => {
  const open = e.newState === 'open';
  moreBtn.setAttribute('aria-expanded', String(open));
  if (open) {
    document.getElementById('baseline-clear-btn').disabled = !hasBaseline(tasks);
    // 자동 저장은 Chrome·Edge만 된다. 켜져 있으면 "다른 파일로", 꺼져 있으면 멈추기 단추를 숨긴다
    const { status } = autosave.state;
    const autosaveBtn = document.getElementById('autosave-btn');
    autosaveBtn.hidden = !autosaveSupported;
    autosaveBtn.textContent = status === 'off' ? 'Auto-save to a file…' : 'Auto-save to a different file…';
    document.getElementById('autosave-stop-btn').hidden = !autosaveSupported || status === 'off';
    const r = moreBtn.getBoundingClientRect();
    moreMenu.style.top = `${r.bottom + 6}px`;
    moreMenu.style.left = `${Math.max(8, r.right - moreMenu.offsetWidth)}px`;
  }
});
moreMenu.addEventListener('click', (e) => {
  if (e.target.closest('button')) moreMenu.hidePopover();
});

async function saveBaseline() {
  if (!tasks.length) {
    showToast('Add a task before saving a baseline.');
    return;
  }
  if (hasBaseline(tasks)) {
    const ok = await confirmDialog({
      title: 'Replace baseline',
      message: `Replace the saved baseline with today’s dates? You can undo this with ${UNDO_KEY}.`,
      confirmText: 'Replace',
    });
    if (!ok) return;
  }
  commit(setBaseline(tasks), { label: 'Save baseline' });
  showToast('Saved the current dates as the baseline. Changes from now on show as gray bars under each task.');
}

document.getElementById('baseline-set-btn').addEventListener('click', saveBaseline);

// 공유 링크: 지금 프로젝트를 압축해 주소 # 뒤에 넣는다. 링크를 연 사람은 읽기 전용으로 보고, 원하면 자기 프로젝트로 저장한다
const LONG_LINK = 8000;
document.getElementById('share-link-btn').addEventListener('click', async () => {
  if (!tasks.length) {
    showToast('Add a task before sharing.');
    return;
  }
  try {
    const url = shareUrl(location.href, await encodeShare({ name: projectName, tasks }));
    await navigator.clipboard.writeText(url);
    const long = url.length > LONG_LINK ? ` It’s long (${url.length.toLocaleString()} characters), so some chat apps may cut it — send a JSON file if it doesn’t open.` : '';
    showToast(`Copied a view-only link. Anyone with it can see these tasks and notes; later changes won’t update it.${long}`);
  } catch (err) {
    showToast(`Couldn’t copy the link. ${err.message}`, { type: 'error' });
  }
});

const shareBanner = document.getElementById('share-banner');

// 공유 링크로 열었을 때: 링크의 일정만 보여 주고 고치기·저장을 막는다
async function openSharedView(data) {
  let shared;
  try {
    const { name, tasks: raw } = await decodeShare(data);
    shared = { name, tasks: normalizeTasks(parseTaskList(raw).tasks) };
  } catch (err) {
    clearShareHash();
    showToast(`Couldn’t open the shared link. ${err.message}`, { type: 'error' });
    return;
  }
  readOnly = true;
  document.body.classList.add('is-readonly');
  projectNameInput.readOnly = true;
  gantt.options.readonly = true;
  shareBanner.hidden = false;
  document.getElementById('share-banner-text').textContent =
    `You’re viewing a shared copy of “${shared.name}”. It’s read-only and not saved in this browser.`;
  tasks = shared.tasks;
  selectedId = null;
  setProjectName(shared.name, { save: false });
  renderList();
  redrawChart({ keepScroll: false });
  decorateChart();
}

// window.history를 쓴다 (이 파일의 history는 실행 취소 이력)
const clearShareHash = () => window.history.replaceState(null, '', location.pathname + location.search);

// 내 프로젝트로 저장: 보던 일정을 새 프로젝트로 추가하고 평소 화면으로
document.getElementById('share-save-btn').addEventListener('click', () => {
  const copy = createProject(projectName, tasks);
  readOnly = false;
  // 이력에는 내 프로젝트 상태를 남겨야 하므로(⌘Z로 저장을 되돌릴 수 있게) 작업 사본을 먼저 내 프로젝트로 돌린다
  tasks = currentProject().tasks;
  projectName = currentProject().name;
  record(`Save shared “${copy.name}”`);
  document.body.classList.remove('is-readonly');
  projectNameInput.readOnly = false;
  gantt.options.readonly = false;
  shareBanner.hidden = true;
  clearShareHash();
  setProjects([...projects, copy], copy.id);
  showToast(`Saved “${copy.name}” to your projects.`);
});
// 닫기: 내 프로젝트 화면으로 다시 연다 (보던 공유 일정은 남지 않는다)
document.getElementById('share-close-btn').addEventListener('click', () => {
  clearShareHash();
  location.reload();
});
// 이미 열린 앱 주소창에 공유 링크를 붙여 넣으면 #만 바뀌어 새로 열리지 않으므로 직접 다시 연다
window.addEventListener('hashchange', () => {
  if (shareDataFromHash(location.hash)) location.reload();
});

// 백업: 모든 프로젝트 내보내기, 파일 자동 저장
document.getElementById('export-all-btn').addEventListener('click', exportAllBackup);

// CSV: 지금 프로젝트의 모든 태스크. 엑셀이 UTF-8로 읽도록(한글 깨짐 방지) 앞에 BOM을 붙인다
document.getElementById('csv-export-btn').addEventListener('click', () => {
  const fileName = `${fileStem(projectName)}-${toISODate(new Date())}.csv`;
  download(`\uFEFF${tasksToCSV(tasks)}`, fileName, 'text/csv;charset=utf-8');
  showToast(`Exported ${plural(tasks.length, 'task')} to ${fileName}.`);
});
const csvInput = document.getElementById('csv-file');
document.getElementById('csv-import-btn').addEventListener('click', () => csvInput.click());
csvInput.addEventListener('change', async () => {
  const [file] = csvInput.files;
  csvInput.value = '';
  if (!file) return;
  try {
    const { tasks: imported, droppedDeps } = parseTaskList(csvToTasks(await file.text()));
    addImportedProjects([{ name: file.name.replace(/\.csv$/i, ''), tasks: imported }], droppedDeps);
  } catch (err) {
    showToast(`Couldn’t import the CSV. ${err.message}`, { type: 'error' });
  }
});
document.getElementById('autosave-btn').addEventListener('click', async () => {
  try {
    if (await autosave.choose('my-gantt-autosave.json')) {
      showToast(`Auto-saving all projects to “${autosave.state.fileName}”. Keep the file somewhere safe, like iCloud Drive.`);
    }
  } catch (err) {
    showToast(`Couldn’t turn on auto-save. ${err.message}`, { type: 'error' });
  }
});
document.getElementById('autosave-stop-btn').addEventListener('click', async () => {
  await autosave.stop();
  showToast('Stopped auto-saving. The file stays where it is.');
});
document.getElementById('baseline-clear-btn').addEventListener('click', () => {
  commit(clearBaseline(tasks), { label: 'Clear baseline' });
  showToast(`Cleared the baseline. You can undo this with ${UNDO_KEY}.`);
});

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
  (e) => {
    pointerDownOnChart = true;
    gestureRecorded = false;
    // 자식이 있는 그룹 막대는 기간·진행률이 자동이라 끌지 못하게 frappe까지 가지 않게 한다 (클릭·더블클릭은 그대로)
    if (e.target.closest?.('.bar-wrapper.is-locked')) e.stopPropagation();
  },
  true,
);
document.addEventListener('mouseup', () => {
  pointerDownOnChart = false;
  if (redrawAfterGesture) {
    redrawAfterGesture = false;
    setTimeout(() => {
      redrawChart({ keepScroll: true });
      decorateChart();
    });
  }
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
  if (readOnly) return;
  if (document.querySelector('dialog[open]')) return;
  if (!(isMac ? e.metaKey : e.ctrlKey) || e.altKey) return;
  const key = e.key.toLowerCase();
  if (key === 'd' && !e.shiftKey) {
    // ⌘D/Ctrl+D: 선택한 태스크 복제 (브라우저 북마크 대신)
    if (!selectedId) return;
    e.preventDefault();
    duplicate(selectedId);
  } else if (key === 'z' && !e.shiftKey) {
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
  if (action === 'toggle') toggleGroup(row.dataset.id);
  else if (action === 'start' || action === 'finish') recordActual(row.dataset.id, action);
  else if (action === 'edit') openEdit(row.dataset.id);
  else if (action === 'duplicate') duplicate(row.dataset.id);
  else if (action === 'delete') requestDelete(row.dataset.id);
  else selectTask(row.dataset.id, { scrollChart: true });
});

// 그룹 접기/펴기. 보기 상태라 실행 취소 이력에는 남기지 않고 저장만 한다
function toggleGroup(id, open) {
  const group = tasks.find((t) => t.id === id);
  if (!group || !isGroup(group)) return;
  const collapsed = open === undefined ? !group.collapsed : !open;
  if (Boolean(group.collapsed) === collapsed) return;
  // 숨겨지는 자식이 선택돼 있었으면 그룹을 선택한다
  if (collapsed && tasks.some((t) => t.id === selectedId && t.parent === id)) selectedId = id;
  commit(tasks.map((t) => (t.id === id ? { ...t, collapsed } : t)));
  rowsEl.querySelector(`.task-row[data-id="${CSS.escape(id)}"]`)?.focus();
}

// 순서를 바꾼 목록을 반영한다 (차트 순서도 같이 바뀐다)
function applyReorder(id, next) {
  // 제자리에 놓은 경우는 이력에 남기지 않는다
  if (!next || next.every((t, i) => t.id === tasks[i].id)) return false;
  commit(next, { label: `Reorder “${tasks.find((t) => t.id === id).name}”` });
  return true;
}

rowsEl.addEventListener('keydown', (e) => {
  if (!e.target.classList.contains('task-row')) return;
  const { id } = e.target.dataset;
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    selectTask(id, { scrollChart: true });
  } else if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
    // Alt+↑/↓: 같은 단계의 이웃과 자리를 바꾸고(그룹은 자식과 함께), 다시 그려진 같은 행에 포커스를 돌려준다
    e.preventDefault();
    if (readOnly) return;
    if (isFiltering()) {
      showToast('Clear the search and filters to reorder tasks.');
      return;
    }
    selectedId = id;
    if (applyReorder(id, moveSibling(tasks, id, e.key === 'ArrowUp' ? -1 : 1))) {
      rowsEl.querySelector(`.task-row[data-id="${CSS.escape(id)}"]`)?.focus();
    }
  } else if (!e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
    // ←/→: 그룹 접기/펴기
    const task = tasks.find((t) => t.id === id);
    if (task && isGroup(task)) {
      e.preventDefault();
      toggleGroup(id, e.key === 'ArrowRight');
    }
  }
});

// 손잡이를 끌어 순서 바꾸기 (HTML 드래그 앤 드롭). 그룹은 자식과 함께, 자식은 같은 그룹 안에서만 옮긴다
let draggingId = null;
// 놓을 자리: 기준 태스크(그룹 밖이면 묶음의 머리) 앞/뒤
let dropTarget = null;

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
  clearDropMarks();
  dropTarget = null;
  const anchor = dropAnchor(tasks, draggingId, row.dataset.id);
  // 놓을 수 없는 자리(다른 그룹 안 등)면 preventDefault를 하지 않아 브라우저가 '놓을 수 없음'으로 보여 준다
  if (!anchor) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  // 그룹 밖 태스크를 옮길 때는 펼친 그룹 묶음(그룹 + 보이는 자식) 전체의 위/아래 절반으로 앞뒤를 정한다
  const head = rowsEl.querySelector(`.task-row[data-id="${CSS.escape(anchor)}"]`);
  const draggedIsChild = Boolean(tasks.find((t) => t.id === draggingId)?.parent);
  const kids = draggedIsChild ? [] : [...rowsEl.querySelectorAll(`.task-row[data-parent="${CSS.escape(anchor)}"]`)];
  const last = kids.at(-1) ?? head;
  const top = head.getBoundingClientRect().top;
  const bottom = last.getBoundingClientRect().bottom;
  const after = e.clientY >= (top + bottom) / 2;
  (after ? last : head).classList.add(after ? 'drop-after' : 'drop-before');
  dropTarget = { anchor, after };
});

rowsEl.addEventListener('drop', (e) => {
  if (!draggingId || !dropTarget) return;
  e.preventDefault();
  const id = draggingId;
  const { anchor, after } = dropTarget;
  // 목록을 다시 그리면 끌던 행이 사라져 dragend가 목록까지 오지 않으므로 여기서 정리한다
  draggingId = null;
  dropTarget = null;
  clearDropMarks();
  applyReorder(id, moveNextTo(tasks, id, anchor, after));
});

rowsEl.addEventListener('dragend', () => {
  draggingId = null;
  dropTarget = null;
  clearDropMarks();
  rowsEl.querySelector('.is-dragging')?.classList.remove('is-dragging');
});

// 설치형 웹앱(PWA): 배포 빌드에서만 서비스 워커를 등록한다. 개발 서버에서 등록하면 옛 파일이 캐시에 남아 헷갈린다
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register('./sw.js').catch(() => {
    // 등록에 실패해도(사생활 보호 모드 등) 앱은 온라인으로 그대로 쓸 수 있다
  });
}

// 헤더 백업 상태: 자동 저장 중이면 마지막 저장 시각, 아니면 마지막으로 JSON을 내보낸 지 얼마나 됐는지
const backupStatusBtn = document.getElementById('backup-status');
const relativeTime = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
const timeFormat = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' });
const STALE_DAYS = 7;

function ago(date) {
  const minutes = Math.round((Date.now() - date) / 60000);
  if (minutes < 60) return minutes < 1 ? 'just now' : relativeTime.format(-minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (hours < 24) return relativeTime.format(-hours, 'hour');
  return relativeTime.format(-Math.round(hours / 24), 'day');
}

function renderBackupStatus() {
  const { status, fileName, lastSaved, error } = autosave.state;
  const last = loadLastBackup();
  let text;
  let tone = '';
  let title;
  if (status === 'on') {
    tone = 'good';
    text = lastSaved ? `Auto-saved ${timeFormat.format(lastSaved)}` : 'Auto-save on';
    title = `Every change is saved to “${fileName}”.`;
  } else if (status === 'paused') {
    tone = 'warn';
    text = 'Auto-save paused';
    title = `Click to allow saving to “${fileName}” again.`;
  } else if (status === 'error') {
    tone = 'bad';
    text = 'Auto-save failed';
    title = `${error ?? ''} Click to try again, or choose a new file under More.`.trim();
  } else {
    const hasTasks = projects.some((p) => (p.id === currentId ? tasks : p.tasks).length);
    const stale = !last || Date.now() - last > STALE_DAYS * 86400000;
    tone = stale && hasTasks ? 'warn' : '';
    text = last ? `Backed up ${ago(last)}` : 'Not backed up';
    title = `Your tasks live only in this browser. Export a JSON backup or turn on auto-save under More.${last ? ` Last backup: ${last.toLocaleString()}.` : ''}`;
  }
  backupStatusBtn.dataset.tone = tone;
  backupStatusBtn.title = title;
  document.getElementById('backup-status-text').textContent = text;
}

backupStatusBtn.addEventListener('click', async () => {
  const { status } = autosave.state;
  if (status === 'paused' || status === 'error') {
    if (!(await autosave.resume())) showToast('Auto-save is still off. Choose a file again under More → Backup.', { type: 'error' });
    return;
  }
  moreMenu.showPopover();
});
// "3 minutes ago" 같은 표시를 새로 고친다
setInterval(renderBackupStatus, 60000);

// 검색·필터 UI
const searchInput = document.getElementById('search-input');
const filterBtn = document.getElementById('filter-btn');
const filterMenu = document.getElementById('filter-menu');
const filterColors = document.getElementById('filter-colors');

filterColors.replaceChildren(
  ...TASK_COLORS.map(({ key, name }) => {
    const label = document.createElement('label');
    label.className = `swatch c-${key}`;
    label.title = name;
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = key;
    input.setAttribute('aria-label', name);
    const dot = document.createElement('span');
    dot.className = 'swatch-dot';
    label.append(input, dot);
    return label;
  }),
);

function applyFilters() {
  const count = (filters.hideDone ? 1 : 0) + (filters.lateOnly ? 1 : 0) + (filters.colors.size ? 1 : 0);
  document.getElementById('filter-label').textContent = count ? `Filter · ${count}` : 'Filter';
  filterBtn.classList.toggle('is-active', count > 0);
  filterColors.classList.toggle('has-selection', filters.colors.size > 0);
  renderList();
  redrawChart({ keepScroll: true });
  decorateChart();
}

searchInput.addEventListener('input', () => {
  filters.query = searchInput.value.trim();
  applyFilters();
});
searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && searchInput.value) {
    e.stopPropagation();
    searchInput.value = '';
    filters.query = '';
    applyFilters();
  }
});
document.getElementById('filter-done').addEventListener('change', (e) => {
  filters.hideDone = e.target.checked;
  applyFilters();
});
document.getElementById('filter-late').addEventListener('change', (e) => {
  filters.lateOnly = e.target.checked;
  applyFilters();
});
filterColors.addEventListener('change', (e) => {
  if (e.target.checked) filters.colors.add(e.target.value);
  else filters.colors.delete(e.target.value);
  applyFilters();
});
document.getElementById('filter-clear').addEventListener('click', () => {
  filters.query = '';
  filters.hideDone = false;
  filters.lateOnly = false;
  filters.colors.clear();
  searchInput.value = '';
  filterMenu.querySelectorAll('input[type="checkbox"]').forEach((input) => {
    input.checked = false;
  });
  filterMenu.hidePopover();
  applyFilters();
});
filterMenu.addEventListener('toggle', (e) => {
  const open = e.newState === 'open';
  filterBtn.setAttribute('aria-expanded', String(open));
  if (open) {
    const r = filterBtn.getBoundingClientRect();
    filterMenu.style.top = `${r.bottom + 6}px`;
    filterMenu.style.left = `${Math.max(8, r.right - filterMenu.offsetWidth)}px`;
  }
});

const listResizer = initListResizer({
  board: document.querySelector('.board'),
  handle: document.getElementById('list-resizer'),
  getNames: () => tasks.map((t) => t.name),
  // 차트 폭이 바뀌면 가로 스크롤바가 생기거나 사라질 수 있어 목록 아래 여백을 다시 맞춘다
  onResize: () => fitListSpacer(),
});
document.getElementById('fit-names-btn').addEventListener('click', () => listResizer.fitToNames());

setProjectName(currentProject().name, { save: false });
// 예전 데이터에서 옮겨 온 경우 새 형식으로 바로 저장해 둔다 (예전 키는 그대로 남는다)
saveProjectsState({ projects, currentId });
renderBackupStatus();
autosave.init();
// 저장 공간이 부족할 때 브라우저가 이 사이트 데이터를 먼저 지우지 않게 요청한다 (설치한 앱은 대개 바로 허락된다)
navigator.storage?.persist?.().catch(() => {});
renderList();
updateZoomControls();

const sharedData = shareDataFromHash(location.hash);
if (sharedData) openSharedView(sharedData);
