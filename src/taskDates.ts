import type { Task } from './types';

export interface DateGroup {
  key: string;
  date: string | null;
  tasks: Task[];
}

export function sortByDeadline(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    const dateOrder = (
      a.due_date ?? '9999-99-99'
    ).localeCompare(b.due_date ?? '9999-99-99');

    if (dateOrder) return dateOrder;

    const timeOrder = (
      a.due_time?.slice(0, 5) ?? '24:00'
    ).localeCompare(b.due_time?.slice(0, 5) ?? '24:00');

    return (
      timeOrder ||
      a.created_at.localeCompare(b.created_at) ||
      a.id.localeCompare(b.id)
    );
  });
}

export function groupByDeadline(tasks: Task[]): DateGroup[] {
  const groups = new Map<string, DateGroup>();

  for (const task of sortByDeadline(tasks)) {
    const key = task.due_date ?? 'undated';

    if (!groups.has(key)) {
      groups.set(key, {
        key,
        date: task.due_date,
        tasks: [],
      });
    }

    groups.get(key)!.tasks.push(task);
  }

  return [...groups.values()];
}

export function dateLabel(
  date: string | null,
  now = new Date(),
): string {
  if (!date) return '마감 미정';

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);

  const part = (type: string) =>
    parts.find(p => p.type === type)!.value;

  const today = `${part('year')}-${part('month')}-${part('day')}`;

  const delta = Math.round(
    (Date.parse(`${date}T00:00:00Z`) -
      Date.parse(`${today}T00:00:00Z`)) /
      86400000,
  );

  const relative =
    delta === 0
      ? '오늘'
      : delta === 1
        ? '내일'
        : delta < 0
          ? `${-delta}일 지남`
          : `D-${delta}`;

  const weekday = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    weekday: 'short',
  }).format(new Date(`${date}T12:00:00+09:00`));

  return `${date.replaceAll('-', '.')} (${weekday}) · ${relative}`;
}

export function layoutDateGroups(
  tasks: Task[],
  columns = 2,
) {
  columns = Math.max(1, Math.floor(columns));

  let y = 20;

  return groupByDeadline(tasks).map(group => {
    const width =
      48 + columns * 245 + (columns - 1) * 24;

    const height =
      64 +
      Math.ceil(group.tasks.length / columns) * 152 +
      8;

    const layout = {
      ...group,
      x: 20,
      y,
      width,
      height,
      children: group.tasks.map((task, i) => ({
        task,
        x: 24 + (i % columns) * 269,
        y: 64 + Math.floor(i / columns) * 152,
      })),
    };

    y += height + 32;

    return layout;
  });
}