import { useCallback, useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Sprout, Plus, List, Workflow, Pencil, Trash2, RefreshCw, Download, LogOut, Link2, ArrowRight, CalendarDays, Settings } from 'lucide-react';
import { configError, supabase } from './supabase';
import * as repo from './repository';
import { progress, validateTask } from './domain';
import type { Snapshot, Task, Link } from './types';
import { Auth, PasswordRecovery } from './components/Auth';
import { Modal } from './components/Modal';
import { TaskEditor } from './components/TaskEditor';
import { ProjectEditor } from './components/ProjectEditor';
import { TaskMap } from './components/TaskMap';
import { TaskList } from './components/TaskList';
import { TaskCalendar } from './components/TaskCalendar';
import { cutoffDate, withinRange, useDisplaySettings } from './displaySettings';
import './displaySettings.css';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!supabase);
  const [recovery, setRecovery] = useState(false);
  const [authError, setAuthError] = useState('');
  useEffect(() => {
    if (!supabase) return;
    let live = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, value) => {
      if (!live) return;
      setSession(value); setReady(true);
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      if (event === 'SIGNED_OUT') setRecovery(false);
    });
    supabase.auth.getSession().then(({ data, error }) => {
      if (!live) return;
      if (error) setAuthError(error.message);
      setSession(data.session); setReady(true);
    }).catch(error => { if (live) { setAuthError(String(error)); setReady(true); } });
    return () => { live = false; subscription.unsubscribe(); };
  }, []);
  if (configError) return <main className="auth-page"><section className="auth-card"><h1>설정을 확인해줘</h1><p>{configError}</p><p>README.md의 Supabase 설정 단계를 참고해줘.</p></section></main>;
  if (!ready) return <main className="loading">로그인 정보를 확인하고 있어…</main>;
  if (recovery && session) return <PasswordRecovery onDone={() => setRecovery(false)} />;
  if (supabase && !session) return <>{authError && <p className="error-banner" role="alert">{authError}</p>}<Auth /></>;
  return <Workspace key={session?.user.id ?? 'local'} ownerId={session?.user.id ?? 'local'} email={session?.user.email} />;
}

