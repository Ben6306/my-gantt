// 태스크 추가/수정 모달 폼을 열고 입력값을 검증해 콜백으로 넘기는 모듈
import { joinDeps, parseDeps } from './utils.js';
import { TASK_COLORS } from './colors.js';
import { calendarDays, workingDays } from './holidays.js';

const dialog = document.getElementById('task-modal');
const form = document.getElementById('task-form');
const titleEl = document.getElementById('modal-title');
const depOptions = document.getElementById('dependency-options');
const errorEl = document.getElementById('form-error');
const deleteBtn = document.getElementById('delete-btn');
const colorOptions = document.getElementById('color-options');
const durationHint = document.getElementById('duration-hint');
const startLabel = document.getElementById('start-label');
const parentSelect = document.getElementById('parent-select');
const nameInput = form.elements.name;

let current = null;

const TYPE_WORD = { task: 'task', milestone: 'milestone', group: 'group' };

// 종류에 따라 보이는 칸이 달라진다
// - 마일스톤: 종료일·진행률 대신 날짜 하나와 Done
// - 그룹: 소속 그룹·선행 태스크 없음. 자식이 있으면 날짜·진행률은 자식으로 계산돼 고칠 수 없다
function applyType() {
  const type = form.elements.type.value;
  form.dataset.type = type;
  startLabel.textContent = type === 'milestone' ? 'Date' : 'Start date';
  titleEl.textContent = `${current.isNew ? 'Add' : 'Edit'} ${TYPE_WORD[type]}`;
  const auto = type === 'group' && current.childCount > 0;
  for (const name of ['start', 'end', 'progress']) form.elements[name].disabled = auto;
  updateDurationHint();
}
form.querySelectorAll('input[name="type"]').forEach((input) => input.addEventListener('change', applyType));

// 색상 스와치는 한 번만 만들고, 열 때마다 선택만 바꾼다
colorOptions.replaceChildren(
  ...TASK_COLORS.map(({ key, name }) => {
    const label = document.createElement('label');
    label.className = `swatch c-${key}`;
    label.title = name;
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'color';
    input.value = key;
    input.setAttribute('aria-label', name);
    const dot = document.createElement('span');
    dot.className = 'swatch-dot';
    label.append(input, dot);
    return label;
  }),
);

// id를 선행 태스크로 (직간접적으로) 두고 있는 태스크들. 이들을 선행으로 고르면 순환이 생긴다.
function dependentsOf(id, tasks) {
  const found = new Set();
  const queue = [id];
  while (queue.length) {
    const cur = queue.shift();
    for (const t of tasks) {
      if (!found.has(t.id) && parseDeps(t.dependencies).includes(cur)) {
        found.add(t.id);
        queue.push(t.id);
      }
    }
  }
  return found;
}

function renderDependencyOptions(task, tasks, isNew) {
  const blocked = isNew ? new Set() : dependentsOf(task.id, tasks);
  const selected = parseDeps(task.dependencies);
  // 그룹은 선행 태스크가 될 수 없다 (기간이 자식으로 정해져서)
  const candidates = tasks.filter((t) => t.id !== task.id && t.type !== 'group');

  if (!candidates.length) {
    const p = document.createElement('p');
    p.className = 'muted';
    p.textContent = 'No other tasks to choose from.';
    depOptions.replaceChildren(p);
    return;
  }

  depOptions.replaceChildren(
    ...candidates.map((t) => {
      const label = document.createElement('label');
      label.className = 'dep-option';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.name = 'dependencies';
      input.value = t.id;
      input.checked = selected.includes(t.id);
      if (blocked.has(t.id)) {
        input.disabled = true;
        label.title = 'Unavailable: this task already depends on the current task.';
      }
      const span = document.createElement('span');
      span.textContent = t.name;
      label.append(input, span);
      return label;
    }),
  );
}

/**
 * @param {object} opts
 * @param {object} opts.task 폼에 채울 태스크 (새 태스크면 기본값)
 * @param {boolean} opts.isNew
 * @param {object[]} opts.tasks 전체 태스크 (선행 태스크 후보)
 * @param {(data: object) => void} opts.onSave
 * @param {() => Promise<boolean>} [opts.onDelete] 실제로 삭제했으면 true
 */
