// 실행 취소/다시 실행 이력 (DOM 없는 순수 모듈). 태스크 수가 적어 상태를 통째로 저장해도 가볍다.
export function createHistory(limit = 100) {
  let past = [];
  let future = [];

  return {
    // 바뀌기 '전' 상태와 무엇을 했는지(label)를 기록한다. 새 변경이 생기면 다시 실행할 것은 사라진다.
    record(state, label) {
      past.push({ state, label });
      if (past.length > limit) past.shift();
      future = [];
    },
    // 되돌릴 상태와 label. 지금 상태(current)는 다시 실행용으로 보관한다. 없으면 null
    undo(current) {
      const entry = past.pop();
      if (!entry) return null;
      future.push({ state: current, label: entry.label });
      return entry;
    },
    // 다시 적용할 상태와 label. 없으면 null
    redo(current) {
      const entry = future.pop();
      if (!entry) return null;
      past.push({ state: current, label: entry.label });
      return entry;
    },
    get canUndo() {
      return past.length > 0;
    },
    get canRedo() {
      return future.length > 0;
    },
    // 버튼 툴팁용: 다음에 되돌릴/다시 실행할 것의 label
    get undoLabel() {
      return past.at(-1)?.label ?? null;
    },
    get redoLabel() {
      return future.at(-1)?.label ?? null;
    },
  };
}
