// 헤더 로고(색 막대 3개)로 PWA 아이콘 PNG를 만드는 스크립트 (외부 패키지 없이 node 기본 모듈만 사용)
// 실행: node scripts/make-icons.mjs  → public/icons/*.png
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const BG = [0x14, 0x14, 0x15];
// index.html 로고와 같은 배치(20×20 좌표), 색은 style.css 팔레트
const BARS = [
  { x: 2, y: 3, w: 10, h: 4, color: [0x7b, 0x68, 0xee] },
  { x: 6, y: 8, w: 12, h: 4, color: [0x4a, 0x90, 0xf7] },
  { x: 4, y: 13, w: 8, h: 4, color: [0x3f, 0xbf, 0x6a] },
];

const insideRoundRect = (px, py, x, y, w, h, r) => {
  if (px < x || px > x + w || py < y || py > y + h) return false;
  const cx = Math.min(Math.max(px, x + r), x + w - r);
  const cy = Math.min(Math.max(py, y + r), y + h - r);
  return (px - cx) ** 2 + (py - cy) ** 2 <= r * r;
};

/**
 * @param {number} size 픽셀 크기
 * @param {number} logoWidth 로고(가로 16단위)가 차지할 비율
 * @param {number} cornerRatio 배경 모서리 반지름 비율 (0이면 꽉 찬 사각형: maskable·apple-touch-icon용)
 */
function render(size, logoWidth, cornerRatio) {
  const scale = (logoWidth * size) / 16;
  // 로고 묶음의 가운데(10, 10)를 캔버스 가운데로
  const toCanvas = (v) => (v - 10) * scale + size / 2;
  const bars = BARS.map((b) => ({ ...b, x: toCanvas(b.x), y: toCanvas(b.y), w: b.w * scale, h: b.h * scale, r: (b.h / 2) * scale }));
  const radius = cornerRatio * size;

  const SS = 4; // 가장자리를 부드럽게 하려고 픽셀마다 4×4 점을 찍어 평균낸다
  const pixels = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS;
          const py = y + (sy + 0.5) / SS;
          if (!insideRoundRect(px, py, 0, 0, size, size, radius)) continue;
          const bar = bars.find((bb) => insideRoundRect(px, py, bb.x, bb.y, bb.w, bb.h, bb.r));
          const c = bar ? bar.color : BG;
          r += c[0];
          g += c[1];
          b += c[2];
          a += 1;
        }
      }
      const i = (y * size + x) * 4;
      if (a) {
        pixels[i] = Math.round(r / a);
        pixels[i + 1] = Math.round(g / a);
        pixels[i + 2] = Math.round(b / a);
      }
      pixels[i + 3] = Math.round((a / (SS * SS)) * 255);
    }
  }
  return encodePng(size, pixels);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // 비트 깊이
  ihdr[9] = 6; // RGBA
  // 각 줄 앞에 필터 0(없음)
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const outDir = new URL('../public/icons/', import.meta.url);
mkdirSync(outDir, { recursive: true });
const icons = {
  // 일반 아이콘: 둥근 모서리 배경
  'icon-192.png': render(192, 0.56, 0.22),
  'icon-512.png': render(512, 0.56, 0.22),
  // maskable: OS가 원·둥근사각형으로 잘라내므로 꽉 찬 배경 + 가운데 80% 안전 영역 안에 로고
  'maskable-512.png': render(512, 0.46, 0),
  // Safari/iOS·macOS Dock: OS가 모서리를 깎으므로 꽉 찬 배경
  'apple-touch-icon.png': render(180, 0.52, 0),
};
for (const [name, png] of Object.entries(icons)) {
  writeFileSync(new URL(name, outDir), png);
  console.log(`public/icons/${name}  ${png.length} bytes`);
}
