import type { Task, TaskInput } from './types';

export function progress(tasks: Pick<Task, 'completed_at'>[]) {
  const completed = tasks.filter(t => t.completed_at !== null).length;
  return { completed, total: tasks.length, percent: tasks.length ? Math.round(completed / tasks.length * 100) : 0 };
}

export function validateTask(input: TaskInput): TaskInput {
  const title = input.title.trim();
  if (!title || title.length > 160) throw new Error('할 일 제목은 1~160자로 입력해줘.');
  if (input.description.length > 5000) throw new Error('설명은 5,000자까지 입력할 수 있어.');
  if (input.due_time && !input.due_date) throw new Error('마감 시간을 정하려면 날짜도 선택해줘.');
  return { ...input, title, due_date: input.due_date || null, due_time: input.due_time || null };
}

// 날짜만 지정한 일은 그 날짜가 끝난 뒤에 지연 처리한다.
// 마감은 한국 시간(Asia/Seoul) 기준으로 해석하여 기기 시간대가 달라도 동일하게 표시한다.
export function isOverdue(task: Pick<Task, 'due_date' | 'due_time' | 'completed_at'>, now = new Date()) {
  if (task.completed_at || !task.due_date) return false;
  const time = task.due_time ? task.due_time.slice(0, 5) + ':00' : '23:59:59.999';
  return now.getTime() > new Date(`${task.due_date}T${time}+09:00`).getTime();
}

export function formatDue(task: Pick<Task, 'due_date' | 'due_time'>) {
  if (!task.due_date) return '마감 미정';
  const [, month, day] = task.due_date.split('-');
  return `${task.due_date.slice(0, 4)}.${month}.${day}${task.due_time ? ` · ${task.due_time.slice(0, 5)}` : ''}`;
}