type ConfirmAction = { title: string; message: string; action: () => Promise<void> };
export function Workspace({ ownerId, email }: { ownerId: string; email?: string }) {
  const [settings, setSettings] = useDisplaySettings(ownerId);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const cutoff = cutoffDate(settings);
  const [data, setData] = useState<Snapshot>({ projects: [], tasks: [], links: [] });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<'list' | 'map' | 'calendar'>('list');
  const [filter, setFilter] = useState<'all' | 'open' | 'done'>('all');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [taskEditor, setTaskEditor] = useState<{ task: Task | null } | null>(null);
  const [projectEditor, setProjectEditor] = useState<'new' | 'rename' | null>(null);
  const [confirm, setConfirm] = useState<ConfirmAction | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [source, setSource] = useState('');
  const [target, setTarget] = useState('');
  const lock = useRef(false);
  const requestId = useRef(0);
  const mounted = useRef(true);

  const reload = useCallback(async () => {
    const id = ++requestId.current;
    const next = await repo.loadSnapshot();
    if (!mounted.current || id !== requestId.current) return;
    setData(next);
    setSelectedId(current => current === null || next.projects.some(p => p.id === current) ? current : null);
  }, []);

  useEffect(() => {
    mounted.current = true;
    reload().catch(err => { if (mounted.current) setError(String(err.message ?? err)); }).finally(() => { if (mounted.current) setLoading(false); });
    return () => { mounted.current = false; requestId.current++; };
  }, [reload]);

  const run = useCallback(async (action: () => Promise<void>) => {
    if (lock.current) return false;
    lock.current = true; requestId.current++; setBusy(true); setError('');
    try {
      await action();
      try { await reload(); }
      catch (err) { throw new Error(`요청 후 최신 데이터 조회에 실패했어. 새로고침해줘: ${err instanceof Error ? err.message : err}`); }
      return true;
    } catch (err) {
      if (mounted.current) setError(err instanceof Error ? err.message : '요청을 처리하지 못했어.');
      return false;
    } finally { lock.current = false; if (mounted.current) setBusy(false); }
  }, [reload]);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== 'visible' || lock.current) return;
      void run(async () => {});
    };
    window.addEventListener('focus', refresh); document.addEventListener('visibilitychange', refresh);
    const crossTab = (event: StorageEvent) => { if (event.key === repo.LOCAL_KEY) refresh(); };
    window.addEventListener('storage', crossTab);
    return () => { window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); window.removeEventListener('storage', crossTab); };
  }, [run]);

  const actualProject = data.projects.find(p => p.id === selectedId);
  const project = actualProject ?? { id: 'all', name: '전체 프로젝트', color: '#bcbcbc' };
  const projectNames = Object.fromEntries(data.projects.map(p => [p.id, p.name]));
  const tasks = data.tasks.filter(t => selectedId === null || t.project_id === selectedId);
  const links = data.links.filter(l => tasks.some(t => t.id === l.source_id) && tasks.some(t => t.id === l.target_id));
  const stats = progress(tasks);
  const rangeTasks = tasks.filter(t => withinRange(t, cutoff));
  const hiddenCount = tasks.length - rangeTasks.length;
  const visibleTasks = rangeTasks.filter(t => filter === 'all' || (filter === 'done' ? Boolean(t.completed_at) : !t.completed_at));
  const toggle = useCallback((task: Task) => { void run(() => repo.updateTask(task.id, { completed_at: task.completed_at ? null : new Date().toISOString() })); }, [run]);
  const edit = useCallback((task: Task) => setTaskEditor({ task }), []);
  function connect(sourceId: string, targetId: string, sourceHandle: 'left' | 'right' = 'right', targetHandle: 'left' | 'right' = 'left') {
    const sourceTask = data.tasks.find(t => t.id === sourceId);
    const targetTask = data.tasks.find(t => t.id === targetId);
    if (!sourceTask || !targetTask) {
      setError('연결할 할 일을 찾을 수 없어.'); return;
    }
    void run(() => repo.addLink(sourceTask.project_id, sourceId, targetId, sourceHandle, targetHandle));
  }
  function selectLink(link: Link) {
    setConfirm({ title: '연결을 삭제할까?', message: '할 일은 유지하고 선택한 연결선만 삭제해.', action: () => repo.removeLink(link.id) });
  }
  function exportData() {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ version: 1, exported_at: new Date().toISOString(), ...data }, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `tasknest-backup-${new Date().toISOString().slice(0, 10)}.json`; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <div className="app-shell">
    <header className="topbar"><a className="brand" href="#" aria-label="Tasknest 홈"><Sprout size={27} /><span>tasknest<span className="brand-dot">.</span></span></a>
      <div className="top-actions"><button className="icon-button" aria-label="화면 설정" title="화면 설정" onClick={() => setSettingsOpen(true)}><Settings size={18} /></button><span className="mode-badge">{supabase ? '클라우드 저장' : '이 브라우저에 저장'}</span><button className="icon-button" title="JSON 백업 다운로드" aria-label="JSON 백업 다운로드" disabled={loading || busy} onClick={exportData}><Download size={18} /></button><button className="icon-button" title="최신 데이터 불러오기" aria-label="새로고침" disabled={busy || loading} onClick={() => { void run(async () => {}); }}><RefreshCw size={18} className={busy ? 'spinning' : ''} /></button>{supabase && <button className="icon-button" title={`${email} 로그아웃`} aria-label="로그아웃" disabled={busy} onClick={() => { void run(async () => { const { error } = await supabase!.auth.signOut(); if (error) throw error; }); }}><LogOut size={18} /></button>}</div>
    </header>
    <main className="workspace">
      <div className="page-heading"><div><p className="eyebrow">YOUR PERSONAL WORKSPACE</p><h1>조금씩, 완성에 가까이<span>.</span></h1><p className="muted">흩어진 할 일을 연결하고 오늘의 한 걸음을 남겨봐.</p></div><div className="heading-symbol" aria-hidden="true"><Sprout size={45} strokeWidth={1.2} /></div></div>
      {!supabase && <aside className="local-notice">지금은 로컬 모드야. 이 브라우저에만 저장돼. 기기 간 공유는 README의 Supabase 설정 후 사용할 수 있어.</aside>}
      {error && <div className="error-banner" role="alert"><span>{error}</span><button className="icon-button" aria-label="오류 닫기" onClick={() => setError('')}>×</button></div>}
      <nav className="project-tabs" aria-label="프로젝트"><button className={`project-tab ${selectedId === null ? 'active' : ''}`} disabled={busy} aria-current={selectedId === null ? 'page' : undefined} onClick={() => { setSelectedId(null); setFilter('all'); }}>전체<span className="tab-count">{data.tasks.length}</span></button>{data.projects.map(p => <button key={p.id} disabled={busy} className={`project-tab ${p.id === selectedId ? 'active' : ''}`} aria-current={p.id === selectedId ? 'page' : undefined} onClick={() => { setSelectedId(p.id); setFilter('all'); }}><span className="project-dot" style={{ background: p.color }} />{p.name}<span className="tab-count">{data.tasks.filter(t => t.project_id === p.id).length}</span></button>)}<button className="add-project" disabled={busy || loading} onClick={() => setProjectEditor('new')}><Plus size={17} />프로젝트</button></nav>
      {loading ? <div className="empty-state">프로젝트를 불러오고 있어…</div> : !data.projects.length ? <section className="empty-state"><div className="empty-icon"><Sprout size={34} /></div><h2>첫 프로젝트를 만들어봐.</h2><p>학교 과제부터 개인 개발까지, 하나씩 시작하면 돼.</p><button className="button primary" onClick={() => setProjectEditor('new')}><Plus size={17} />프로젝트 만들기</button></section> : <>
        <section className="project-summary"><div className="summary-main"><p className="eyebrow">PROJECT OVERVIEW</p><div className="project-title-row"><h2>{project.name}</h2>{actualProject && <><button className="icon-button" aria-label="프로젝트 이름 수정" disabled={busy} onClick={() => setProjectEditor('rename')}><Pencil size={16} /></button><button className="icon-button danger" aria-label="프로젝트 삭제" disabled={busy} onClick={() => setConfirm({ title: '프로젝트를 삭제할까?', message: `“${project.name}”의 할 일과 연결도 함께 삭제돼. 되돌릴 수 없어.`, action: () => repo.removeProject(project.id) })}><Trash2 size={16} /></button></>}</div><p className="muted">{stats.total ? `${stats.total}개의 할 일 중 ${stats.completed}개를 완료했어.` : '할 일을 추가해서 첫 걸음을 시작해봐.'}</p><div className="progress-track" role="progressbar" aria-label="프로젝트 진행률" aria-valuemin={0} aria-valuemax={100} aria-valuenow={stats.percent}><span style={{ width: `${stats.percent}%`, background: project.color }} /></div></div><div className="progress-number"><strong>{stats.percent}<span>%</span></strong><span>완료율</span></div></section>
        <section className="task-panel"><div className="panel-toolbar"><div className="view-switch" role="group" aria-label="보기 선택"><button className={view === 'list' ? 'selected' : ''} aria-pressed={view === 'list'} onClick={() => setView('list')}><List size={17} />목록</button><button className={view === 'map' ? 'selected' : ''} aria-pressed={view === 'map'} onClick={() => setView('map')}><Workflow size={17} />연결도</button><button className={view === 'calendar' ? 'selected' : ''} aria-pressed={view === 'calendar'} onClick={() => setView('calendar')}><CalendarDays size={17} />캘린더</button></div><button className="button primary" disabled={busy} onClick={() => setTaskEditor({ task: null })}><Plus size={17} />할 일 추가</button></div>
          <div className="list-toolbar"><div className="filter-tabs" role="group" aria-label="할 일 필터">{(['all', 'open', 'done'] as const).map(f => <button key={f} aria-pressed={filter === f} className={filter === f ? 'selected' : ''} onClick={() => setFilter(f)}>{f === 'all' ? '전체' : f === 'open' ? '진행 중' : '완료'}</button>)}</div><span className="list-count">{visibleTasks.length}개의 할 일</span></div>
          <div className="display-range-bar"><span>{cutoff ? `${cutoff}부터 표시 · 과거 일정 ${hiddenCount}개 숨김` : '모든 날짜 표시'} · 마감 미정 포함</span><button className="button secondary small" onClick={() => setSettingsOpen(true)}>표시 설정</button></div>
          {view === 'calendar' ? <TaskCalendar displayMode={settings.calendarMode} tasks={visibleTasks} projects={data.projects} busy={busy} onToggle={toggle} onEdit={edit} onDelete={task => setConfirm({ title: '할 일을 삭제할까?', message: `“${task.title}”과 관련된 연결선이 삭제돼.`, action: () => repo.removeTask(task.id) })} /> : view === 'list' ? <>
            <TaskList projectNames={projectNames} tasks={visibleTasks} busy={busy} filter={filter} onToggle={toggle} onEdit={edit}
              onDelete={task => setConfirm({ title: '할 일을 삭제할까?', message: `“${task.title}”과 관련된 연결선이 삭제돼.`, action: () => repo.removeTask(task.id) })} /></> : <>
              <div className="map-toolbar"><span>날짜별로 모아 보고, 연결점을 이어봐.</span><button className="button secondary small" disabled={busy || tasks.length < 2} onClick={() => { setSource(tasks[0]?.id ?? ''); setTarget(tasks[1]?.id ?? ''); setConnecting(true); }}><Link2 size={15} />연결 관리</button></div>
              <TaskMap key={`${ownerId}:${project.id}`} storageKey={`tasknest:map:v2:${ownerId}:${project.id}`} tasks={visibleTasks} links={links.filter(l => visibleTasks.some(t => t.id === l.source_id) && visibleTasks.some(t => t.id === l.target_id))} projectNames={projectNames} busy={busy} onToggle={toggle} onEdit={edit} onMove={(id, x, y) => { void run(() => repo.updateTask(id, { position_x: x, position_y: y })); }} onConnect={connect} onSelectLink={selectLink} />
              <p className="map-hint">같은 날짜는 묶고, 월별로 열을 나눠 보여줘. 자유 배치는 일정 선택에서 필요한 카드만 추가해. 숨겨진 카드의 연결은 유지돼.</p>
            </>}
        </section>
      </>}
      <footer className="workspace-footer"><span>하나씩 체크할 때마다, 조금 더 가까이.</span><span>Tasknest · 마감 기준 Asia/Seoul</span></footer>
    </main>
    {settingsOpen && <Modal title="화면 설정" onClose={() => setSettingsOpen(false)}>
      <div className="display-settings"><label>일정 표시 범위<select value={settings.history} onChange={e => setSettings({ ...settings, history: e.target.value as typeof settings.history })}>
        <option value="year">올해 1월 1일부터</option><option value="today">오늘부터</option><option value="all">모든 날짜</option><option value="custom">시작 날짜 직접 선택</option>
      </select></label>
      {settings.history === 'custom' && <label>시작 날짜<input type="date" value={settings.startDate} onChange={e => setSettings({ ...settings, startDate: e.target.value })} /></label>}
      <p>목록·연결도·캘린더에 함께 적용돼. 이전 일정은 삭제하지 않고 숨겨. 마감 미정은 계속 표시해. 프로젝트 완료율은 전체 일정 기준이야.</p>
      <label>캘린더 표시<select value={settings.calendarMode} onChange={e => setSettings({ ...settings, calendarMode: e.target.value as typeof settings.calendarMode })}><option value="titles">일정 제목과 시간</option><option value="dots">점과 개수</option></select></label>
      <p>설정과 자유 배치 선택은 이 브라우저의 계정별로 저장돼.</p></div>
      <footer className="modal-footer"><button className="button primary" disabled={settings.history === 'custom' && !settings.startDate} onClick={() => setSettingsOpen(false)}>완료</button></footer>
    </Modal>}
    {taskEditor && project && <TaskEditor task={taskEditor.task} projects={data.projects} projectId={actualProject?.id} busy={busy} error={error} onClose={() => setTaskEditor(null)} onSave={async (input, targetProjectId) => {
      const ok = await run(async () => { const valid = validateTask(input); if (taskEditor.task) await repo.saveTask(taskEditor.task.id, valid, targetProjectId); else { if (!targetProjectId || !data.projects.some(p => p.id === targetProjectId)) throw new Error('프로젝트를 선택해줘.'); await repo.addTask(targetProjectId, valid, data.tasks.filter(t => t.project_id === targetProjectId).length); } });
      if (ok) setTaskEditor(null);
    }} />}
    {projectEditor && <ProjectEditor initial={projectEditor === 'rename' ? project?.name : undefined} busy={busy} error={error} onClose={() => setProjectEditor(null)} onSave={async (name, color) => {
      let newId: string | undefined;
      const ok = await run(async () => { if (projectEditor === 'rename' && project) await repo.renameProject(project.id, name); else newId = (await repo.addProject(name, color, ownerId)).id; });
      if (ok) { if (newId) setSelectedId(newId); setProjectEditor(null); }
    }} />}
    {confirm && <Modal title={confirm.title} error={error} onClose={() => { if (!busy) setConfirm(null); }}><p className="confirm-text">{confirm.message}</p><footer className="modal-footer"><button className="button secondary" disabled={busy} onClick={() => setConfirm(null)}>취소</button><button className="button destructive" disabled={busy} onClick={async () => { if (await run(confirm.action)) setConfirm(null); }}>{busy ? '삭제 중…' : '삭제하기'}</button></footer></Modal>}
    {connecting && project && <Modal title="할 일 연결 관리" error={error} onClose={() => { if (!busy) setConnecting(false); }}><form onSubmit={async e => {
      e.preventDefault();
      const sourceTask = data.tasks.find(t => t.id === source);
      const targetTask = data.tasks.find(t => t.id === target);
      if (!sourceTask || !targetTask) { setError('연결할 할 일을 찾을 수 없어.'); return; }
      if (await run(() => repo.addLink(sourceTask.project_id, source, target))) setConnecting(false);
    }}><fieldset disabled={busy}><label>출발 할 일<select value={source} required onChange={e => setSource(e.target.value)}>{tasks.map(t => <option key={t.id} value={t.id}>{projectNames[t.project_id]} · {t.title}</option>)}</select></label><label>도착 할 일<select value={target} required onChange={e => setTarget(e.target.value)}>{tasks.map(t => <option key={t.id} value={t.id}>{projectNames[t.project_id]} · {t.title}</option>)}</select></label><button className="button primary full" disabled={!source || !target || source === target || links.some(l => l.source_id === source && l.target_id === target)}>연결 추가<ArrowRight size={16} /></button></fieldset></form><div className="connection-list">{links.map(l => <div key={l.id}><span>{tasks.find(t => t.id === l.source_id)?.title} → {tasks.find(t => t.id === l.target_id)?.title}</span><button className="icon-button danger" disabled={busy} aria-label="연결 삭제" onClick={async () => { await run(() => repo.removeLink(l.id)); }}><Trash2 size={16} /></button></div>)}</div></Modal>}
  </div>;
}
