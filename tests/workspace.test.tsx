import { expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
vi.mock('../src/supabase', () => ({ supabase: null, configError: null }));
import { Workspace } from '../src/App';

it('프로젝트 생성 → 할 일 추가 → 완료율 상승 → 다시 불러오기를 수행한다', async () => {
  const user = userEvent.setup();
  const app = render(<Workspace ownerId="local" />);
  await user.click(await screen.findByRole('button', { name: '프로젝트 만들기' }));
  await user.type(screen.getByLabelText('프로젝트 이름'), '나의 개발');
  await user.click(screen.getByRole('button', { name: '저장하기' }));
  await user.click(await screen.findByRole('button', { name: '할 일 추가' }));
  await user.type(screen.getByLabelText('할 일 제목'), '로그인 구현');
  await user.click(screen.getByRole('button', { name: '저장하기' }));
  await user.click(await screen.findByRole('button', { name: '로그인 구현 완료 체크' }));
  await waitFor(() => expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('100'));
  app.unmount();
  render(<Workspace ownerId="local" />);
  await screen.findByRole('button', { name: '로그인 구현 완료 해제' });
  expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('100');
});
