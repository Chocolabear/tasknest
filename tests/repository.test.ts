import { describe, expect, it, vi } from 'vitest';
vi.mock('../src/supabase', () => ({ supabase: null }));
import * as repo from '../src/repository';

describe('로컬 저장소', () => {
  it('프로젝트와 할 일을 저장하고 위치·완료·연결을 복원하며 삭제 시 정리한다', async () => {
    const p = await repo.addProject('개발', '#647a55', 'local');
    const input = { title: '기획', description: '', due_date: '2026-11-01', due_time: null };
    await repo.addTask(p.id, input, 0);
    await repo.addTask(p.id, { ...input, title: '구현' }, 1);
    let data = await repo.loadSnapshot();
    const [a, b] = data.tasks;
    await repo.updateTask(a.id, { completed_at: '2026-10-29T09:00:00Z', position_x: 333 });
    await repo.addLink(p.id, a.id, b.id);
    await repo.addLink(p.id, a.id, b.id);
    data = await repo.loadSnapshot();
    expect(data.tasks[0].position_x).toBe(333);
    expect(data.tasks[0].completed_at).toBeTruthy();
    expect(data.links).toHaveLength(1);
    await repo.removeTask(a.id);
    expect((await repo.loadSnapshot()).links).toHaveLength(0);
    await repo.removeProject(p.id);
    expect(await repo.loadSnapshot()).toEqual({ projects: [], tasks: [], links: [] });
  });
  it('다른 프로젝트 간 연결을 거부한다', async () => {
    const p1 = await repo.addProject('1', '#647a55', 'local');
    const p2 = await repo.addProject('2', '#647a55', 'local');
    const input = { title: '할 일', description: '', due_date: null, due_time: null };
    await repo.addTask(p1.id, input, 0); await repo.addTask(p2.id, input, 0);
    const { tasks } = await repo.loadSnapshot();
    await expect(repo.addLink(p1.id, tasks[0].id, tasks[1].id)).rejects.toThrow();
  });
});
