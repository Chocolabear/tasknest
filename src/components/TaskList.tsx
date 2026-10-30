import { useState } from 'react';
import { CalendarDays, Check, Pencil, Trash2 } from 'lucide-react';
import { formatDue, isOverdue } from '../domain';
import {
  dateLabel,
  groupByDeadline,
  sortByDeadline,
} from '../taskDates';
import type { Task } from '../types';
import '../dateGroups.css';

interface Props {
  projectNames?: Record<string, string>;
  tasks: Task[];
  busy: boolean;
  filter: 'all' | 'open' | 'done';
  onToggle: (task: Task) => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
}

export function TaskList({
  tasks,
  busy,
  filter,
  onToggle,
  onEdit,
  onDelete,
  projectNames = {},
}: Props) {
  const [grouped, setGrouped] = useState(true);

  const groups = grouped
    ? groupByDeadline(tasks)
    : [
        {
          key: 'all',
          date: null,
          tasks: sortByDeadline(tasks),
        },
      ];

  function row(task: Task) {
    return (
      <article
        key={task.id}
        className={`task-row ${
          task.completed_at ? 'is-done' : ''
        }`}
      >
        <button
          className={`check-button ${
            task.completed_at ? 'checked' : ''
          }`}
          disabled={busy}
          aria-label={`${task.title} 완료 ${
            task.completed_at ? '해제' : '체크'
          }`}
          aria-pressed={Boolean(task.completed_at)}
          onClick={() => onToggle(task)}
        >
          {task.completed_at && <Check size={15} />}
        </button>

        <button
          className="task-text"
          disabled={busy}
          onClick={() => onEdit(task)}
        >
          <strong>{task.title}</strong>

          {projectNames[task.project_id] && (
            <span className="task-project-label">
              {projectNames[task.project_id]}
            </span>
          )}

          {task.description && <span>{task.description}</span>}

          <small
            className={`due ${
              isOverdue(task) ? 'overdue' : ''
            }`}
          >
            <CalendarDays size={13} />
            {formatDue(task)}
            {isOverdue(task) && ' · 지연'}
          </small>
        </button>

        <div className="row-actions">
          <button
            className="icon-button"
            aria-label={`${task.title} 수정`}
            disabled={busy}
            onClick={() => onEdit(task)}
          >
            <Pencil size={16} />
          </button>

          <button
            className="icon-button danger"
            aria-label={`${task.title} 삭제`}
            disabled={busy}
            onClick={() => onDelete(task)}
          >
            <Trash2 size={16} />
          </button>
        </div>
      </article>
    );
  }

  return (
    <>
      <div className="date-list-options">
        <label>
          <input
            type="checkbox"
            checked={grouped}
            onChange={e => setGrouped(e.target.checked)}
          />
          날짜별 묶기
        </label>
        <span>마감 빠른 순 · 마감 미정은 마지막</span>
      </div>

      <div className="task-list date-task-list">
        {groups.map(group => (
          <section
            className="date-list-group"
            key={group.key}
            aria-label={
              grouped ? dateLabel(group.date) : '모든 할 일'
            }
          >
            {grouped && (
              <h3 className="date-list-heading">
                <CalendarDays size={15} />
                <span>{dateLabel(group.date)}</span>
                <small>{group.tasks.length}개</small>
              </h3>
            )}

            {group.tasks.map(row)}
          </section>
        ))}

        {!tasks.length && (
          <div className="list-empty">
            <span>아직 여기는 비어 있어.</span>
            <p>
              {filter === 'all'
                ? '작은 할 일 하나부터 추가해봐.'
                : '다른 필터를 선택하거나 할 일을 추가해봐.'}
            </p>
          </div>
        )}
      </div>
    </>
  );
}