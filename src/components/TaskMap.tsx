import { useEffect, useMemo, useState } from 'react';
import { ReactFlow, ConnectionMode, Background, Controls, Handle, Position, useNodesState, type Node, type NodeProps } from '@xyflow/react';
import { Check, Pencil } from 'lucide-react';
import { formatDue } from '../domain';
import { dateLabel, layoutMonthGroups } from '../taskDates';
import type { Task, Link } from '../types';
import '../dateGroups.css';
import { sortByDeadline } from '../taskDates';

type TaskNodeData = { projectName?: string; task: Task; busy: boolean; onToggle: (task: Task) => void; onEdit: (task: Task) => void };
type TaskNodeType = Node<TaskNodeData, 'task'>;
type GroupNodeType = Node<{ date: string | null; count: number; label?: string }, 'dateGroup'>;
type MapNode = TaskNodeType | GroupNodeType;

function TaskNode({ data }: NodeProps<TaskNodeType>) {
  return <div className={`map-node ${data.task.completed_at ? 'is-done' : ''}`}>
    <Handle id="left" type="source" position={Position.Left} aria-label="연결 도착점" />
    <div className="map-node-content">
      <button className={`check-button nodrag ${data.task.completed_at ? 'checked' : ''}`} disabled={data.busy}
        aria-label={`${data.task.title} 완료 ${data.task.completed_at ? '해제' : '체크'}`} aria-pressed={Boolean(data.task.completed_at)} onClick={() => data.onToggle(data.task)}>
        {data.task.completed_at && <Check size={14} />}
      </button>
      <strong title={data.task.title}>{data.task.title}</strong>
      <button className="icon-button nodrag" disabled={data.busy} aria-label={`${data.task.title} 수정`} onClick={() => data.onEdit(data.task)}><Pencil size={14} /></button>
    </div>
    <small title={data.projectName}>{data.projectName && `${data.projectName} · `}{formatDue(data.task)}</small>
    <Handle id="right" type="source" position={Position.Right} aria-label="연결 출발점" />
  </div>;
}

function DateGroupNode({ data }: NodeProps<GroupNodeType>) {
  return <div className="date-group-node"><div className="date-group-header" style={{ cursor: 'grab', userSelect: 'none' }}><strong>{data.label ?? dateLabel(data.date)}</strong><span>{data.count}개</span></div></div>;
}
const nodeTypes = { task: TaskNode, dateGroup: DateGroupNode };
const EMPTY_PROJECT_NAMES: Record<string, string> = {};

