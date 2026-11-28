// 고른 JSON 파일에 모든 프로젝트를 자동으로 저장하는 모듈 (File System Access API, Chrome·Edge만). 파일 핸들은 IndexedDB에 보관
const DB_NAME = 'my-gantt';
const STORE = 'kv';
const HANDLE_KEY = 'autosave-handle';
const DEBOUNCE_MS = 1000;

export const autosaveSupported = typeof window !== 'undefined' && 'showSaveFilePicker' in window;

// IndexedDB 한 칸짜리 키-값 저장소 (파일 핸들은 localStorage에 못 넣는다)
function withStore(mode, fn) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB_NAME, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(STORE);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction(STORE, mode);
      const request = fn(tx.objectStore(STORE));
      tx.oncomplete = () => {
        db.close();
        resolve(request?.result);
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    };
  });
}

const loadHandle = () => withStore('readonly', (s) => s.get(HANDLE_KEY));
const saveHandle = (handle) => withStore('readwrite', (s) => s.put(handle, HANDLE_KEY));
const deleteHandle = () => withStore('readwrite', (s) => s.delete(HANDLE_KEY));

/**
 * @param {object} opts
 * @param {() => object} opts.getData 저장할 내용(모든 프로젝트 백업)
 * @param {(state: AutosaveState) => void} opts.onChange 상태가 바뀔 때마다 (화면 표시용)
 *
 * @typedef {{ status: 'unsupported' | 'off' | 'on' | 'paused' | 'error', fileName: string | null, lastSaved: Date | null, error: string | null }} AutosaveState
 *   paused: 파일은 정해져 있지만 브라우저가 다시 허락을 받으라고 함 (새로 열었을 때 등). 사용자가 눌러야 다시 켤 수 있다
 */
export function createAutosave({ getData, onChange }) {
  let handle = null;
  let timer = null;
  const state = { status: autosaveSupported ? 'off' : 'unsupported', fileName: null, lastSaved: null, error: null };

  const set = (changes) => {
    Object.assign(state, changes);
    onChange({ ...state });
  };

  async function write() {
    if (!handle || state.status !== 'on') return;
    try {
      const writable = await handle.createWritable();
      await writable.write(JSON.stringify(getData(), null, 2));
      await writable.close();
      set({ lastSaved: new Date(), error: null });
    } catch (err) {
      // 파일이 옮겨졌거나 지워졌거나 권한이 풀린 경우
      set({ status: 'error', error: err.message });
    }
  }

  return {
    get state() {
      return { ...state };
    },

    // 앱을 열 때: 전에 고른 파일이 있으면 권한을 확인한다. 묻지 않고 바로 쓸 수 있으면 켜고 한 번 저장
    async init() {
      if (!autosaveSupported) return;
      try {
        handle = (await loadHandle()) ?? null;
      } catch {
        handle = null;
      }
      if (!handle) return set({ status: 'off' });
      const permission = await handle.queryPermission({ mode: 'readwrite' });
      set({ status: permission === 'granted' ? 'on' : 'paused', fileName: handle.name });
      if (permission === 'granted') write();
    },

    // 파일 고르기 (사용자가 버튼을 눌렀을 때만 부를 수 있다). 고르기를 취소하면 false
    async choose(suggestedName) {
      try {
        handle = await window.showSaveFilePicker({
          suggestedName,
          types: [{ description: 'JSON backup', accept: { 'application/json': ['.json'] } }],
        });
      } catch (err) {
        if (err.name === 'AbortError') return false;
        throw err;
      }
      await saveHandle(handle);
      set({ status: 'on', fileName: handle.name, error: null });
      await write();
      return true;
    },

    // 멈춘(paused·error) 자동 저장을 다시 켠다 (사용자 클릭 안에서). 허락하면 true
    async resume() {
      if (!handle) return false;
      const permission = await handle.requestPermission({ mode: 'readwrite' });
      if (permission !== 'granted') return false;
      set({ status: 'on', error: null });
      await write();
      return state.status === 'on';
    },

    async stop() {
      clearTimeout(timer);
      handle = null;
      await deleteHandle().catch(() => {});
      set({ status: 'off', fileName: null, lastSaved: null, error: null });
    },

    // 데이터가 바뀔 때마다 부른다. 1초 동안 더 바뀌지 않으면 저장 (끄는 동안 연달아 바뀌는 것을 묶는다)
    schedule() {
      if (state.status !== 'on') return;
      clearTimeout(timer);
      timer = setTimeout(write, DEBOUNCE_MS);
    },
  };
}
