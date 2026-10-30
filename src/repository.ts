import { supabase } from './supabase';
import { validateTask } from './domain';

import type {
  Project,
  Task,
  Link,
  Snapshot,
  TaskInput,
  TaskPatch,
} from './types';

export const LOCAL_KEY = 'tasknest.local.v1';

const empty = (): Snapshot => ({
  projects: [],
  tasks: [],
  links: [],
});

function readLocal(): Snapshot {
  const raw = localStorage.getItem(LOCAL_KEY);

  if (!raw) return empty();

  try {
    const data = JSON.parse(raw);

    if (
      !Array.isArray(data.projects) ||
      !Array.isArray(data.tasks) ||
      !Array.isArray(data.links)
    ) {
      throw new Error();
    }

    return data;
  } catch {
    throw new Error(
      '로컬 저장 데이터를 읽을 수 없어. 브라우저 저장소를 확인해줘.',
    );
  }
}

function writeLocal(data: Snapshot) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(data));
  } catch {
    throw new Error(
      '브라우저 저장 공간이 부족하거나 저장이 차단됐어.',
    );
  }
}

function check(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

export async function loadSnapshot(): Promise<Snapshot> {
  if (!supabase) return readLocal();

  const results = await Promise.all([
    supabase.from('projects').select('*').order('created_at'),
    supabase.from('tasks').select('*').order('created_at'),
    supabase.from('task_links').select('*'),
  ]);

  for (const result of results) {
    check(result.error);
  }

  return {
    projects: results[0].data as Project[],
    tasks: results[1].data as Task[],
    links: results[2].data as Link[],
  };
}

export async function addProject(
  name: string,
  color: string,
  ownerId: string,
) {
  const trimmed = name.trim();

  if (!trimmed || trimmed.length > 80) {
    throw new Error('프로젝트 이름은 1~80자로 입력해줘.');
  }

  const project: Project = {
    id: crypto.randomUUID(),
    owner_id: ownerId,
    name: trimmed,
    color,
    created_at: new Date().toISOString(),
  };

  if (supabase) {
    check(
      (await supabase.from('projects').insert(project)).error,
    );
  } else {
    const data = readLocal();
    data.projects.push(project);
    writeLocal(data);
  }

  return project;
}

export async function renameProject(id: string, name: string) {
  name = name.trim();

  if (!name || name.length > 80) {
    throw new Error('프로젝트 이름은 1~80자로 입력해줘.');
  }

  if (supabase) {
    check(
      (
        await supabase
          .from('projects')
          .update({ name })
          .eq('id', id)
          .select('id')
          .single()
      ).error,
    );
  } else {
    const data = readLocal();

    data.projects = data.projects.map(project =>
      project.id === id ? { ...project, name } : project,
    );

    writeLocal(data);
  }
}

export async function removeProject(id: string) {
  if (supabase) {
    check(
      (
        await supabase
          .from('projects')
          .delete()
          .eq('id', id)
          .select('id')
          .single()
      ).error,
    );
  } else {
    const data = readLocal();

    const deletedTaskIds = new Set(
      data.tasks
        .filter(task => task.project_id === id)
        .map(task => task.id),
    );

    writeLocal({
      projects: data.projects.filter(
        project => project.id !== id,
      ),
      tasks: data.tasks.filter(
        task => task.project_id !== id,
      ),
      links: data.links.filter(
        link =>
          !deletedTaskIds.has(link.source_id) &&
          !deletedTaskIds.has(link.target_id),
      ),
    });
  }
}

export async function addTask(
  projectId: string,
  input: TaskInput,
  count: number,
) {
  const task: Task = {
    ...validateTask(input),
    id: crypto.randomUUID(),
    project_id: projectId,
    completed_at: null,
    position_x: 80 + (count % 3) * 300,
    position_y: 80 + Math.floor(count / 3) * 170,
    created_at: new Date().toISOString(),
  };

  if (supabase) {
    check((await supabase.from('tasks').insert(task)).error);
  } else {
    const data = readLocal();
    data.tasks.push(task);
    writeLocal(data);
  }
}

export async function updateTask(id: string, patch: TaskPatch) {
  if (supabase) {
    check(
      (
        await supabase
          .from('tasks')
          .update(patch)
          .eq('id', id)
          .select('id')
          .single()
      ).error,
    );
  } else {
    const data = readLocal();

    data.tasks = data.tasks.map(task =>
      task.id === id ? { ...task, ...patch } : task,
    );

    writeLocal(data);
  }
}

export async function saveTask(
  id: string,
  input: TaskInput,
  projectId: string,
) {
  const valid = validateTask(input);

  if (supabase) {
    check(
      (
        await supabase.rpc('save_task', {
          p_task_id: id,
          p_project_id: projectId,
          p_title: valid.title,
          p_description: valid.description,
          p_due_date: valid.due_date,
          p_due_time: valid.due_time,
        })
      ).error,
    );

    return;
  }

  const data = readLocal();
  const task = data.tasks.find(item => item.id === id);

  if (
    !task ||
    !data.projects.some(project => project.id === projectId)
  ) {
    throw new Error('할 일 또는 프로젝트를 찾을 수 없어.');
  }

  if (task.project_id !== projectId) {
    data.links = data.links.map(link =>
      link.source_id === id
        ? { ...link, project_id: projectId }
        : link,
    );
  }

  Object.assign(task, valid, {
    project_id: projectId,
  });

  writeLocal(data);
}

export async function removeTask(id: string) {
  if (supabase) {
    check(
      (
        await supabase
          .from('tasks')
          .delete()
          .eq('id', id)
          .select('id')
          .single()
      ).error,
    );
  } else {
    const data = readLocal();

    data.tasks = data.tasks.filter(task => task.id !== id);

    data.links = data.links.filter(
      link => link.source_id !== id && link.target_id !== id,
    );

    writeLocal(data);
  }
}

export async function addLink(
  projectId: string,
  sourceId: string,
  targetId: string,
  sourceHandle: 'left' | 'right' = 'right',
  targetHandle: 'left' | 'right' = 'left',
) {
  if (sourceId === targetId) {
    throw new Error('다른 할 일을 연결해줘.');
  }

  const link: Link = {
    id: crypto.randomUUID(),
    project_id: projectId,
    source_id: sourceId,
    target_id: targetId,
    source_handle: sourceHandle,
    target_handle: targetHandle,
  };

  if (supabase) {
    check(
      (
        await supabase.from('task_links').upsert(link, {
          onConflict: 'source_id,target_id',
          ignoreDuplicates: false,
        })
      ).error,
    );
  } else {
    const data = readLocal();

    const tasksExist = [sourceId, targetId].every(id =>
      data.tasks.some(task => task.id === id),
    );

    if (!tasksExist) {
      throw new Error('연결할 할 일을 찾을 수 없어.');
    }

    const existing = data.links.find(
      item =>
        item.source_id === sourceId &&
        item.target_id === targetId,
    );

    if (existing) {
      existing.project_id = projectId;
      existing.source_handle = sourceHandle;
      existing.target_handle = targetHandle;
    } else {
      data.links.push(link);
    }

    writeLocal(data);
  }
}

export async function removeLink(id: string) {
  if (supabase) {
    check(
      (
        await supabase
          .from('task_links')
          .delete()
          .eq('id', id)
          .select('id')
          .single()
      ).error,
    );
  } else {
    const data = readLocal();
    data.links = data.links.filter(link => link.id !== id);
    writeLocal(data);
  }
}