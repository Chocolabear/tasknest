import { useEffect, useMemo } from 'react';
import { ReactFlow, Background, Controls, Handle, Position, useNodesState, type Node, type NodeProps } from '@xyflow/react';
import { Check, Pencil } from 'lucide-react';
import { formatDue } from '../domain';
import type { Task, Link } from '../types';

type TaskNodeData = { task: Task; busy: boolean; onToggle: (task: Task) => void; onEdit: (task: Task) => void };
type TaskNodeType = Node<TaskNodeData, 'task'>;
function TaskNode({ data }: NodeProps<TaskNodeType>) {
  return <div className={`map-node ${data.task.completed_at ? 'is-done' : ''}`}>
    <Handle type="target" position={Position.Left} aria-label="연결 도착점" />
    <div className="map-node-content"><button className={`check-button nodrag ${data.task.completed_at ? 'checked' : ''}`} disabled={data.busy} aria-label={`${data.task.title} 완료 ${data.task.completed_at ? '해제' : '체크'}`} aria-pressed={Boolean(data.task.completed_at)} onClick={() => data.onToggle(data.task)}>{data.task.completed_at && <Check size={14} />}</button>
      <strong>{data.task.title}</strong><button className="icon-button nodrag" disabled={data.busy} aria-label={`${data.task.title} 수정`} onClick={() => data.onEdit(data.task)}><Pencil size={14} /></button></div>
    <small>{formatDue(data.task)}</small>
    <Handle type="source" position={Position.Right} aria-label="연결 출발점" />
  </div>;
}
const nodeTypes = { task: TaskNode };

export function TaskMap({ tasks, links, busy, onToggle, onEdit, onMove, onConnect, onSelectLink }: {
  tasks: Task[]; links: Link[]; busy: boolean; onToggle: (task: Task) => void; onEdit: (task: Task) => void;
  onMove: (id: string, x: number, y: number) => void;
  onConnect: (source: string, target: string) => void; onSelectLink: (link: Link) => void;
}) {
  const initial = useMemo(() => tasks.map(task => ({ id: task.id, type: 'task' as const, position: { x: task.position_x, y: task.position_y }, data: { task, busy, onToggle, onEdit } })), [tasks, busy, onToggle, onEdit]);
  const [nodes, setNodes, onNodesChange] = useNodesState<TaskNodeType>(initial);
  useEffect(() => setNodes(initial), [initial, setNodes]);
  const edges = useMemo(() => links.map(l => ({ id: l.id, source: l.source_id, target: l.target_id, type: 'smoothstep', style: { stroke: '#8e9c81', strokeWidth: 2 }, interactionWidth: 28 })), [links]);
  return <div className="map-canvas" aria-label="할 일 연결도">
    <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange}
      onNodeDragStop={(_, node) => onMove(node.id, node.position.x, node.position.y)}
      onConnect={connection => { if (connection.source && connection.target) onConnect(connection.source, connection.target); }}
      onEdgeClick={(_, edge) => { const link = links.find(l => l.id === edge.id); if (link) onSelectLink(link); }}
      nodesDraggable={!busy} nodesConnectable={!busy} deleteKeyCode={null} fitView fitViewOptions={{ padding: 0.3, maxZoom: 1 }} minZoom={0.2} maxZoom={1.6}>
      <Background gap={22} size={1} color="#d6d9cd" /><Controls showInteractive={false} />
    </ReactFlow>
    {!tasks.length && <div className="map-empty">할 일을 추가하면 연결도가 나타나.</div>}
  </div>;
}