export function openTaskModal({ task, isNew, tasks, onSave, onDelete }) {
  current = { onSave, onDelete, isNew, childCount: isNew ? 0 : tasks.filter((t) => t.parent === task.id).length };

  form.elements.type.value = task.type === 'milestone' || task.type === 'group' ? task.type : 'task';
  // 소속 그룹 후보: 이 태스크가 아닌 그룹들
  const groups = tasks.filter((t) => t.type === 'group' && t.id !== task.id);
  parentSelect.replaceChildren(
    new Option('No group', ''),
    ...groups.map((g) => new Option(g.name, g.id)),
  );
  parentSelect.value = groups.some((g) => g.id === task.parent) ? task.parent : '';
  parentSelect.disabled = !groups.length;
  parentSelect.title = groups.length ? '' : 'Add a task with the type “Group” first.';
  nameInput.value = task.name;
  // 전에 모서리를 끌어 바꾼 높이는 지우고 이름 길이에 맞춘다
  nameInput.style.height = '';
  form.elements.start.value = task.start;
  form.elements.end.value = task.end;
  form.elements.progress.value = task.progress;
  form.elements.done.checked = task.progress >= 100;
  form.elements.notes.value = task.notes ?? '';
  form.elements.color.value = task.color;
  renderDependencyOptions(task, tasks, isNew);
  updateDurationHint();
  applyType();

  errorEl.textContent = '';
  deleteBtn.hidden = isNew;

  dialog.showModal();
  nameInput.focus();
  fitNameHeight();
}

// 날짜 아래에 기간과 근무일(주말·공휴일 제외)을 보여 준다
function updateDurationHint() {
  const { start, end } = form.elements;
  if (form.dataset.type === 'milestone') {
    durationHint.textContent = '';
    return;
  }
  if (form.dataset.type === 'group' && current?.childCount) {
    const n = current.childCount;
    durationHint.textContent = `Dates and progress follow its ${n} ${n === 1 ? 'task' : 'tasks'}.`;
    return;
  }
  if (!start.value || !end.value || end.value < start.value) {
    durationHint.textContent = '';
    return;
  }
  const days = calendarDays(start.value, end.value);
  const work = workingDays(start.value, end.value);
  durationHint.textContent = `${days} ${days === 1 ? 'day' : 'days'} · ${work} working ${work === 1 ? 'day' : 'days'}`;
}
form.elements.start.addEventListener('input', updateDurationHint);
form.elements.end.addEventListener('input', updateDurationHint);

// 이름은 여러 줄로 보이지만 한 줄짜리 값이다: Enter는 저장, 붙여 넣은 줄바꿈은 공백으로
nameInput.addEventListener('keydown', (e) => {
  // 한글 입력 중 Enter(글자 확정)는 그대로 둔다
  if (e.key !== 'Enter' || e.isComposing) return;
  e.preventDefault();
  form.requestSubmit();
});
nameInput.addEventListener('input', () => {
  if (/[\r\n]/.test(nameInput.value)) nameInput.value = nameInput.value.replace(/\s*[\r\n]+\s*/g, ' ');
  fitNameHeight();
});

// field-sizing을 지원하지 않는 브라우저(Safari 등)에서는 내용에 맞춰 높이를 직접 늘린다
const autoSizes = typeof CSS !== 'undefined' && CSS.supports('field-sizing', 'content');
function fitNameHeight() {
  if (autoSizes) return;
  nameInput.style.height = 'auto';
  nameInput.style.height = `${nameInput.scrollHeight + 2}px`;
}

function showError(message, field) {
  errorEl.textContent = message;
  field?.focus();
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const { name, start, end, progress, done } = form.elements;
  const type = form.elements.type.value;
  const milestone = type === 'milestone';
  const group = type === 'group';
  const progressValue = milestone ? (done.checked ? 100 : 0) : Number(progress.value);

  if (!name.value.trim()) return showError('Enter a name.', name);
  if (!start.value) return showError(milestone ? 'Enter a date.' : 'Enter a start date.', start);
  if (!milestone) {
    if (!end.value) return showError('Enter an end date.', end);
    if (end.value < start.value) return showError('The end date can’t be before the start date.', end);
    if (progress.value.trim() === '' || !Number.isInteger(progressValue) || progressValue < 0 || progressValue > 100) {
      return showError('Progress must be a whole number from 0 to 100.', progress);
    }
  }

  current.onSave({
    type,
    // 그룹은 다른 그룹에 들어갈 수 없고 선행 태스크도 없다
    parent: group ? '' : form.elements.parent.value,
    name: name.value.trim(),
    start: start.value,
    end: milestone ? start.value : end.value,
    progress: progressValue,
    color: form.elements.color.value,
    notes: form.elements.notes.value,
    dependencies: group ? '' : joinDeps([...form.querySelectorAll('input[name="dependencies"]:checked')].map((i) => i.value)),
  });
  dialog.close();
});

deleteBtn.addEventListener('click', async () => {
  if (await current.onDelete()) dialog.close();
});

document.getElementById('cancel-btn').addEventListener('click', () => dialog.close());

// 바깥 배경을 클릭하면 닫는다
dialog.addEventListener('click', (e) => {
  if (e.target === dialog) dialog.close();
});
