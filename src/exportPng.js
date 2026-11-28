// 전체 일정을 캔버스에 직접 그려 PNG로 내려받는 모듈 (스크롤과 상관없이 모든 태스크·첫 태스크~마지막 태스크 기간)
import { buildTimeline } from './timeline.js';
import { addDays, fileStem, formatDate, parseDeps, parseISODate, plural, toISODate } from './utils.js';

const FONT_FAMILY = '"Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, "Malgun Gothic", sans-serif';
const font = (weight, size) => `${weight} ${size}px ${FONT_FAMILY}`;

// 브라우저 캔버스 한계(한 변 약 16k px, 넓이 약 2.6억 px) 안에서 여유 있게
const MAX_SIDE = 16000;
const MAX_AREA = 100_000_000;
const MAX_SCALE = 2;
const MIN_SCALE = 0.75;

// 화면과 같은 치수: 행 40px, 막대 24px
const L = { pad: 32, titleH: 72, headUpper: 32, headLower: 32, rowH: 40, barH: 24, cell: 16, gap: 12, dateW: 96, progressW: 100 };

const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

// 태스크 색은 CSS(.c-<키>)에만 있으므로 임시 요소로 읽는다
function readTaskColor(key) {
  const el = document.createElement('span');
  el.className = `c-${key}`;
  document.body.append(el);
  const color = getComputedStyle(el).getPropertyValue('--c').trim();
  el.remove();
  return color;
}

