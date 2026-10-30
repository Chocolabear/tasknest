import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Project, Task } from '../types';
import { TaskList } from './TaskList';
import { monthDays, todayInSeoul } from '../calendar';
import '../calendar.css';

interface Props {
  tasks: Task[];
  projects: Project[];
  busy: boolean;
  onToggle: (task: Task) => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
}

export function TaskCalendar({
  tasks,
  projects,
  busy,
  onToggle,
  onEdit,
  onDelete,
}: Props) {
  const today = todayInSeoul();

  const [month, setMonth] = useState(() =>
    today.slice(0, 7),
  );

  const [selected, setSelected] = useState<string | null>(
    today,
  );

  const [year, m] = month.split('-').map(Number);
  const days = monthDays(year, m - 1);

  const names = Object.fromEntries(
    projects.map(project => [project.id, project.name]),
  );

  const byDate = new Map<string, Task[]>();

  for (const task of tasks) {
    if (!task.due_date) continue;

    const items = byDate.get(task.due_date) ?? [];
    items.push(task);
    byDate.set(task.due_date, items);
  }

  function changeMonth(amount: number) {
    const next = new Date(
      Date.UTC(year, m - 1 + amount, 1),
    )
      .toISOString()
      .slice(0, 7);

    setMonth(next);
    setSelected(`${next}-01`);
  }

  const selectedTasks = tasks.filter(
    task => task.due_date === selected,
  );

  return (
    <section
      className="calendar-view"
      aria-label="마감일 캘린더"
    >
      <div className="calendar-toolbar">
        <h2>
          {year}년 {m}월
        </h2>

        <div>
          <button
            className="button secondary small"
            onClick={() => {
              setMonth(today.slice(0, 7));
              setSelected(today);
            }}
          >
            오늘
          </button>

          <button
            className="icon-button"
            aria-label="이전 달"
            onClick={() => changeMonth(-1)}
          >
            <ChevronLeft size={18} />
          </button>

          <button
            className="icon-button"
            aria-label="다음 달"
            onClick={() => changeMonth(1)}
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      <div className="calendar-weekdays" aria-hidden="true">
        {['일', '월', '화', '수', '목', '금', '토'].map(
          day => <span key={day}>{day}</span>,
        )}
      </div>

      <div className="calendar-grid">
        {days.map(day => {
          const items = byDate.get(day.key) ?? [];

          return (
            <button
              key={day.key}
              aria-label={`${day.key}, 할 일 ${items.length}개`}
              aria-pressed={selected === day.key}
              className={[
                'calendar-day',
                day.inMonth ? '' : 'outside',
                selected === day.key ? 'selected' : '',
                day.key === today ? 'today' : '',
              ].join(' ')}
              onClick={() => {
                setSelected(day.key);

                if (!day.inMonth) {
                  setMonth(day.key.slice(0, 7));
                }
              }}
            >
              <span className="day-number">{day.day}</span>

              {items.length > 0 && (
                <>
                  <span className="calendar-count">
                    {items.length}개
                  </span>

                  <span className="calendar-dots">
                    {items.slice(0, 4).map(task => (
                      <i
                        key={task.id}
                        style={{
                          background:
                            projects.find(
                              project =>
                                project.id === task.project_id,
                            )?.color ?? '#bbb',
                          opacity: task.completed_at ? 0.45 : 1,
                        }}
                      />
                    ))}
                  </span>
                </>
              )}
            </button>
          );
        })}
      </div>

      <div className="calendar-selection">
        <h3>
          {selected ?? '마감 미정'} · {selectedTasks.length}개
        </h3>

        <button
          className="button secondary small"
          onClick={() => setSelected(null)}
        >
          마감 미정 {tasks.filter(task => !task.due_date).length}개
        </button>
      </div>

      <TaskList
        key={selected ?? 'undated'}
        tasks={selectedTasks}
        projectNames={names}
        busy={busy}
        filter="all"
        onToggle={onToggle}
        onEdit={onEdit}
        onDelete={onDelete}
      />
    </section>
  );
}