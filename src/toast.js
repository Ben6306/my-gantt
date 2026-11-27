// 화면 아래에 잠깐 떴다 사라지는 안내 메시지
const el = document.getElementById('toast');
let timer;

export function showToast(message, { type = 'info' } = {}) {
  el.textContent = message;
  el.dataset.type = type;
  el.classList.add('show');
  clearTimeout(timer);
  // 오류는 읽을 시간이 더 필요하다
  timer = setTimeout(() => el.classList.remove('show'), type === 'error' ? 7000 : 3500);
}
