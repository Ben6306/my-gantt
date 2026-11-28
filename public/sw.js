// 오프라인 실행용 서비스 워커: 페이지는 네트워크 우선(항상 최신), 해시가 붙은 자산·글꼴·아이콘은 캐시 우선
const CACHE = 'gantt-v1';
// 배포가 쌓여 옛 해시 파일이 계속 늘지 않도록 이 개수를 넘으면 오래된 것부터 지운다 (글꼴 조각 92개 + 앱 파일)
const MAX_ENTRIES = 200;

self.addEventListener('install', (event) => {
  // 첫 방문에서 바로 오프라인 준비: 페이지와 설치 정보만 미리 받고, 나머지는 쓰는 순간 담는다
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(['./', './manifest.webmanifest'])));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // 캐시 이름을 바꿨을 때 이전 버전 캐시를 지운다
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function trim(cache) {
  const keys = await cache.keys();
  for (const request of keys.slice(0, Math.max(0, keys.length - MAX_ENTRIES))) await cache.delete(request);
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    // GitHub Pages가 페이지를 10분(max-age=600) 캐시하라고 보내서, 그대로 받으면 배포 직후에도 옛 페이지가 열린다.
    // 브라우저 캐시를 건너뛰고 서버에 바뀌었는지 확인한다 (안 바뀌었으면 304라 가볍다)
    const response = await fetch(request, { cache: 'no-cache' });
    if (response.ok) await cache.put('./', response.clone());
    return response;
  } catch {
    return (await cache.match('./')) ?? Response.error();
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    await cache.put(request, response.clone());
    trim(cache);
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  // 페이지(HTML)를 열 때는 새 배포를 바로 받도록 네트워크 먼저
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }
  // assets/ 파일은 이름에 해시가 있어 내용이 바뀌지 않으므로 캐시 먼저
  event.respondWith(cacheFirst(request));
});
