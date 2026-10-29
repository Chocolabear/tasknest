import { supabase } from './supabase';
import { validateTask } from './domain';
import type { Project, Task, Link, Snapshot, TaskInput, TaskPatch } from './types';

export const LOCAL_KEY = 'tasknest.local.v1';
const empty = (): Snapshot => ({ projects: [], tasks: [], links: [] });

function readLocal(): Snapshot {
  const raw = localStorage.getItem(LOCAL_KEY);
  if (!raw) return empty();
  try {
    const data = JSON.parse(raw);
    if (!Array.isArray(data.projects) || !Array.isArray(data.tasks) || !Array.isArray(data.links)) throw new Error();
    return data;
  } catch { throw new Error('로컬 저장 데이터를 읽을 수 없어. 브라우저 저장소를 확인해줘.'); }
}

function writeLocal(data: Snapshot) {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(data)); }
  catch { throw new Error('브라우저 저장 공간이 부족하거나 저장이 차단됐어.'); }
}

function check(error: { message: string } | null) { if (error) throw new Error(error.message); }

export async function loadSnapshot(): Promise<Snapshot> {
  if (!supabase) return readLocal();
  const results = await Promise.all([
    supabase.from('projects').select('*').order('created_at'),
    supabase.from('tasks').select('*').order('created_at'),
    supabase.from('task_links').select('*'),
  ]);
  for (const result of results) check(result.error);
  return { projects: results[0].data as Project[], tasks: results[1].data as Task[], links: results[2].data as Link[] };
}

export async function addProject(name: string, color: string, ownerId: string) {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 80) throw new Error('프로젝트 이름은 1~80자로 입력해줘.');
  const project: Project = { id: crypto.randomUUID(), owner_id: ownerId, name: trimmed, color, created_at: new Date().toISOString() };
  if (supabase) check((await supabase.from('projects').insert(project)).error);
  else { const data = readLocal(); data.projects.push(project); writeLocal(data); }
  return project;
}

export async function renameProject(id: string, name: string) {
  name = name.trim();
  if (!name || name.length > 80) throw new Error('프로젝트 이름은 1~80자로 입력해줘.');
  if (supabase) check((await supabase.from('projects').update({ name }).eq('id', id).select('id').single()).error);
  else { const data = readLocal(); data.projects = data.projects.map(p => p.id === id ? { ...p, name } : p); writeLocal(data); }
}

export async function removeProject(id: string) {
  if (supabase) check((await supabase.from('projects').delete().eq('id', id).select('id').single()).error);
  else {
    const data = readLocal();
    writeLocal({ projects: data.projects.filter(p => p.id !== id), tasks: data.tasks.filter(t => t.project_id !== id), links: data.links.filter(l => l.project_id !== id) });
  }
}

export async function addTask(projectId: string, input: TaskInput, count: number) {
  const task: Task = {
    ...validateTask(input), id: crypto.randomUUID(), project_id: projectId,
    completed_at: null, position_x: 80 + count % 3 * 300, position_y: 80 + Math.floor(count / 3) * 170,
    created_at: new Date().toISOString(),
  };
  if (supabase) check((await supabase.from('tasks').insert(task)).error);
  else { const data = readLocal(); data.tasks.push(task); writeLocal(data); }
}

export async function updateTask(id: string, patch: TaskPatch) {
  if (supabase) check((await supabase.from('tasks').update(patch).eq('id', id).select('id').single()).error);
  else { const data = readLocal(); data.tasks = data.tasks.map(t => t.id === id ? { ...t, ...patch } : t); writeLocal(data); }
}

export async function removeTask(id: string) {
  if (supabase) check((await supabase.from('tasks').delete().eq('id', id).select('id').single()).error);
  else {
    const data = readLocal(); data.tasks = data.tasks.filter(t => t.id !== id);
    data.links = data.links.filter(l => l.source_id !== id && l.target_id !== id); writeLocal(data);
  }
}

export async function addLink(projectId: string, sourceId: string, targetId: string) {
  if (sourceId === targetId) throw new Error('다른 할 일을 연결해줘.');
  const link: Link = { id: crypto.randomUUID(), project_id: projectId, source_id: sourceId, target_id: targetId };
  if (supabase) check((await supabase.from('task_links').insert(link)).error);
  else {
    const data = readLocal();
    if (![sourceId, targetId].every(id => data.tasks.some(t => t.id === id && t.project_id === projectId))) throw new Error('같은 프로젝트의 할 일만 연결할 수 있어.');
    if (data.links.some(l => l.source_id === sourceId && l.target_id === targetId)) return;
    data.links.push(link); writeLocal(data);
  }
}

export async function removeLink(id: string) {
  if (supabase) check((await supabase.from('task_links').delete().eq('id', id).select('id').single()).error);
  else { const data = readLocal(); data.links = data.links.filter(l => l.id !== id); writeLocal(data); }
}