export function TaskMap({ tasks, links, busy, onToggle, onEdit, onMove, onConnect, onSelectLink, storageKey = 'tasknest:map:v2:local', projectNames = EMPTY_PROJECT_NAMES }: {
  storageKey?: string; projectNames?: Record<string, string>; tasks: Task[]; links: Link[]; busy: boolean; onToggle: (task: Task) => void; onEdit: (task: Task) => void;
  onMove: (id: string, x: number, y: number) => void;
  onConnect: (source: string, target: string, sourceHandle?: 'left' | 'right', targetHandle?: 'left' | 'right') => void; onSelectLink: (link: Link) => void;
}) {
  const [grouped, setGrouped] = useState(true);
  const [selected, setSelected] = useState<string[]>(() => { try { const value = JSON.parse(localStorage.getItem(storageKey) ?? '[]'); return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : []; } catch { return []; } });
  const [picker, setPicker] = useState(false);
  const [query, setQuery] = useState('');
  const [focusMonth, setFocusMonth] = useState('');
  useEffect(() => { try { localStorage.setItem(storageKey, JSON.stringify(selected)); } catch { /* Storage unavailable. */ } }, [selected, storageKey]);
  const freeTasks = tasks.filter(t => selected.includes(t.id));
  const [groupPositions, setGroupPositions] = useState<Record<string, { x: number; y: number }>>({});
  const layouts = useMemo(() => layoutMonthGroups(tasks), [tasks]);
  const months = [...new Set(layouts.map(g => g.month))];
  const activeMonth = months.includes(focusMonth) ? focusMonth : months[0];
  const initial = useMemo<MapNode[]>(() => {
    const taskData = (task: Task): TaskNodeData => ({ task, busy, onToggle, onEdit, projectName: projectNames[task.project_id] });
    if (!grouped) return freeTasks.map((task, i) => ({ id: task.id, type: 'task', position: task.position_x === 0 && task.position_y === 0 || freeTasks.some(t => t.id !== task.id && t.position_x === task.position_x && t.position_y === task.position_y) ? { x: 30 + i % 3 * 290, y: 30 + Math.floor(i / 3) * 170 } : { x: task.position_x, y: task.position_y }, data: taskData(task) }));
    // 부모 노드는 자식 노드보다 먼저 전달한다.
    const parents: GroupNodeType[] = layouts.map(group => ({
      id: `date:${group.key}`, type: 'dateGroup', position: groupPositions[`date:${group.key}`] ?? { x: group.x, y: group.y },
      data: { date: group.date, count: group.tasks.length },
      style: { width: group.width, height: group.height },
      dragHandle: '.date-group-header', draggable: !busy, selectable: true, connectable: false,
    }));
    const children: TaskNodeType[] = layouts.flatMap(group => group.children.map(({ task, x, y }) => ({
      id: task.id, type: 'task' as const, parentId: `date:${group.key}`, extent: 'parent' as const,
      position: { x, y }, data: taskData(task), draggable: false,
    })));
    const headers: GroupNodeType[] = [...new Set(layouts.map(g => g.month))].map(month => {
      const g = layouts.find(g => g.month === month)!;
      return { id: `month:${month}`, type: 'dateGroup', position: { x: g.x, y: 20 }, style: { width: g.width, height: 50 },
        data: { date: null, label: month === 'undated' ? '마감 미정' : month.replace('-', '년 ') + '월', count: layouts.filter(l => l.month === month).reduce((n,l) => n + l.tasks.length, 0) }, draggable: false, connectable: false, selectable: false };
    });
    return [...headers, ...parents, ...children];
  }, [tasks, busy, onToggle, onEdit, layouts, grouped, projectNames, groupPositions, selected]);
  const [nodes, setNodes, onNodesChange] = useNodesState<MapNode>(initial);
  useEffect(() => setNodes(initial), [initial, setNodes]);
  const edges = useMemo(() => links.filter(l => grouped || freeTasks.some(t => t.id === l.source_id) && freeTasks.some(t => t.id === l.target_id)).map(link => ({
    id: link.id, source: link.source_id, target: link.target_id,
    sourceHandle: link.source_handle ?? 'right', targetHandle: link.target_handle ?? 'left',
    type: 'smoothstep', zIndex: 1, style: { stroke: '#a3a3a3', strokeWidth: 2 }, interactionWidth: 28,
  })), [links, grouped, tasks, selected]);
  return <div className="date-map">
    <div className="date-map-options">
      <div className="view-switch" role="group" aria-label="연결도 배치 선택">
        <button aria-pressed={grouped} className={grouped ? 'selected' : ''} onClick={() => setGrouped(true)}>날짜별 묶기</button>
        <button aria-pressed={!grouped} className={!grouped ? 'selected' : ''} onClick={() => setGrouped(false)}>자유 배치</button>
      </div>
      <button className="button secondary small" disabled={busy} onClick={() => setGroupPositions({})}>묶음 위치 초기화</button>{grouped ? <label>이동할 월 <select aria-label="연결도 월 선택" value={activeMonth ?? ''} onChange={e => setFocusMonth(e.target.value)}>{months.map(month => <option key={month} value={month}>{month === 'undated' ? '마감 미정' : month}</option>)}</select></label> : <><button className="button secondary small" onClick={() => setPicker(p => !p)}>일정 선택 · {freeTasks.length}개 표시</button><button className="button secondary small" onClick={() => setSelected([])}>화면 비우기</button></>}
      <span>{grouped ? '한 열에 한 달 · 날짜 제목을 잡아 묶음 이동' : '선택한 카드만 표시해. 화면에서 빼도 일정과 연결은 남아 있어.'}</span>
    </div>
    {!grouped && picker && <div className="map-picker"><label>일정 검색<input type="search" placeholder="제목 또는 프로젝트 검색" value={query} onChange={e => setQuery(e.target.value)} /></label><div className="map-picker-items">{sortByDeadline(tasks).filter(t => `${t.title} ${projectNames[t.project_id] ?? ''}`.toLowerCase().includes(query.toLowerCase())).map(t => <label key={t.id}><input type="checkbox" checked={selected.includes(t.id)} onChange={e => setSelected(ids => e.target.checked ? [...ids, t.id] : ids.filter(id => id !== t.id))} /><span>{t.title}<small>{projectNames[t.project_id]} · {t.due_date ?? '마감 미정'}</small></span></label>)}</div><button className="button secondary small" onClick={() => setPicker(false)}>선택 완료</button></div>}
    <div className="map-canvas" aria-label="할 일 연결도">
      <ReactFlow connectionMode={ConnectionMode.Loose} key={`${grouped ? 'grouped' : 'free'}:${grouped ? activeMonth : selected.join(',')}`} nodes={nodes} edges={edges} nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onNodeDragStop={(_, node) => { if (grouped && node.type === 'dateGroup') setGroupPositions(p => ({ ...p, [node.id]: node.position }));
          else if (!grouped && node.type === 'task') onMove(node.id, node.position.x, node.position.y); }}
        onConnect={connection => { if (connection.source && connection.target) onConnect(connection.source, connection.target, connection.sourceHandle === 'left' ? 'left' : 'right', connection.targetHandle === 'right' ? 'right' : 'left'); }}
        onEdgeClick={(_, edge) => { const link = links.find(l => l.id === edge.id); if (link) onSelectLink(link); }}
        nodesDraggable={!busy} nodesConnectable={!busy} deleteKeyCode={null}
        fitView={!grouped && freeTasks.length > 0} fitViewOptions={{ padding: .2, maxZoom: 1 }}
        defaultViewport={{ x: grouped ? 20 - Math.max(0, months.indexOf(activeMonth)) * 365 * .85 : 20, y: 20, zoom: .85 }} minZoom={0.15} maxZoom={1.6}>
        <Background gap={22} size={1} color="#505050" /><Controls showInteractive={false} />
      </ReactFlow>
      {(!tasks.length || !grouped && !freeTasks.length) && <div className="map-empty">{grouped ? '표시할 일정이 없어. 표시 범위를 바꾸거나 할 일을 추가해.' : <div>빈 캔버스에서 시작해봐.<br /><button className="button secondary small" onClick={() => setPicker(true)}>표시할 일정 선택</button></div>}</div>}
    </div>
  </div>;
}
