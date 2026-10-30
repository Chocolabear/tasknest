export interface TaskRow {
  id: string;
  project_id: string;
  title: string;
  description: string;
  due_date: string | null;
  due_time: string | null;
  completed_at: string | null;
  updated_at?: string;
}
export interface GoogleEvent {
  id: string;
  etag?: string;
  status?: string;
  summary?: string;
  description?: string;
  start?: { date?: string; dateTime?: string; timeZone?: string };
  end?: { date?: string; dateTime?: string; timeZone?: string };
  recurrence?: string[];
  recurringEventId?: string;
  eventType?: string;
}
export interface Mapping {
  task_id: string;
  event_id: string;
  task_snapshot: string | null;
  event_snapshot: string | null;
}
export interface SyncStore {
  tasks(): Promise<TaskRow[]>;
  mappings(): Promise<Mapping[]>;
  saveMapping(mapping: Mapping): Promise<void>;
  removeMapping(taskId: string): Promise<void>;
  updateTask(old: TaskRow, patch: Partial<TaskRow>): Promise<TaskRow>;
  deleteTask(old: TaskRow): Promise<void>;
  importTask(eventId: string, patch: Partial<TaskRow>): Promise<TaskRow>;
}
export interface CalendarAPI {
  events(): Promise<GoogleEvent[]>;
  get(id: string): Promise<GoogleEvent | null>;
  create(id: string, task: TaskRow): Promise<GoogleEvent>;
  update(event: GoogleEvent, task: TaskRow): Promise<GoogleEvent>;
  remove(event: GoogleEvent): Promise<void>;
}

const DONE = '[완료] ';
export const taskSnapshot = (task: TaskRow): string => JSON.stringify({
  project: task.project_id,
  title: task.title,
  description: task.description,
  date: task.due_date,
  time: task.due_time?.slice(0, 5) ?? null,
  done: Boolean(task.completed_at),
});

export function eventFields(event: GoogleEvent) {
  let date = event.start?.date ?? null;
  let time: string | null = null;
  if (event.start?.dateTime) {
    const value = new Date(event.start.dateTime);
    if (Number.isNaN(value.getTime())) throw new Error('구글 일정의 날짜가 올바르지 않아.');
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(value);
    const get = (key: string) => parts.find(part => part.type === key)!.value;
    date = `${get('year')}-${get('month')}-${get('day')}`;
    time = `${get('hour')}:${get('minute')}`;
  }
  if (!date) throw new Error('시작 날짜가 없는 구글 일정이 있어.');
  const summary = event.summary ?? '';
  const done = summary.startsWith(DONE);
  return {
    title: (done ? summary.slice(DONE.length) : summary).trim().slice(0, 160) || '제목 없는 일정',
    description: (event.description ?? '').slice(0, 5000),
    due_date: date,
    due_time: time,
    done,
  };
}
export const eventSnapshot = (event: GoogleEvent) => JSON.stringify(eventFields(event));
const supported = (event: GoogleEvent) => !event.recurrence?.length && !event.recurringEventId
  && (!event.eventType || event.eventType === 'default');
const active = (event: GoogleEvent | null | undefined): event is GoogleEvent => Boolean(event && event.status !== 'cancelled');

export function eventBody(task: TaskRow, old?: GoogleEvent) {
  if (!task.due_date) throw new Error('마감 날짜가 없는 할 일이야.');
  const summary = `${task.completed_at ? DONE : ''}${task.title}`;
  if (task.due_time) {
    const start = new Date(`${task.due_date}T${task.due_time.slice(0, 5)}:00+09:00`);
    return {
      summary, description: task.description,
      start: { date: null, dateTime: start.toISOString(), timeZone: 'Asia/Seoul' },
      end: { date: null, dateTime: new Date(start.getTime() + duration(old)).toISOString(), timeZone: 'Asia/Seoul' },
    };
  }
  const nextDay = new Date(`${task.due_date}T00:00:00Z`);
  const days = old?.start?.date && old.end?.date
    ? Math.max(1, Math.round((Date.parse(old.end.date) - Date.parse(old.start.date)) / 86400000)) : 1;
  nextDay.setUTCDate(nextDay.getUTCDate() + days);
  return {
    summary, description: task.description,
    start: { date: task.due_date, dateTime: null, timeZone: null },
    end: { date: nextDay.toISOString().slice(0, 10), dateTime: null, timeZone: null },
  };
}

