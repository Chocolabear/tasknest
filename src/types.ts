export interface Project {
  id: string;
  owner_id: string;
  name: string;
  color: string;
  created_at: string;
}

export interface Task {
  id: string;
  project_id: string;
  title: string;
  description: string;
  due_date: string | null;
  due_time: string | null;
  completed_at: string | null;
  position_x: number;
  position_y: number;
  created_at: string;
}

export interface Link {
  id: string;
  project_id: string;
  source_id: string;
  target_id: string;
}

export interface Snapshot { projects: Project[]; tasks: Task[]; links: Link[] }
export type TaskInput = Pick<Task, 'title' | 'description' | 'due_date' | 'due_time'>;
export type TaskPatch = Partial<TaskInput & Pick<Task, 'completed_at' | 'position_x' | 'position_y'>>;