const hexToRgb = (hex) => {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

// 화면의 color-mix(in srgb, 색 p%, 배경)과 같은 계산
const mix = (hex, bgHex, p) => {
  const a = hexToRgb(hex);
  const b = hexToRgb(bgHex);
  return `rgb(${a.map((v, i) => Math.round(v * p + b[i] * (1 - p))).join(' ')})`;
};

function ellipsize(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (ctx.measureText(`${text.slice(0, mid)}…`).width <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return `${text.slice(0, lo)}…`;
}

function line(ctx, x1, y1, x2, y2, color, width = 1) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  // 1px 선이 흐려지지 않게 반 픽셀에 맞춘다
  const off = width % 2 === 1 ? 0.5 : 0;
  ctx.moveTo(Math.round(x1) + off, Math.round(y1) + off);
  ctx.lineTo(Math.round(x2) + off, Math.round(y2) + off);
  ctx.stroke();
}

/**
 * @param {object} opts
 * @param {object[]} opts.tasks 1개 이상
 * @param {string} opts.projectName
 * @param {'Day'|'Week'|'Month'} opts.mode 지금 화면의 보기 단위
 * @param {number} opts.columnWidth 지금 화면의 칸 너비
 * @returns {Promise<string>} 내려받은 파일 이름
 */
export async function exportPng({ tasks, projectName, mode, columnWidth, now = new Date() }) {
  const tl = buildTimeline(tasks, { mode, columnWidth });

  const c = {
    bg: cssVar('--bg'),
    hairline: cssVar('--hairline'),
    hairlineStrong: cssVar('--hairline-strong'),
    tick: cssVar('--g-tick-color'),
    weekend: cssVar('--g-weekend-highlight-color'),
    holiday: cssVar('--g-holiday-color'),
    text: cssVar('--text'),
    text2: cssVar('--text-2'),
    text3: cssVar('--text-3'),
    positive: cssVar('--positive'),
    arrow: cssVar('--g-arrow-color'),
    today: cssVar('--text'),
  };
  const taskColors = Object.fromEntries([...new Set(tasks.map((t) => t.color))].map((key) => [key, readTaskColor(key)]));

  const minStart = tasks.reduce((m, t) => (t.start < m ? t.start : m), tasks[0].start);
  const maxEnd = tasks.reduce((m, t) => (t.end > m ? t.end : m), tasks[0].end);
  const subtitle = `${plural(tasks.length, 'task')} · ${formatDate(minStart)} – ${formatDate(maxEnd)}`;
  const exported = `Exported ${formatDate(toISODate(now))}`;

  // 글꼴 조각(서브셋)이 아직 안 내려와 있으면 캔버스가 다른 글꼴로 그리므로 쓸 글자를 먼저 받아 둔다
  const allText = [
    projectName,
    subtitle,
    exported,
    'TaskStartEndProgress%…',
    ...tasks.flatMap((t) => [t.name, formatDate(t.start), formatDate(t.end)]),
    ...tl.columns.map((col) => col.label),
    ...tl.groups.map((g) => g.label),
  ].join('');
  await Promise.all(
    [font(400, 12), font(500, 12), font(400, 13), font(500, 13), font(600, 20)].map((f) => document.fonts.load(f, allText)),
  );

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  // 목록의 이름 칸은 가장 긴 이름에 맞추되 160~320px
  ctx.font = font(400, 13);
  const longest = Math.max(...tasks.map((t) => ctx.measureText(t.name).width));
  const nameW = Math.min(320, Math.max(160, Math.ceil(longest) + 18));
  const listW = L.cell + nameW + L.gap + L.dateW + L.gap + L.dateW + L.gap + L.progressW + L.cell;

  const headH = L.headUpper + L.headLower;
  const tableW = listW + tl.width;
  const tableH = headH + tasks.length * L.rowH;
  const W = L.pad * 2 + tableW;
  const H = L.pad * 2 + L.titleH + tableH;

  const scale = Math.min(MAX_SCALE, MAX_SIDE / W, MAX_SIDE / H, Math.sqrt(MAX_AREA / (W * H)));
  if (scale < MIN_SCALE) {
    throw new Error('The image would be too large. Zoom out (Week or Month) and try again.');
  }
  canvas.width = Math.round(W * scale);
  canvas.height = Math.round(H * scale);
  ctx.scale(scale, scale);
  ctx.textBaseline = 'middle';

  ctx.fillStyle = c.bg;
  ctx.fillRect(0, 0, W, H);

  // 제목 영역
  ctx.textAlign = 'left';
  ctx.font = font(600, 20);
  ctx.fillStyle = c.text;
  ctx.fillText(ellipsize(ctx, projectName, tableW - 240), L.pad, L.pad + 14);
  ctx.font = font(400, 13);
  ctx.fillStyle = c.text3;
  ctx.fillText(subtitle, L.pad, L.pad + 42);
  ctx.textAlign = 'right';
  ctx.fillText(exported, W - L.pad, L.pad + 14);

  const tx = L.pad;
  const ty = L.pad + L.titleH;
  const gx = tx + listW;
  const bodyY = ty + headH;
  const bottom = ty + tableH;

  // 목록 칸 위치
  const colName = tx + L.cell;
  const colStart = colName + nameW + L.gap;
  const colEnd = colStart + L.dateW + L.gap;
  const colProgress = colEnd + L.dateW + L.gap;

  // 타임라인 배경: 주말, 칸 구분선, 월(연) 경계선
  for (const col of tl.columns) {
    if (col.weekend || col.holiday) {
      ctx.fillStyle = col.holiday ? c.holiday : c.weekend;
      ctx.fillRect(gx + col.x, ty + L.headUpper, columnWidth, bottom - ty - L.headUpper);
    }
    if (col.x > 0) line(ctx, gx + col.x, ty + L.headUpper, gx + col.x, bottom, c.tick);
  }
  for (const g of tl.groups) {
    if (g.x > 0) line(ctx, gx + g.x, ty, gx + g.x, bottom, c.hairline);
  }

  // 헤더 글자
  ctx.textAlign = 'left';
  ctx.font = font(500, 12);
  ctx.fillStyle = c.text3;
  const headLabelY = ty + L.headUpper + L.headLower / 2;
  ctx.fillText('Task', colName, headLabelY);
  ctx.fillText('Start', colStart, headLabelY);
  ctx.fillText('End', colEnd, headLabelY);
  ctx.fillText('Progress', colProgress, headLabelY);

  ctx.font = font(500, 13);
  ctx.fillStyle = c.text2;
  for (const g of tl.groups) {
    // 칸이 좁은 첫·마지막 묶음에서 글자가 옆 묶음으로 넘치지 않게 자른다
    ctx.save();
    ctx.beginPath();
    ctx.rect(gx + g.x, ty, g.width, L.headUpper);
    ctx.clip();
    ctx.fillText(g.label, gx + g.x + 8, ty + L.headUpper / 2 + 2);
    ctx.restore();
  }

  ctx.font = font(400, 12);
  ctx.fillStyle = c.text3;
  ctx.textAlign = 'center';
  for (const col of tl.columns) {
    ctx.fillText(col.label, gx + col.x + columnWidth / 2, headLabelY);
  }

  line(ctx, tx, bodyY, tx + tableW, bodyY, c.hairlineStrong);
  line(ctx, gx, ty, gx, bottom, c.hairlineStrong);

  // 막대 위치를 먼저 계산해 둔다 (화살표를 막대 아래에 그리기 위해)
  const geo = new Map();
  tasks.forEach((t, i) => {
    const rowTop = bodyY + i * L.rowH;
    const x1 = gx + tl.x(parseISODate(t.start));
    const x2 = gx + tl.x(addDays(parseISODate(t.end), 1));
    geo.set(t.id, { rowTop, x1, x2: Math.max(x2, x1 + 2), top: rowTop + (L.rowH - L.barH) / 2, mid: rowTop + L.rowH / 2 });
  });

  // 행 구분선과 왼쪽 목록
  tasks.forEach((t, i) => {
    const { rowTop, mid } = geo.get(t.id);
    line(ctx, tx, rowTop + L.rowH, tx + tableW, rowTop + L.rowH, c.hairline);

    const color = taskColors[t.color];
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(colName, mid - 5, 10, 10, 3);
    ctx.fill();

    ctx.textAlign = 'left';
    ctx.font = font(400, 13);
    ctx.fillStyle = c.text;
    ctx.fillText(ellipsize(ctx, t.name, nameW - 18), colName + 18, mid);
    ctx.fillStyle = c.text2;
    ctx.fillText(formatDate(t.start), colStart, mid);
    ctx.fillText(formatDate(t.end), colEnd, mid);

    const trackW = L.progressW - 40;
    ctx.fillStyle = c.hairline;
    ctx.beginPath();
    ctx.roundRect(colProgress, mid - 2, trackW, 4, 2);
    ctx.fill();
    if (t.progress > 0) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(colProgress, mid - 2, Math.max(4, (trackW * t.progress) / 100), 4, 2);
      ctx.fill();
    }
    ctx.textAlign = 'right';
    ctx.font = font(400, 12);
    ctx.fillStyle = t.progress === 100 ? c.positive : c.text3;
    ctx.fillText(`${t.progress}%`, colProgress + L.progressW, mid);
  });

  // 의존성 화살표: 선행 막대 끝 → 후행 막대 시작
  ctx.strokeStyle = c.arrow;
  ctx.fillStyle = c.arrow;
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'round';
  for (const t of tasks) {
    const to = geo.get(t.id);
    for (const depId of parseDeps(t.dependencies)) {
      const from = geo.get(depId);
      if (!from) continue;
      const sx = from.x2;
      const ex = to.x1;
      ctx.beginPath();
      ctx.moveTo(sx, from.mid);
      if (ex - sx >= 20) {
        ctx.lineTo(sx + 8, from.mid);
        ctx.lineTo(sx + 8, to.mid);
      } else {
        // 후행이 선행보다 먼저 시작하면 행 사이로 돌아 들어간다
        const between = to.mid > from.mid ? to.rowTop : to.rowTop + L.rowH;
        ctx.lineTo(sx + 8, from.mid);
        ctx.lineTo(sx + 8, between);
        ctx.lineTo(ex - 12, between);
        ctx.lineTo(ex - 12, to.mid);
      }
      ctx.lineTo(ex - 4, to.mid);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(ex, to.mid);
      ctx.lineTo(ex - 6, to.mid - 4);
      ctx.lineTo(ex - 6, to.mid + 4);
      ctx.closePath();
      ctx.fill();
    }
  }

  // 막대
  for (const t of tasks) {
    const { x1, x2, top, mid } = geo.get(t.id);
    const color = taskColors[t.color];
    const width = x2 - x1;

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x1, top, width, L.barH, 4);
    ctx.fillStyle = mix(color, c.bg, 0.28);
    ctx.fill();
    ctx.clip();
    ctx.fillStyle = mix(color, c.bg, 0.52);
    ctx.fillRect(x1, top, (width * t.progress) / 100, L.barH);
    ctx.restore();

    ctx.beginPath();
    ctx.roundRect(x1 + 0.5, top + 0.5, width - 1, L.barH - 1, 4);
    ctx.strokeStyle = mix(color, c.bg, 0.6);
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.font = font(500, 12);
    const labelW = ctx.measureText(t.name).width;
    if (labelW + 16 <= width) {
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff';
      ctx.fillText(t.name, x1 + width / 2, mid);
    } else {
      ctx.textAlign = 'left';
      ctx.fillStyle = c.text2;
      ctx.fillText(t.name, x2 + 8, mid);
    }
  }

  // 오늘 선 (기간 안에 있을 때만)
  const todayNoon = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  if (todayNoon >= tl.start && todayNoon < tl.end) {
    const x = gx + tl.x(todayNoon);
    line(ctx, x, ty + L.headUpper + L.headLower - 4, x, bottom, c.today);
    ctx.fillStyle = c.today;
    ctx.beginPath();
    ctx.arc(Math.round(x) + 0.5, ty + L.headUpper + L.headLower - 4, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // 표 테두리
  ctx.strokeStyle = c.hairlineStrong;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(tx + 0.5, ty + 0.5, tableW - 1, tableH - 1, 8);
  ctx.stroke();

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Couldn’t create the image.');

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${fileStem(projectName)}-${toISODate(now)}.png`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url));
  return a.download;
}