function duration(old?: GoogleEvent) {
  const ms = old?.start?.dateTime && old.end?.dateTime
    ? Date.parse(old.end.dateTime) - Date.parse(old.start.dateTime) : 30 * 60_000;
  return Number.isFinite(ms) && ms > 0 ? ms : 30 * 60_000;
}

export async function synchronize(store: SyncStore, google: CalendarAPI, budgetMs = 40_000) {
  const until = Date.now() + budgetMs;
  const [tasks, mappings, events] = await Promise.all([store.tasks(), store.mappings(), google.events()]);
  const taskById = new Map(tasks.map(task => [task.id, task]));
  const eventById = new Map(events.map(event => [event.id, event]));
  const mappedTasks = new Set(mappings.map(item => item.task_id));
  const mappedEvents = new Set(mappings.map(item => item.event_id));
  const result = { exported: 0, imported: 0, deleted: 0, conflicts: 0, skipped: 0, more: false };
  const save = async (task: TaskRow, event: GoogleEvent) => store.saveMapping({
    task_id: task.id, event_id: event.id,
    task_snapshot: taskSnapshot(task), event_snapshot: eventSnapshot(event),
  });
  const pull = async (task: TaskRow, event: GoogleEvent) => {
    const fields = eventFields(event);
    const updated = await store.updateTask(task, {
      title: fields.title, description: fields.description,
      due_date: fields.due_date, due_time: fields.due_time,
      completed_at: fields.done ? task.completed_at ?? new Date().toISOString() : null,
    });
    await save(updated, event);
    result.imported++;
  };

  for (const mapping of mappings) {
    if (Date.now() > until) { result.more = true; return result; }
    const task = taskById.get(mapping.task_id);
    const event = eventById.get(mapping.event_id) ?? await google.get(mapping.event_id);
    if (active(event) && !supported(event)) { result.skipped++; continue; }
    if (!task) {
      if (active(event)) await google.remove(event);
      await store.removeMapping(mapping.task_id);
      result.deleted++;
      continue;
    }
    if (!task.due_date) {
      if (active(event)) await google.remove(event);
      await store.removeMapping(mapping.task_id);
      result.deleted++;
      continue;
    }
    if (!active(event)) {
      if (mapping.task_snapshot === null && !event) {
        // 예약해둔 ID로 재시도해 중복 일정을 방지해.
        await save(task, await google.create(mapping.event_id, task));
        result.exported++;
      } else {
        await store.deleteTask(task);
        await store.removeMapping(mapping.task_id);
        result.deleted++;
      }
      continue;
    }
    if (!supported(event)) { result.skipped++; continue; }
    if (mapping.task_snapshot === null) {
      // 이전 실행에서 일정 생성 후 연결 저장에 실패했던 경우 복구
      await save(task, await google.update(event, task));
      result.exported++;
      continue;
    }
    const taskChanged = mapping.task_snapshot !== taskSnapshot(task);
    const eventChanged = mapping.event_snapshot !== eventSnapshot(event);
    if (eventChanged) {
      if (taskChanged) result.conflicts++;
      await pull(task, event);
    } else if (taskChanged) {
      await save(task, await google.update(event, task));
      result.exported++;
    }
  }

  for (const event of events) {
    if (Date.now() > until) { result.more = true; return result; }
    if (mappedEvents.has(event.id) || !active(event)) continue;
    if (!supported(event)) { result.skipped++; continue; }
    const fields = eventFields(event);
    const task = await store.importTask(event.id, {
      title: fields.title, description: fields.description,
      due_date: fields.due_date, due_time: fields.due_time,
      completed_at: fields.done ? new Date().toISOString() : null,
    });
    mappedTasks.add(task.id);
    await save(task, event);
    result.imported++;
  }

  for (const task of tasks) {
    if (Date.now() > until) { result.more = true; return result; }
    if (mappedTasks.has(task.id) || !task.due_date) continue;
    const id = `tn${crypto.randomUUID().replaceAll('-', '')}`;
    await store.saveMapping({task_id: task.id, event_id: id, task_snapshot: null, event_snapshot: null});
    await save(task, await google.create(id, task));
    result.exported++;
  }

  return result;
}
