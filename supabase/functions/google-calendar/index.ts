import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { synchronize, eventBody, type TaskRow, type GoogleEvent, type Mapping } from './sync.ts';

const env = (name: string) => {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`서버 설정 누락: ${name}`);
  return value;
};
const serverURL = env('SUPABASE_URL');
const appURL = env('APP_URL').replace(/\/$/, '');
const callbackURL = `${serverURL}/functions/v1/google-calendar?action=callback`;
const clientId = env('GOOGLE_CLIENT_ID');
const clientSecret = env('GOOGLE_CLIENT_SECRET');
const scopes = 'openid email https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.calendarlist.readonly';
const timeoutFetch: typeof fetch = (input, init) => fetch(input, {...init, signal: AbortSignal.timeout(10_000)});
const admin = createClient(serverURL, env('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: timeoutFetch },
});
const must = <T>(result: {data: T; error: {message: string} | null}) => {
  if (result.error) throw new Error(result.error.message);
  return result.data;
};
const hex = (buffer: ArrayBuffer) => [...new Uint8Array(buffer)].map(x => x.toString(16).padStart(2, '0')).join('');
const digest = async (value: string) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
const random = () => crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '');
const base64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
const stableUUID = async (value: string) => {
  const h = await digest(value);
  return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`;
};
function cors(req: Request) {
  const origin = req.headers.get('Origin') ?? '';
  const allowed = [new URL(appURL).origin, 'http://localhost:5173'];
  return {
    'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : new URL(appURL).origin,
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}
function json(req: Request, data: unknown, status = 200) {
  return Response.json(data, {status, headers: {...cors(req), 'Cache-Control': 'no-store'}});
}
async function tokenRequest(values: Record<string, string>) {
  const response = await timeoutFetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body: new URLSearchParams({client_id: clientId, client_secret: clientSecret, ...values}),
  });
  const body = await response.json();
  if (!response.ok) throw new Error('구글 인증이 만료됐어. Google 다시 연결을 눌러줘.');
  return body as {access_token: string; refresh_token?: string; scope?: string};
}
async function accessToken(connection: {refresh_token: string | null}) {
  if (!connection.refresh_token) throw new Error('먼저 Google 계정을 연결해줘.');
  return (await tokenRequest({grant_type: 'refresh_token', refresh_token: connection.refresh_token})).access_token;
}
class GoogleError extends Error {
  constructor(public status: number) {
    super(status === 412 ? '동기화 도중 구글 일정이 바뀌었어. 다시 동기화해줘.'
      : status === 404 || status === 410 ? '선택한 구글 캘린더나 일정이 없어. 접근 권한을 확인해줘.'
      : status === 401 ? '구글 인증이 만료됐어. 다시 연결해줘.'
      : `Google Calendar 요청 실패 (${status}). 캘린더 권한과 API 사용 설정을 확인해줘.`);
  }
}
async function google<T>(token: string, path: string, options: RequestInit = {}): Promise<T> {
  const response = await timeoutFetch(`https://www.googleapis.com/calendar/v3/${path}`, {
    ...options,
    headers: {'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', ...options.headers},
  });
  if (!response.ok) throw new GoogleError(response.status);
  return response.status === 204 ? undefined as T : await response.json();
}
async function connectionFor(owner: string) {
  return must(await admin.from('google_calendar_connections').select('*').eq('owner_id', owner).maybeSingle());
}

