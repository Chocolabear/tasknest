import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Project, Task } from '../types';
import { TaskList } from './TaskList';
import { GoogleCalendarSync } from './GoogleCalendarSync';
import { sortByDeadline } from '../taskDates';
import { monthDays, todayInSeoul } from '../calendar';
import '../calendar.css';

export function TaskCalendar({ tasks, projects, busy, displayMode = 'titles', onToggle, onEdit, onDelete }: {
  displayMode?: 'titles' | 'dots'; tasks: Task[]; projects: Project[]; busy: boolean;
  onToggle: (task: Task) => void; onEdit: (task: Task) => void; onDelete: (task: Task) => void;
}) {
  const [syncing, setSyncing] = useState(false);
  const today = todayInSeoul();
  const [month, setMonth] = useState(() => today.slice(0, 7));
  const [selected, setSelected] = useState<string | null>(today);
  const [year, m] = month.split('-').map(Number);
  const days = monthDays(year, m - 1);
  const names = Object.fromEntries(projects.map(p => [p.id, p.name]));
  const byDate = new Map<string, Task[]>();
  for (const task of sortByDeadline(tasks)) if (task.due_date) {
    const items = byDate.get(task.due_date) ?? [];
    items.push(task); byDate.set(task.due_date, items);
  }
  function changeMonth(amount: number) {
    const next = new Date(Date.UTC(year, m - 1 + amount, 1)).toISOString().slice(0, 7);
    setMonth(next); setSelected(`${next}-01`);
  }
  const selectedTasks = tasks.filter(t => t.due_date === selected);
  return <section className="calendar-view" aria-label="마감일 캘린더">
    <GoogleCalendarSync busy={busy} onBusyChange={setSyncing} onSynced={() => window.dispatchEvent(new Event('focus'))} />
    <div className="calendar-toolbar">
      <h2>{year}년 {m}월</h2>
      <div><button className="button secondary small" onClick={() => { setMonth(today.slice(0, 7)); setSelected(today); }}>오늘</button>
        <button className="icon-button" aria-label="이전 달" onClick={() => changeMonth(-1)}><ChevronLeft size={18} /></button>
        <button className="icon-button" aria-label="다음 달" onClick={() => changeMonth(1)}><ChevronRight size={18} /></button>
      </div>
    </div>
    <div className="calendar-weekdays" aria-hidden="true">{['일','월','화','수','목','금','토'].map(d => <span key={d}>{d}</span>)}</div>
    <div className="calendar-grid">
      {days.map(day => {
        const items = byDate.get(day.key) ?? [];
        return <button key={day.key} aria-label={`${day.key}, 할 일 ${items.length}개`} aria-pressed={selected === day.key}
          className={`calendar-day ${day.inMonth ? '' : 'outside'} ${selected === day.key ? 'selected' : ''} ${day.key === today ? 'today' : ''}`}
          onClick={() => { setSelected(day.key); if (!day.inMonth) setMonth(day.key.slice(0, 7)); }}>
          <span className="day-number">{day.day}</span>
          {items.length > 0 && (displayMode === 'titles' ? <span className="calendar-events">{items.slice(0, 3).map(t => <span key={t.id} className={`calendar-event ${t.completed_at ? 'done' : ''}`} style={{ borderLeftColor: projects.find(p => p.id === t.project_id)?.color ?? '#bbb' }} title={`${names[t.project_id]} · ${t.due_time?.slice(0,5) ?? ''} ${t.title}`}>
            {t.due_time && <small>{t.due_time.slice(0,5)} </small>}{t.title}
          </span>)}{items.length > 3 && <span className="calendar-more">+{items.length - 3}개 더 보기</span>}</span> : <><span className="calendar-count">{items.length}개</span><span className="calendar-dots">{items.slice(0,4).map(t => <i key={t.id} style={{ background: projects.find(p => p.id === t.project_id)?.color ?? '#bbb' }} />)}</span></>)}
        </button>;
      })}
    </div>
    <div className="calendar-selection"><h3>{selected ?? '마감 미정'} · {selectedTasks.length}개</h3><button className="button secondary small" onClick={() => setSelected(null)}>마감 미정 {tasks.filter(t => !t.due_date).length}개</button></div>
    <TaskList key={selected ?? 'undated'} tasks={selectedTasks} projectNames={names} busy={busy || syncing} filter="all" onToggle={onToggle} onEdit={onEdit} onDelete={onDelete} />
  </section>;
}
