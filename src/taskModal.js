// 태스크 추가/수정 모달 폼을 열고 입력값을 검증해 콜백으로 넘기는 모듈
import { joinDeps, parseDeps } from './utils.js';

const dialog = document.getElementById('task-modal');
const form = document.getElementById('task-form');
const titleEl = document.getElementById('modal-title');
const depOptions = document.getElementById('dependency-options');
const errorEl = document.getElementById('form-error');
const deleteBtn = document.getElementById('delete-btn');

let current = null;

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
    p.textContent = '선택할 수 있는 태스크가 없습니다.';
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
        label.title = '이 태스크가 현재 태스크에 의존하고 있어 선택할 수 없습니다.';
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

  titleEl.textContent = isNew ? '태스크 추가' : '태스크 수정';
  form.elements.name.value = task.name;
  form.elements.start.value = task.start;
  form.elements.end.value = task.end;
  form.elements.progress.value = task.progress;
  renderDependencyOptions(task, tasks, isNew);

  errorEl.textContent = '';
  deleteBtn.hidden = isNew;

  dialog.showModal();
  form.elements.name.focus();
}

function showError(message, field) {
  errorEl.textContent = message;
  field?.focus();
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const { name, start, end, progress } = form.elements;
  const progressValue = Number(progress.value);

  if (!name.value.trim()) return showError('이름을 입력해 주세요.', name);
  if (!start.value) return showError('시작일을 입력해 주세요.', start);
  if (!end.value) return showError('종료일을 입력해 주세요.', end);
  if (end.value < start.value) return showError('종료일은 시작일보다 빠를 수 없습니다.', end);
  if (progress.value.trim() === '' || !Number.isInteger(progressValue) || progressValue < 0 || progressValue > 100) {
    return showError('진행률은 0에서 100 사이의 정수로 입력해 주세요.', progress);
  }

  current.onSave({
    name: name.value.trim(),
    start: start.value,
    end: end.value,
    progress: progressValue,
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