async function callback(req: Request) {
  const url = new URL(req.url);
  const state = url.searchParams.get('state');
  if (!state) return new Response('인증 상태가 없어. Tasknest에서 다시 연결해줘.', {status: 400});
  const record = must(await admin.from('google_calendar_states').delete()
    .eq('state_hash', await digest(state)).gt('expires_at', new Date().toISOString()).select().maybeSingle());
  if (!record) return new Response('인증 요청이 만료됐어. Tasknest에서 다시 연결해줘.', {status: 400});
  const redirect = new URL(appURL);
  try {
    const code = url.searchParams.get('code');
    if (!code || url.searchParams.has('error')) throw new Error('구글 연결이 취소됐어.');
    const tokens = await tokenRequest({grant_type: 'authorization_code', code,
      redirect_uri: callbackURL, code_verifier: record.code_verifier});
    const userResponse = await timeoutFetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: {Authorization: `Bearer ${tokens.access_token}`},
    });
    if (!userResponse.ok) throw new Error('구글 계정 확인에 실패했어.');
    const user = await userResponse.json() as {sub: string; email: string};
    if (!user.sub || !user.email) throw new Error('구글 계정 정보가 없어.');
    const old = await connectionFor(record.owner_id);
    if (old && old.google_sub !== user.sub) throw new Error('이전에 연결한 구글 계정으로 다시 연결해줘.');
    if (old?.lock_until && Date.parse(old.lock_until) > Date.now()) throw new Error('동기화 중이야. 잠시 후 다시 연결해줘.');
    const refresh = tokens.refresh_token ?? old?.refresh_token;
    if (!refresh) throw new Error('구글에서 오프라인 접근 권한을 허용한 뒤 다시 연결해줘.');
    must(await admin.from('google_calendar_connections').upsert({
      owner_id: record.owner_id, google_sub: user.sub, google_email: user.email, refresh_token: refresh,
    }, {onConflict: 'owner_id'}));
    redirect.searchParams.set('google_calendar', 'connected');
  } catch (error) {
    redirect.searchParams.set('google_calendar', 'error');
    redirect.searchParams.set('google_message', error instanceof Error ? error.message : '연결에 실패했어.');
  }
  return Response.redirect(redirect.toString(), 303);
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', {headers: cors(req)});
  try {
    if (req.method === 'GET' && new URL(req.url).searchParams.get('action') === 'callback') return await callback(req);
    if (req.method !== 'POST') return json(req, {error: 'POST 요청이 필요해.'}, 405);
    const origin = req.headers.get('Origin');
    if (origin && ![new URL(appURL).origin, 'http://localhost:5173'].includes(origin)) return json(req, {error: '허용되지 않은 사이트야.'}, 403);
    const bearer = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
    if (!bearer) return json(req, {error: '로그인이 필요해.'}, 401);
    const {data: auth, error: authError} = await admin.auth.getUser(bearer);
    if (authError || !auth.user) return json(req, {error: '로그인이 만료됐어. 다시 로그인해줘.'}, 401);
    const owner = auth.user.id;
    const userDB = createClient(serverURL, env('SUPABASE_ANON_KEY'), {
      auth: {persistSession: false, autoRefreshToken: false},
      global: {headers: {Authorization: `Bearer ${bearer}`}, fetch: timeoutFetch},
    });
    const body = await req.json() as {action?: string; calendarId?: string};
    if (body.action === 'status') {
      const connection = await connectionFor(owner);
      return json(req, {connected: Boolean(connection?.refresh_token), email: connection?.google_email,
        calendarId: connection?.calendar_id, calendarName: connection?.calendar_name,
        lastSyncedAt: connection?.last_synced_at});
    }
    if (body.action === 'connect') {
      const state = random();
      const verifier = random();
      const challenge = base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
      must(await admin.from('google_calendar_states').delete().eq('owner_id', owner));
      must(await admin.from('google_calendar_states').insert({
        owner_id: owner, state_hash: await digest(state), code_verifier: verifier,
        expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
      }));
      const target = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      target.search = new URLSearchParams({client_id: clientId, redirect_uri: callbackURL,
        response_type: 'code', scope: scopes, access_type: 'offline', prompt: 'consent select_account',
        state, code_challenge: challenge, code_challenge_method: 'S256'}).toString();
      return json(req, {url: target.toString()});
    }
    if (body.action === 'calendars') {
      const connection = await connectionFor(owner);
      if (!connection) throw new Error('먼저 Google 계정을 연결해줘.');
      const token = await accessToken(connection);
      const items: {id: string; summary: string; primary?: boolean; accessRole: string}[] = [];
      let page = '';
      do {
        const query = new URLSearchParams({maxResults: '250', minAccessRole: 'writer'});
        if (page) query.set('pageToken', page);
        const data = await google<{items?: typeof items; nextPageToken?: string}>(token, `users/me/calendarList?${query}`);
        items.push(...(data.items ?? []).filter(item => ['writer', 'owner'].includes(item.accessRole)));
        page = data.nextPageToken ?? '';
      } while (page);
      return json(req, {calendars: items.map(item => ({id: item.id, name: item.summary, primary: Boolean(item.primary)}))});
    }
    if (!['sync', 'set_calendar', 'disconnect'].includes(body.action ?? '')) return json(req, {error: '잘못된 요청이야.'}, 400);
    const lockId = crypto.randomUUID();
    const locked = must(await admin.rpc('tasknest_google_lock', {p_owner: owner, p_lock: lockId}));
    const connection = locked?.[0];
    if (!connection) throw new Error('연결이 없거나 이미 동기화 중이야. 잠시 후 다시 시도해줘.');
    try {
      if (body.action === 'disconnect') {
        // 구글 일정과 기존 연결 정보는 보존하고 인증 토큰만 폐기해.
        if (connection.refresh_token) {
          const response = await timeoutFetch('https://oauth2.googleapis.com/revoke', {
            method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'},
            body: new URLSearchParams({token: connection.refresh_token}),
          });
          if (!response.ok && response.status !== 400) throw new Error('구글 연결 해제에 실패했어. 다시 시도해줘.');
        }
        must(await admin.from('google_calendar_connections').update({refresh_token: null}).eq('owner_id', owner));
        return json(req, {ok: true});
      }
      const token = await accessToken(connection);
      if (body.action === 'set_calendar') {
        if (!body.calendarId) throw new Error('캘린더를 선택해줘.');
        if (connection.calendar_id && connection.calendar_id !== body.calendarId) throw new Error('기존 연결 캘린더는 변경할 수 없어. 중복 방지를 위해 같은 캘린더로 다시 연결해줘.');
        const calendar = await google<{id: string; summary: string; accessRole: string}>(token,
          `users/me/calendarList/${encodeURIComponent(body.calendarId)}`);
        if (!['writer', 'owner'].includes(calendar.accessRole)) throw new Error('수정 권한이 있는 캘린더를 선택해줘.');
        must(await admin.from('google_calendar_connections').update({calendar_id: calendar.id, calendar_name: calendar.summary}).eq('owner_id', owner));
        return json(req, {ok: true});
      }
      if (!connection.calendar_id) throw new Error('먼저 기존 구글 캘린더를 선택해줘.');
      const path = `calendars/${encodeURIComponent(connection.calendar_id)}/events`;
      const listRows = async (table: string, client = admin) => {
        const all: Record<string, unknown>[] = [];
        for (let offset = 0; ; offset += 500) {
          let query = client.from(table).select('*').order(table === 'tasks' ? 'id' : 'task_id').range(offset, offset + 499);
          if (table !== 'tasks') query = query.eq('owner_id', owner);
          const rows = must(await query) ?? [];
          all.push(...rows);
          if (rows.length < 500) return all;
        }
      };
      const store = {
        tasks: async () => await listRows('tasks', userDB) as unknown as TaskRow[],
        mappings: async () => await listRows('google_calendar_links') as unknown as Mapping[],
        saveMapping: async (mapping: Mapping) => { must(await admin.from('google_calendar_links').upsert({owner_id: owner, ...mapping}, {onConflict: 'owner_id,task_id'})); },
        removeMapping: async (taskId: string) => { must(await admin.from('google_calendar_links').delete().eq('owner_id', owner).eq('task_id', taskId)); },
        updateTask: async (old: TaskRow, patch: Partial<TaskRow>) => {
          const updated = must(await userDB.from('tasks').update(patch).eq('id', old.id).eq('updated_at', old.updated_at!).select().maybeSingle());
          if (!updated) throw new Error('동기화 도중 할 일이 바뀌었어. 다시 동기화해줘.');
          return updated as TaskRow;
        },
        deleteTask: async (old: TaskRow) => {
          const deleted = must(await userDB.from('tasks').delete().eq('id', old.id).eq('updated_at', old.updated_at!).select('id').maybeSingle());
          if (!deleted) throw new Error('동기화 도중 할 일이 바뀌었어. 다시 동기화해줘.');
        },
        importTask: async (eventId: string, patch: Partial<TaskRow>) => {
          const projectId = await stableUUID(`${owner}:google-import:${connection.calendar_id}`);
          must(await userDB.from('projects').upsert({id: projectId, owner_id: owner, name: 'Google Calendar', color: '#4285f4'}, {onConflict: 'id', ignoreDuplicates: true}));
          const task = {id: await stableUUID(`${owner}:${connection.calendar_id}:${eventId}`), project_id: projectId,
            title: '', description: '', due_date: null, due_time: null, completed_at: null, ...patch} as TaskRow;
          must(await userDB.from('tasks').upsert(task, {onConflict: 'id', ignoreDuplicates: true}));
          return task;
        },
      };
      const getEvent = async (id: string) => {
        try { return await google<GoogleEvent>(token, `${path}/${encodeURIComponent(id)}`); }
        catch (error) { if (error instanceof GoogleError && [404, 410].includes(error.status)) return null; throw error; }
      };
      const api = {
        events: async () => {
          const events: GoogleEvent[] = [];
          let page = '';
          do {
            const query = new URLSearchParams({maxResults: '2500', showDeleted: 'true', singleEvents: 'false'});
            if (page) query.set('pageToken', page);
            const data = await google<{items?: GoogleEvent[]; nextPageToken?: string}>(token, `${path}?${query}`);
            events.push(...(data.items ?? [])); page = data.nextPageToken ?? '';
          } while (page);
          return events;
        },
        get: getEvent,
        create: async (id: string, task: TaskRow) => {
          try { return await google<GoogleEvent>(token, path, {method: 'POST', body: JSON.stringify({id, ...eventBody(task)})}); }
          catch (error) {
            if (!(error instanceof GoogleError) || error.status !== 409) throw error;
            const found = await getEvent(id);
            if (!found || found.status === 'cancelled') throw new Error('일정 생성이 충돌했어. 다시 동기화해줘.');
            return found;
          }
        },
        update: async (event: GoogleEvent, task: TaskRow) => google<GoogleEvent>(token, `${path}/${encodeURIComponent(event.id)}`, {
          method: 'PATCH', headers: event.etag ? {'If-Match': event.etag} : {}, body: JSON.stringify(eventBody(task, event)),
        }),
        remove: async (event: GoogleEvent) => {
          try { await google<void>(token, `${path}/${encodeURIComponent(event.id)}`, {method: 'DELETE', headers: event.etag ? {'If-Match': event.etag} : {}}); }
          catch (error) { if (!(error instanceof GoogleError) || ![404, 410].includes(error.status)) throw error; }
        },
      };
      const result = await synchronize(store, api);
      const now = new Date().toISOString();
      if (!result.more) must(await admin.from('google_calendar_connections').update({last_synced_at: now}).eq('owner_id', owner));
      return json(req, {...result, lastSyncedAt: result.more ? connection.last_synced_at : now});
    } finally {
      must(await admin.from('google_calendar_connections').update({lock_id: null, lock_until: null}).eq('owner_id', owner).eq('lock_id', lockId));
    }
  } catch (error) {
    return json(req, {error: error instanceof Error ? error.message : '구글 캘린더 요청에 실패했어.'}, 400);
  }
});
