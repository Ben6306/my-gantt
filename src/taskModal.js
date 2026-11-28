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

let current = null;

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
  const candidates = tasks.filter((t) => t.id !== task.id);

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
  current = { onSave, onDelete };

  titleEl.textContent = isNew ? 'Add task' : 'Edit task';
  form.elements.name.value = task.name;
  form.elements.start.value = task.start;
  form.elements.end.value = task.end;
  form.elements.progress.value = task.progress;
  form.elements.color.value = task.color;
  renderDependencyOptions(task, tasks, isNew);
  updateDurationHint();

  errorEl.textContent = '';
  deleteBtn.hidden = isNew;

  dialog.showModal();
  form.elements.name.focus();
}

// 날짜 아래에 기간과 근무일(주말·공휴일 제외)을 보여 준다
function updateDurationHint() {
  const { start, end } = form.elements;
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

function showError(message, field) {
  errorEl.textContent = message;
  field?.focus();
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const { name, start, end, progress } = form.elements;
  const progressValue = Number(progress.value);

  if (!name.value.trim()) return showError('Enter a name.', name);
  if (!start.value) return showError('Enter a start date.', start);
  if (!end.value) return showError('Enter an end date.', end);
  if (end.value < start.value) return showError('The end date can’t be before the start date.', end);
  if (progress.value.trim() === '' || !Number.isInteger(progressValue) || progressValue < 0 || progressValue > 100) {
    return showError('Progress must be a whole number from 0 to 100.', progress);
  }

  current.onSave({
    name: name.value.trim(),
    start: start.value,
    end: end.value,
    progress: progressValue,
    color: form.elements.color.value,
    dependencies: joinDeps([...form.querySelectorAll('input[name="dependencies"]:checked')].map((i) => i.value)),
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
