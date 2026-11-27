// 삭제·초기화 같은 되돌릴 수 없는 동작 전에 띄우는 공용 확인 모달
const dialog = document.getElementById('confirm-modal');
const titleEl = document.getElementById('confirm-title');
const messageEl = document.getElementById('confirm-message');
const okBtn = document.getElementById('confirm-ok');

/** 확인을 누르면 true, 취소·Esc·바깥 클릭이면 false로 끝나는 Promise */
export function confirmDialog({ title, message, confirmText }) {
  titleEl.textContent = title;
  messageEl.textContent = message;
  okBtn.textContent = confirmText;
  dialog.returnValue = '';
  dialog.showModal();
  okBtn.focus();

  return new Promise((resolve) => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'ok'), { once: true });
  });
}

dialog.addEventListener('click', (e) => {
  if (e.target === dialog) dialog.close();
});
