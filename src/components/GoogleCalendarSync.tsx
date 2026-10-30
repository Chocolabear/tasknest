import { useCallback, useEffect, useRef, useState } from 'react';
import { CalendarDays, RefreshCw } from 'lucide-react';
import { supabase } from '../supabase';

interface Status {
  connected: boolean;
  email?: string;
  calendarId?: string;
  calendarName?: string;
  lastSyncedAt?: string;
}
interface CalendarOption { id: string; name: string; primary: boolean }
interface Result {
  exported: number; imported: number; deleted: number;
  conflicts: number; skipped: number; more: boolean;
  lastSyncedAt?: string;
}
export function GoogleCalendarSync({busy, onBusyChange, onSynced}: {
  busy: boolean;
  onBusyChange: (value: boolean) => void;
  onSynced: () => void;
}) {
  const [status, setStatus] = useState<Status | null>(null);
  const [calendars, setCalendars] = useState<CalendarOption[]>([]);
  const [selected, setSelected] = useState('');
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [consent, setConsent] = useState(false);
  const active = useRef(true);
  const running = useRef(false);

  const api = useCallback(async <T,>(action: string, extra: Record<string, unknown> = {}): Promise<T> => {
    if (!supabase) throw new Error('구글 연동은 Supabase 로그인 후 사용할 수 있어.');
    const {data, error} = await supabase.functions.invoke('google-calendar', {body: {action, ...extra}});
    if (error) {
      let text = '구글 연동 서버에 연결하지 못했어. Edge Function 배포와 설정을 확인해줘.';
      if ('context' in error && error.context instanceof Response) {
        try { text = (await error.context.json()).error || text; } catch { /* 응답이 JSON이 아닌 경우 */ }
      }
      throw new Error(text);
    }
    if (data?.error) throw new Error(data.error);
    return data as T;
  }, []);

  const load = useCallback(async () => {
    const next = await api<Status>('status');
    if (!active.current) return;
    setStatus(next);
    if (next.connected && !next.calendarId) {
      const choices = await api<{calendars: CalendarOption[]}>('calendars');
      if (!active.current) return;
      setCalendars(choices.calendars);
      setSelected(choices.calendars.find(item => item.primary)?.id ?? choices.calendars[0]?.id ?? '');
    }
  }, [api]);

  useEffect(() => {
    active.current = true;
    if (supabase) {
      const params = new URLSearchParams(window.location.search);
      if (params.get('google_calendar') === 'connected') setMessage('구글 계정이 연결됐어. 동기화할 기존 캘린더를 선택해줘.');
      if (params.get('google_calendar') === 'error') setError(params.get('google_message') ?? '구글 연결에 실패했어.');
      if (params.has('google_calendar')) {
        const url = new URL(window.location.href);
        url.searchParams.delete('google_calendar'); url.searchParams.delete('google_message');
        window.history.replaceState(null, '', url);
      }
      void load().catch(err => { if (active.current) setError(err.message); });
    }
    return () => { active.current = false; };
  }, [load]);

  async function perform(action: () => Promise<void>) {
    if (running.current || busy) return;
    running.current = true;
    setWorking(true); setError(''); setMessage(''); onBusyChange(true);
    try { await action(); }
    catch (err) { if (active.current) setError(err instanceof Error ? err.message : '구글 요청에 실패했어.'); }
    finally {
      running.current = false;
      if (active.current) setWorking(false);
      onBusyChange(false);
    }
  }

  if (!supabase) return null;
  const disabled = busy || working;

  return <section aria-label="구글 캘린더 연동" style={{marginBottom: 20, padding: 16, border: '1px solid #555', borderRadius: 12}}>
    <div style={{display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 12}}>
      <CalendarDays size={20} />
      <strong>Google Calendar 양방향 동기화</strong>
      {status?.email && <span className="muted">{status.email}</span>}
    </div>
    <p className="helper">
      선택한 기존 캘린더 ↔ Tasknest의 마감 있는 할 일. 동기화 버튼을 눌렀을 때 반영돼.
      반복 일정은 제외하고, 같은 항목을 양쪽에서 수정했다면 구글 내용을 우선해.
    </p>
    {status?.calendarId && <p>연결 캘린더: <strong>{status.calendarName ?? status.calendarId}</strong></p>}
    {!status?.connected && <button className="button secondary" disabled={disabled} onClick={() => void perform(async () => {
      const data = await api<{url: string}>('connect');
      window.location.assign(data.url);
    })}>Google 계정 연결</button>}
    {status?.connected && !status.calendarId && <div style={{display: 'grid', gap: 12}}>
      <label>기존 구글 캘린더
        <select value={selected} disabled={disabled} onChange={event => setSelected(event.target.value)}>
          <option value="">캘린더 선택</option>
          {calendars.map(item => <option key={item.id} value={item.id}>{item.name}{item.primary ? ' (기본)' : ''}</option>)}
        </select>
      </label>
      <p className="helper">이 캘린더의 기존 일반 일정이 Google Calendar 프로젝트로 들어와. 연결 후 캘린더 변경은 지원하지 않아.</p>
      <button className="button secondary" disabled={disabled || !selected} onClick={() => void perform(async () => {
        await api('set_calendar', {calendarId: selected}); await load();
      })}>이 캘린더로 연결</button>
    </div>}
    {status?.connected && status.calendarId && <>
      <label style={{display: 'flex', alignItems: 'flex-start', gap: 8, margin: '12px 0'}}>
        <input type="checkbox" checked={consent} disabled={disabled} style={{width: 'auto', marginTop: 4}}
          onChange={event => setConsent(event.target.checked)} />
        <span>수정·삭제가 양쪽에 반영되는 것에 동의해. 가져온 할 일이나 프로젝트를 삭제하면 구글 원본 일정도 다음 동기화 때 삭제돼.</span>
      </label>
      <button className="button primary" disabled={disabled || !consent} onClick={() => void perform(async () => {
        try {
          const result = await api<Result>('sync');
          if (!active.current) return;
          setStatus(current => current ? {...current, lastSyncedAt: result.lastSyncedAt} : current);
          setMessage(`구글 반영 ${result.exported}개 · 가져오기 ${result.imported}개 · 삭제 ${result.deleted}개 · 동시 수정 ${result.conflicts}개 · 제외 ${result.skipped}개.${result.more ? ' 남은 항목이 있어. 동기화를 한 번 더 눌러줘.' : ''}`);
        } finally { onSynced(); }
      })}><RefreshCw size={16} className={working ? 'spinning' : ''} />{working ? '동기화 중…' : '지금 동기화'}</button>
      {status.lastSyncedAt && <p className="helper">마지막 완료: {new Date(status.lastSyncedAt).toLocaleString('ko-KR', {timeZone: 'Asia/Seoul'})}</p>}
    </>}
    {status && <div style={{display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12}}>
      <button className="button secondary small" disabled={disabled} onClick={() => void perform(async () => {
        const data = await api<{url: string}>('connect'); window.location.assign(data.url);
      })}>Google 다시 연결</button>
      {status.connected && <button className="button secondary small" disabled={disabled} onClick={() => void perform(async () => {
        await api('disconnect'); await load(); setMessage('연결을 해제했어. 양쪽 데이터는 유지돼.');
      })}>연결 해제</button>}
    </div>}
    {!status && error && <button className="button secondary small" disabled={disabled} onClick={() => void perform(load)}>연결 상태 다시 확인</button>}
    {message && <p role="status" style={{marginTop: 12}}>{message}</p>}
    {error && <p role="alert" className="error-banner" style={{marginTop: 12}}>{error}</p>}
  </section>;
}
