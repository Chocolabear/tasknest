import { useEffect, useMemo, useState } from 'react';
import {
  ReactFlow,
  ConnectionMode,
  Background,
  Controls,
  Handle,
  Position,
  useNodesState,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import { Check, Pencil } from 'lucide-react';

import { formatDue } from '../domain';
import { dateLabel, layoutDateGroups } from '../taskDates';
import type { Task, Link } from '../types';

import '../dateGroups.css';

type Side = 'left' | 'right';

type TaskNodeData = {
  projectName?: string;
  task: Task;
  busy: boolean;
  onToggle: (task: Task) => void;
  onEdit: (task: Task) => void;
};

type TaskNodeType = Node<TaskNodeData, 'task'>;

type GroupNodeType = Node<
  {
    date: string | null;
    count: number;
  },
  'dateGroup'
>;

type MapNode = TaskNodeType | GroupNodeType;

type GroupPositions = Record<
  string,
  {
    x: number;
    y: number;
  }
>;

function TaskNode({ data }: NodeProps<TaskNodeType>) {
  return (
    <div
      className={`map-node ${
        data.task.completed_at ? 'is-done' : ''
      }`}
    >
      <Handle
        id="left"
        type="source"
        position={Position.Left}
        aria-label="왼쪽 연결점"
      />

      <div className="map-node-content">
        <button
          className={`check-button nodrag ${
            data.task.completed_at ? 'checked' : ''
          }`}
          disabled={data.busy}
          aria-label={`${data.task.title} 완료 ${
            data.task.completed_at ? '해제' : '체크'
          }`}
          aria-pressed={Boolean(data.task.completed_at)}
          onClick={() => data.onToggle(data.task)}
        >
          {data.task.completed_at && <Check size={14} />}
        </button>

        <strong title={data.task.title}>
          {data.task.title}
        </strong>

        <button
          className="icon-button nodrag"
          disabled={data.busy}
          aria-label={`${data.task.title} 수정`}
          onClick={() => data.onEdit(data.task)}
        >
          <Pencil size={14} />
        </button>
      </div>

      <small title={data.projectName}>
        {data.projectName && `${data.projectName} · `}
        {formatDue(data.task)}
      </small>

      <Handle
        id="right"
        type="source"
        position={Position.Right}
        aria-label="오른쪽 연결점"
      />
    </div>
  );
}

function DateGroupNode({ data }: NodeProps<GroupNodeType>) {
  return (
    <div className="date-group-node">
      <div
        className="date-group-header"
        title="드래그해서 묶음 전체 이동"
        style={{
          cursor: 'grab',
          userSelect: 'none',
        }}
      >
        <strong>{dateLabel(data.date)}</strong>
        <span>{data.count}개의 할 일</span>
      </div>
    </div>
  );
}

const nodeTypes = {
  task: TaskNode,
  dateGroup: DateGroupNode,
};

const EMPTY_PROJECT_NAMES: Record<string, string> = {};

interface Props {
  projectNames?: Record<string, string>;
  tasks: Task[];
  links: Link[];
  busy: boolean;
  onToggle: (task: Task) => void;
  onEdit: (task: Task) => void;
  onMove: (id: string, x: number, y: number) => void;
  onConnect: (
    source: string,
    target: string,
    sourceHandle?: Side,
    targetHandle?: Side,
  ) => void;
  onSelectLink: (link: Link) => void;
}

export function TaskMap({
  tasks,
  links,
  busy,
  onToggle,
  onEdit,
  onMove,
  onConnect,
  onSelectLink,
  projectNames = EMPTY_PROJECT_NAMES,
}: Props) {
  const [grouped, setGrouped] = useState(true);

  const [groupPositions, setGroupPositions] =
    useState<GroupPositions>({});

  const columns = 1;

  const layouts = useMemo(
    () => layoutDateGroups(tasks, columns),
    [tasks, columns],
  );

  const initial = useMemo<MapNode[]>(() => {
    const taskData = (task: Task): TaskNodeData => ({
      task,
      busy,
      onToggle,
      onEdit,
      projectName: projectNames[task.project_id],
    });

    if (!grouped) {
      return tasks.map(task => ({
        id: task.id,
        type: 'task',
        position: {
          x: task.position_x,
          y: task.position_y,
        },
        data: taskData(task),
      }));
    }

    const parents: GroupNodeType[] = layouts.map(group => {
      const id = `date:${group.key}`;

      return {
        id,
        type: 'dateGroup',
        position: groupPositions[id] ?? {
          x: group.x,
          y: group.y,
        },
        data: {
          date: group.date,
          count: group.tasks.length,
        },
        style: {
          width: group.width,
          height: group.height,
        },
        dragHandle: '.date-group-header',
        draggable: !busy,
        selectable: true,
        connectable: false,
      };
    });

    const children: TaskNodeType[] = layouts.flatMap(group =>
      group.children.map(({ task, x, y }) => ({
        id: task.id,
        type: 'task' as const,
        parentId: `date:${group.key}`,
        extent: 'parent' as const,
        position: { x, y },
        data: taskData(task),
        draggable: false,
      })),
    );

    return [...parents, ...children];
  }, [
    tasks,
    busy,
    onToggle,
    onEdit,
    layouts,
    grouped,
    projectNames,
    groupPositions,
  ]);

  const [nodes, setNodes, onNodesChange] =
    useNodesState<MapNode>(initial);

  useEffect(() => {
    setNodes(initial);
  }, [initial, setNodes]);

  const edges = useMemo(
    () =>
      links.map(link => ({
        id: link.id,
        source: link.source_id,
        target: link.target_id,
        sourceHandle: link.source_handle ?? 'right',
        targetHandle: link.target_handle ?? 'left',
        type: 'smoothstep',
        zIndex: 1,
        style: {
          stroke: '#a3a3a3',
          strokeWidth: 2,
        },
        interactionWidth: 28,
      })),
    [links],
  );

  const firstGroup = layouts[0];

  const firstGroupNodes =
    grouped && firstGroup
      ? [{ id: `date:${firstGroup.key}` }]
      : undefined;

  return (
    <div className="date-map">
      <div className="date-map-options">
        <div
          className="view-switch"
          role="group"
          aria-label="연결도 배치 선택"
        >
          <button
            aria-pressed={grouped}
            className={grouped ? 'selected' : ''}
            onClick={() => setGrouped(true)}
          >
            날짜별 묶기
          </button>

          <button
            aria-pressed={!grouped}
            className={!grouped ? 'selected' : ''}
            onClick={() => setGrouped(false)}
          >
            자유 배치
          </button>
        </div>

        {grouped && (
          <button
            className="button secondary small"
            disabled={busy}
            onClick={() => setGroupPositions({})}
          >
            묶음 위치 초기화
          </button>
        )}

        <span>
          {grouped
            ? '날짜 제목을 잡으면 묶음 전체가 움직여.'
            : '카드를 옮기면 위치가 저장돼.'}
        </span>
      </div>

      <div className="map-canvas" aria-label="할 일 연결도">
        <ReactFlow
          key={grouped ? 'grouped' : 'free'}
          connectionMode={ConnectionMode.Loose}
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onNodeDragStop={(_, node) => {
            if (grouped && node.type === 'dateGroup') {
              setGroupPositions(current => ({
                ...current,
                [node.id]: {
                  x: node.position.x,
                  y: node.position.y,
                },
              }));

              return;
            }

            if (!grouped && node.type === 'task') {
              onMove(
                node.id,
                node.position.x,
                node.position.y,
              );
            }
          }}
          onConnect={connection => {
            if (!connection.source || !connection.target) {
              return;
            }

            onConnect(
              connection.source,
              connection.target,
              connection.sourceHandle === 'left'
                ? 'left'
                : 'right',
              connection.targetHandle === 'right'
                ? 'right'
                : 'left',
            );
          }}
          onEdgeClick={(_, edge) => {
            const link = links.find(
              item => item.id === edge.id,
            );

            if (link) onSelectLink(link);
          }}
          nodesDraggable={!busy}
          nodesConnectable={!busy}
          deleteKeyCode={null}
          fitView
          fitViewOptions={{
            nodes: firstGroupNodes,
            padding: 0.18,
            maxZoom: 1,
          }}
          minZoom={0.15}
          maxZoom={1.6}
        >
          <Background
            gap={22}
            size={1}
            color="#505050"
          />

          <Controls showInteractive={false} />
        </ReactFlow>

        {!tasks.length && (
          <div className="map-empty">
            할 일을 추가하면 연결도가 나타나.
          </div>
        )}
      </div>
    </div>
  );
}