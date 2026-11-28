// 프로젝트를 압축해 URL #share= 뒤에 넣고 다시 꺼내는 함수 (# 뒤는 서버로 보내지지 않아 데이터가 GitHub에 남지 않는다)
const HASH_KEY = 'share=';
const VERSION = 1;

// 바이트 ↔ URL에 그대로 쓸 수 있는 base64 (+/ 대신 -_, 끝의 = 없음)
function toBase64Url(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text) {
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

const pipe = async (bytes, transform) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(transform)).arrayBuffer());

// { name, tasks } → URL에 붙일 글자
export async function encodeShare({ name, tasks }) {
  const json = new TextEncoder().encode(JSON.stringify({ v: VERSION, name, tasks }));
  return toBase64Url(await pipe(json, new CompressionStream('deflate-raw')));
}

/**
 * URL 글자 → { name, tasks } (태스크 검증은 부르는 쪽에서 parseTaskList로).
 * 잘렸거나 깨진 링크면 사용자에게 보여 줄 영어 메시지로 Error를 던진다.
 */
export async function decodeShare(data) {
  let parsed;
  try {
    const bytes = await pipe(fromBase64Url(data), new DecompressionStream('deflate-raw'));
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error('The link is incomplete or damaged. Ask for the link again, or for a JSON file.');
  }
  if (!parsed || !Array.isArray(parsed.tasks)) throw new Error('The link doesn’t contain a schedule.');
  const name = typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name.trim() : 'Shared project';
  return { name, tasks: parsed.tasks };
}

// location.hash에서 공유 데이터만 꺼낸다. 없으면 null
export function shareDataFromHash(hash) {
  const value = hash.startsWith('#') ? hash.slice(1) : hash;
  return value.startsWith(HASH_KEY) && value.length > HASH_KEY.length ? value.slice(HASH_KEY.length) : null;
}

export const shareUrl = (pageUrl, data) => `${pageUrl.split('#')[0]}#${HASH_KEY}${data}`;
