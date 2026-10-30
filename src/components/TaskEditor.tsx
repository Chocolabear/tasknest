import { useState, type FormEvent } from 'react';
import { ChevronDown } from 'lucide-react';

import './taskEditor.css';
import { Modal } from './Modal';

import type { Task, TaskInput, Project } from '../types';

interface Props {
  task: Task | null;
  busy: boolean;
  onSave: (
    input: TaskInput,
    projectId: string,
  ) => Promise<void>;
  onClose: () => void;
  error?: string;
  projects?: Project[];
  projectId?: string;
}

export function TaskEditor({
  task,
  busy,
  onSave,
  onClose,
  error,
  projects = [],
  projectId,
}: Props) {
  const [targetProject, setTargetProject] = useState(
    task?.project_id ?? projectId ?? projects[0]?.id ?? '',
  );

  const [title, setTitle] = useState(task?.title ?? '');
  const [description, setDescription] = useState(
    task?.description ?? '',
  );
  const [date, setDate] = useState(task?.due_date ?? '');
  const [time, setTime] = useState(
    task?.due_time?.slice(0, 5) ?? '',
  );

  async function submit(event: FormEvent) {
    event.preventDefault();

    await onSave(
      {
        title,
        description,
        due_date: date || null,
        due_time: time || null,
      },
      targetProject,
    );
  }

  return (
    <Modal
      title={task ? '할 일 수정' : '새로운 할 일'}
      error={error}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form onSubmit={submit}>
        <fieldset disabled={busy}>
          {projects.length > 0 && (
            <label>
              프로젝트

              <div className="project-select-wrap">
                <select
                  required
                  value={targetProject}
                  onChange={event =>
                    setTargetProject(event.target.value)
                  }
                >
                  {projects.map(project => (
                    <option
                      key={project.id}
                      value={project.id}
                    >
                      {project.name}
                    </option>
                  ))}
                </select>

                <ChevronDown
                  size={18}
                  aria-hidden="true"
                />
              </div>
            </label>
          )}

          {task && task.project_id !== targetProject && (
            <p className="helper" role="status">
              프로젝트를 옮겨도 기존 연결선과 완료 상태,
              메모는 유지돼.
            </p>
          )}

          <label>
            할 일 제목

            <input
              autoFocus
              required
              maxLength={160}
              value={title}
              onChange={event =>
                setTitle(event.target.value)
              }
              placeholder="어떤 일을 해볼까?"
            />
          </label>

          <label>
            메모

            <textarea
              rows={4}
              maxLength={5000}
              value={description}
              onChange={event =>
                setDescription(event.target.value)
              }
              placeholder="필요한 내용이나 아이디어를 적어줘."
            />
          </label>

          <div className="form-row">
            <label>
              마감 날짜

              <input
                type="date"
                value={date}
                onChange={event => {
                  setDate(event.target.value);

                  if (!event.target.value) {
                    setTime('');
                  }
                }}
              />
            </label>

            <label>
              마감 시간

              <input
                type="time"
                disabled={!date || busy}
                value={time}
                onChange={event =>
                  setTime(event.target.value)
                }
              />
            </label>
          </div>

          <p className="helper">
            마감은 한국 시간 기준이야.
            날짜만 정하면 그날까지로 처리해.
          </p>

          <footer className="modal-footer">
            <button
              type="button"
              className="button secondary"
              onClick={onClose}
            >
              취소
            </button>

            <button
              className="button primary"
              type="submit"
            >
              {busy ? '저장 중…' : '저장하기'}
            </button>
          </footer>
        </fieldset>
      </form>
    </Modal>
  );
}