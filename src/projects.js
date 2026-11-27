// 여러 프로젝트 상태(프로젝트 목록과 지금 보는 프로젝트)를 다루는 순수 함수 (DOM·저장소 없음)
export const newProjectId = () => `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const createProject = (name, tasks = [], id = newProjectId()) => ({ id, name, tasks });

/**
 * 시작 상태를 만든다.
 * 저장된 프로젝트 목록이 올바르면 그대로 쓰고, 없거나 깨졌으면 예전 단일 프로젝트 데이터(태스크·이름)로 첫 프로젝트를 만든다.
 * 예전 태스크가 빈 배열([])이면 사용자가 다 지운 것이므로 샘플로 바꾸지 않는다.
 */
export function initState({ stored, legacyTasks, legacyName, fallbackTasks, defaultName }) {
  if (stored && Array.isArray(stored.projects)) {
    const projects = stored.projects
      .filter((p) => p && typeof p.id === 'string' && p.id && Array.isArray(p.tasks))
      .map((p) => ({ id: p.id, name: typeof p.name === 'string' && p.name.trim() ? p.name : defaultName, tasks: p.tasks }));
    if (projects.length) {
      const currentId = projects.some((p) => p.id === stored.currentId) ? stored.currentId : projects[0].id;
      return { projects, currentId };
    }
  }
  const name = typeof legacyName === 'string' && legacyName.trim() ? legacyName : defaultName;
  const project = createProject(name, legacyTasks ?? fallbackTasks);
  return { projects: [project], currentId: project.id };
}

/**
 * id 프로젝트를 지운 상태. 지운 것이 지금 프로젝트면 같은 자리(없으면 바로 위)의 프로젝트로 옮긴다.
 * 마지막 하나를 지우면 빈 프로젝트를 새로 만든다.
 */
export function removeProject({ projects, currentId }, id, defaultName) {
  const index = projects.findIndex((p) => p.id === id);
  if (index === -1) return { projects, currentId };
  const rest = projects.filter((p) => p.id !== id);
  if (!rest.length) {
    const project = createProject(defaultName);
    return { projects: [project], currentId: project.id };
  }
  return { projects: rest, currentId: currentId === id ? rest[Math.min(index, rest.length - 1)].id : currentId };
}
