import { useEffect, useState } from 'react';
import type { Task } from './types';
import { todayInSeoul } from './calendar';
export type DisplaySettings = { history: 'all' | 'today' | 'year' | 'custom'; startDate: string; calendarMode: 'titles' | 'dots' };
export const defaults: DisplaySettings = { history: 'year', startDate: '', calendarMode: 'titles' };
export function cutoffDate(settings: DisplaySettings, today = todayInSeoul()): string {
  return settings.history === 'today' ? today : settings.history === 'year' ? `${today.slice(0, 4)}-01-01` : settings.history === 'custom' ? settings.startDate : '';
}
export function withinRange(task: Task, cutoff: string): boolean { return !cutoff || !task.due_date || task.due_date >= cutoff; }
export function useDisplaySettings(owner: string) {
  const key = `tasknest:display:v1:${owner}`;
  const [settings, setSettings] = useState<DisplaySettings>(() => {
    try {
      const value = JSON.parse(localStorage.getItem(key) ?? '{}');
      return { history: ['all','today','year','custom'].includes(value.history) ? value.history : defaults.history,
        startDate: /^\d{4}-\d{2}-\d{2}$/.test(value.startDate ?? '') ? value.startDate : '',
        calendarMode: value.calendarMode === 'dots' ? 'dots' : 'titles' };
    } catch { return defaults; }
  });
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(settings)); } catch { /* Storage may be unavailable. */ } }, [key, settings]);
  return [settings, setSettings] as const;
}
