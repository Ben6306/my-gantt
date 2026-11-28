// 태스크를 CSV로 쓰고, CSV(엑셀·구글 시트에서 저장한 것 포함)를 태스크 목록으로 읽는 순수 함수
import { joinDeps } from './utils.js';

// 열 이름은 JSON 백업 필드와 같게 해서 둘을 오가기 쉽게 한다 (group = parent, baseline_* = baseline*)
export const CSV_COLUMNS = ['id', 'name', 'type', 'group', 'start', 'end', 'progress', 'dependencies', 'color', 'notes', 'baseline_start', 'baseline_end'];

// 엑셀은 =, +, -, @로 시작하는 칸을 수식으로 실행한다(CSV 주입). 앞에 '를 붙여 글자로 두고, 읽을 때 뗀다
const FORMULA_START = /^[=+\-@\t\r]/;

function cell(value) {
  let text = value == null ? '' : String(value);
  if (FORMULA_START.test(text)) text = `'${text}`;
  return /[",\r\n]|^\s|\s$/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// 태스크 목록 → CSV 글자 (줄바꿈은 엑셀 기본인 CRLF). BOM은 내려받을 때 붙인다
export function tasksToCSV(tasks) {
  const rows = tasks.map((t) => [
    t.id,
    t.name,
    t.type ?? 'task',
    t.parent ?? '',
    t.start,
    t.end,
    t.progress,
    t.dependencies,
    t.color,
    t.notes ?? '',
    t.baselineStart ?? '',
    t.baselineEnd ?? '',
  ]);
  return [CSV_COLUMNS, ...rows].map((row) => row.map(cell).join(',')).join('\r\n');
}

// 첫 줄에서 구분자를 고른다: 쉼표가 기본, 유럽식 엑셀은 세미콜론, 표에서 복사하면 탭
function detectDelimiter(text) {
  const firstLine = text.split(/\r?\n/, 1)[0];
  const count = (ch) => firstLine.split(ch).length - 1;
  const [best] = [',', ';', '\t'].sort((a, b) => count(b) - count(a));
  return count(best) ? best : ',';
}

// RFC 4180: 따옴표 안의 구분자·줄바꿈, ""는 따옴표 하나
export function parseCSV(text) {
  const src = text.replace(/^﻿/, '');
  const delimiter = detectDelimiter(src);
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field === '') quoted = true;
    else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// 열 이름을 맞춘다: 대소문자·공백·밑줄 무시, 몇 가지 다른 이름도 받는다
const HEADER_ALIASES = {
  id: 'id',
  name: 'name',
  task: 'name',
  type: 'type',
  group: 'group',
  parent: 'group',
  start: 'start',
  startdate: 'start',
  end: 'end',
  enddate: 'end',
  progress: 'progress',
  dependencies: 'dependencies',
  dependson: 'dependencies',
  color: 'color',
  notes: 'notes',
  baselinestart: 'baseline_start',
  baselineend: 'baseline_end',
};
const headerKey = (h) => HEADER_ALIASES[h.trim().toLowerCase().replace(/[\s_()-]/g, '')] ?? null;

// "2026-12-01", "2026/12/1", "2026.12.1", "2026. 12. 1." → "2026-12-01". 모르는 형식은 그대로 둬서 검증에서 알려 준다
function normalizeDate(value) {
  const m = value.trim().match(/^(\d{4})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{1,2})\.?$/);
  return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : value.trim();
}

/**
 * CSV 글자 → 검증 전 태스크 목록 (검증·정리는 backup.js의 parseTaskList가 한다).
 * name·start 열이 있어야 한다. id가 비면 번호를 새로 매긴다.
 */
export function csvToTasks(text) {
  const rows = parseCSV(text).filter((r) => r.some((v) => v.trim() !== ''));
  if (!rows.length) throw new Error('The file is empty.');
  const keys = rows[0].map(headerKey);
  if (!keys.includes('name') || !keys.includes('start')) {
    throw new Error('The first row must have column names, including “name” and “start”. Export a CSV from this app to see the format.');
  }
  const records = rows.slice(1).map((r) => {
    const rec = {};
    keys.forEach((k, i) => {
      if (!k) return;
      let v = (r[i] ?? '').trim();
      // 내보낼 때 붙인 수식 방지 '를 뗀다
      if (/^'[=+\-@\t\r]/.test(v)) v = v.slice(1);
      rec[k] = v;
    });
    return rec;
  });

  const used = new Set(records.map((r) => r.id).filter(Boolean));
  let next = 1;
  const freshId = () => {
    while (used.has(String(next))) next++;
    used.add(String(next));
    return String(next);
  };

  return records.map((r) => ({
    id: r.id || freshId(),
    name: r.name ?? '',
    type: (r.type ?? '').toLowerCase(),
    parent: r.group ?? '',
    start: normalizeDate(r.start ?? ''),
    end: normalizeDate(r.end ?? ''),
    progress: r.progress ? Number(r.progress.replace('%', '')) : 0,
    dependencies: joinDeps((r.dependencies ?? '').split(/[\s,;]+/).filter(Boolean)),
    color: (r.color ?? '').toLowerCase(),
    notes: r.notes ?? '',
    baselineStart: normalizeDate(r.baseline_start ?? ''),
    baselineEnd: normalizeDate(r.baseline_end ?? ''),
  }));
}
