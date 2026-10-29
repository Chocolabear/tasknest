import { describe, expect, it } from 'vitest';
import { isOverdue, progress, validateTask } from '../src/domain';

describe('완료율', () => {
  it('빈 프로젝트는 0%이고 완료를 취소하면 다시 감소한다', () => {
    expect(progress([]).percent).toBe(0);
    expect(progress([{ completed_at: '2026-01-01' }, { completed_at: null }]).percent).toBe(50);
    expect(progress([{ completed_at: null }, { completed_at: null }]).percent).toBe(0);
  });
});
describe('마감일', () => {
  it('날짜만 지정한 일은 한국 시간 당일 내에는 지연되지 않는다', () => {
    const task = { due_date: '2026-10-29', due_time: null, completed_at: null };
    expect(isOverdue(task, new Date('2026-10-29T23:59:59+09:00'))).toBe(false);
    expect(isOverdue(task, new Date('2026-10-30T00:00:00+09:00'))).toBe(true);
  });
  it('시간 지정은 한국 시간 기준으로 판단하며 완료한 일은 지연되지 않는다', () => {
    const task = { due_date: '2026-10-29', due_time: '18:00:00', completed_at: null };
    expect(isOverdue(task, new Date('2026-10-29T09:01:00Z'))).toBe(true);
    expect(isOverdue({ ...task, completed_at: '2026-10-29' }, new Date('2026-10-30'))).toBe(false);
  });
  it('날짜 없는 시간과 공백 제목을 거부한다', () => {
    expect(() => validateTask({ title: 'test', description: '', due_date: null, due_time: '12:00' })).toThrow();
    expect(() => validateTask({ title: '  ', description: '', due_date: null, due_time: null })).toThrow();
  });
});
