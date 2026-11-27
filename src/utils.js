// 날짜 포맷, HTML 이스케이프, 의존성 문자열 변환 등 공용 헬퍼
export const toISODate = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export const addDays = (date, days) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

// "2026-12-01" → 현지 시각 자정의 Date (new Date("2026-12-01")은 UTC로 해석되어 하루 밀릴 수 있다)
export const parseISODate = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};

const dateFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

// "2026-12-01" → "Dec 1, 2026"
export const formatDate = (iso) => dateFormat.format(parseISODate(iso));

// 파일 이름에 쓸 수 없는 문자는 빼고 공백은 하이픈으로. 이름이 비면 "gantt"
export const fileStem = (name) =>
  String(name ?? '')
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 40) || 'gantt';

// from 자리의 항목을 꺼내 결과 배열의 to 자리에 놓은 새 배열 (원본은 그대로)
export const moveItem = (list, from, to) => {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(Math.min(Math.max(to, 0), next.length), 0, item);
  return next;
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
