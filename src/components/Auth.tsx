import { useState, type FormEvent } from 'react';
import { Sprout } from 'lucide-react';
import { supabase } from '../supabase';

export function Auth() {
  const [mode, setMode] = useState<'login' | 'signup' | 'reset'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage('');
    try {
      if (mode === 'reset') {
        const { error } = await supabase!.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
        if (error) throw error;
        setMessage('비밀번호 재설정 메일을 확인해줘.');
      } else if (mode === 'signup') {
        const { data, error } = await supabase!.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } });
        if (error) throw error;
        if (!data.session) setMessage('메일함에서 인증 링크를 눌러줘. 이미 가입했다면 로그인해줘.');
      } else {
        const { error } = await supabase!.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : '로그인 요청에 실패했어.'); }
    finally { setBusy(false); }
  }
  return <main className="auth-page"><section className="auth-card">
    <div className="brand"><Sprout size={30} /><span>tasknest<span className="brand-dot">.</span></span></div>
    <p className="eyebrow">SMALL STEPS, REAL PROGRESS</p><h1>생각을 연결하고,<br />하나씩 완성해.</h1>
    <p className="muted">같은 계정으로 로그인하면 어디서든 이어서 쓸 수 있어.</p>
    <form onSubmit={submit}><fieldset disabled={busy}>
      <label>이메일<input autoFocus type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} /></label>
      {mode !== 'reset' && <label>비밀번호<input type="password" minLength={8} required autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={password} onChange={e => setPassword(e.target.value)} /></label>}
      <button className="button primary full">{busy ? '처리 중…' : mode === 'signup' ? '회원가입' : mode === 'reset' ? '재설정 메일 보내기' : '로그인'}</button>
    </fieldset></form>
    <div className="auth-actions"><button onClick={() => { setMode(mode === 'signup' ? 'login' : 'signup'); setMessage(''); }}>{mode === 'signup' ? '로그인으로 돌아가기' : '회원가입'}</button><button onClick={() => { setMode(mode === 'reset' ? 'login' : 'reset'); setMessage(''); }}>{mode === 'reset' ? '로그인' : '비밀번호 찾기'}</button></div>
    {message && <p className="notice" role="status">{message}</p>}
  </section></main>;
}

export function PasswordRecovery({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  return <main className="auth-page"><section className="auth-card"><h1>새 비밀번호 설정</h1>
    <form onSubmit={async e => {
      e.preventDefault(); setBusy(true);
      try { const { error } = await supabase!.auth.updateUser({ password }); if (error) throw error; onDone(); }
      catch (err) { setMessage(err instanceof Error ? err.message : '변경에 실패했어.'); }
      finally { setBusy(false); }
    }}><label>새 비밀번호<input type="password" autoComplete="new-password" required minLength={8} value={password} onChange={e => setPassword(e.target.value)} /></label><button disabled={busy} className="button primary">비밀번호 변경</button></form>
    {message && <p role="alert">{message}</p>}
  </section></main>;
}
