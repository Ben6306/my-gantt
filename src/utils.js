// 날짜 포맷, HTML 이스케이프, 의존성 문자열 변환 등 공용 헬퍼
export const toISODate = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export const addDays = (date, days) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

const dateFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

// "2026-12-01" → "Dec 1, 2026" (UTC로 해석되지 않도록 현지 날짜로 만든다)
export const formatDate = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return dateFormat.format(new Date(y, m - 1, d));
};

// plural(1, 'task') → "1 task", plural(3, 'task') → "3 tasks"
export const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

export const escapeHTML = (str) =>
  String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// 의존성은 "1, 2" 형식 문자열로 저장한다. 이전 버전에서 저장한 배열도 받아들인다.
export const parseDeps = (value) =>
  (Array.isArray(value) ? value : String(value ?? '').split(','))
    .map((d) => String(d).trim())
    .filter(Boolean);

export const joinDeps = (ids) => ids.join(', ');
