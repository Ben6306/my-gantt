// 목록과 차트 사이 경계선을 끌어 왼쪽 목록 폭을 바꾸는 모듈 (늘어나는 것은 태스크 이름 칸)
import { loadListWidth, saveListWidth } from './storage.js';

const MIN_WIDTH = 480;
const MIN_CHART = 360;
const MAX_WIDTH = 1200;
const KEY_STEP = 16;
const KEY_STEP_LARGE = 64;
// 이름 칸 말고 고정된 부분: 날짜 92×2 + 진행률 88 + 버튼 56 + 칸 간격 12×4 + 좌우 여백 16+8 + 색 점 10 + 점 간격 8 + 여유 8
const FIXED_PART = 92 * 2 + 88 + 56 + 12 * 4 + 16 + 8 + 10 + 8 + 8;

/**
 * @param {object} opts
 * @param {HTMLElement} opts.board 폭 변수(--list-w)를 둘 요소
 * @param {HTMLElement} opts.handle 경계선 손잡이
 * @param {() => string[]} opts.getNames 더블클릭 때 맞출 태스크 이름들
 * @param {() => void} opts.onResize 폭이 바뀐 뒤 할 일 (차트 높이 보정 등)
 */
export function initListResizer({ board, handle, getNames, onResize }) {
  const maxWidth = () => Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, board.clientWidth - MIN_CHART));
  const clamp = (w) => Math.round(Math.min(Math.max(w, MIN_WIDTH), maxWidth()));
  const currentWidth = () => document.querySelector('.task-list').getBoundingClientRect().width;

  function apply(width, { save = false } = {}) {
    const w = clamp(width);
    board.style.setProperty('--list-w', `${w}px`);
    handle.setAttribute('aria-valuenow', String(w));
    handle.setAttribute('aria-valuemin', String(MIN_WIDTH));
    handle.setAttribute('aria-valuemax', String(maxWidth()));
    if (save) saveListWidth(w);
    onResize();
  }

  // 저장해 둔 폭이 있으면 쓰고, 없으면 CSS 기본값(clamp(520px, 40vw, 640px))을 그대로 둔다
  const saved = loadListWidth();
  if (Number.isFinite(saved) && saved > 0) apply(saved);
  else handle.setAttribute('aria-valuenow', String(Math.round(currentWidth())));

  handle.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = currentWidth();
    handle.setPointerCapture(e.pointerId);
    document.body.classList.add('is-resizing');
    const move = (ev) => apply(startWidth + ev.clientX - startX);
    const up = (ev) => {
      handle.releasePointerCapture(ev.pointerId);
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', up);
      document.body.classList.remove('is-resizing');
      apply(currentWidth(), { save: true });
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  });

  // 더블클릭: 가장 긴 이름이 잘리지 않는 폭으로. 목록과 같은 글꼴로 실제 너비를 잰다
  handle.addEventListener('dblclick', () => {
    const probe = document.createElement('span');
    probe.className = 'task-name-text';
    probe.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;left:-9999px';
    document.body.append(probe);
    let longest = 0;
    for (const name of getNames()) {
      probe.textContent = name;
      longest = Math.max(longest, probe.getBoundingClientRect().width);
    }
    probe.remove();
    apply(Math.ceil(longest) + FIXED_PART, { save: true });
  });

  handle.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const step = e.shiftKey ? KEY_STEP_LARGE : KEY_STEP;
    apply(currentWidth() + (e.key === 'ArrowRight' ? step : -step), { save: true });
  });

  // 창을 줄이면 차트 최소 폭을 지키도록 다시 맞춘다 (저장값은 그대로 둬서 창을 키우면 돌아온다)
  window.addEventListener('resize', () => {
    const saved = loadListWidth();
    if (Number.isFinite(saved) && saved > 0) apply(saved);
  });
}
