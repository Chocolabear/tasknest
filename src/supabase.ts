import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

export const configError = Boolean(url) !== Boolean(key)
  ? 'Supabase URL과 Publishable Key를 모두 입력한 뒤 개발 서버를 재시작해줘.'
  : url && !/^https?:\/\/[^\s]+$/.test(url)
    ? 'Supabase URL 형식을 확인해줘. https://프로젝트ID.supabase.co 형태야.'
    : key && (key.startsWith('sb_secret_') || isServiceRoleKey(key))
      ? '비밀 키가 입력됐어. 공개 Publishable Key 또는 anon 키로 바꿔줘.'
      : null;

function isServiceRoleKey(value: string) {
  try {
    const segment = value.split('.')[1];
    return segment ? JSON.parse(atob(segment.replace(/-/g, '+').replace(/_/g, '/'))).role === 'service_role' : false;
  } catch { return false; }
}

export const supabase = url && key && !configError ? createClient(url, key) : null;
