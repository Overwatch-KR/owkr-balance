import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useDraftRoom } from '@application/draft/use-draft-room';
import { PublicDraftPage } from './public-draft-page';

vi.mock('@application/draft/use-draft-room', () => ({
  draftRequest: vi.fn(),
  useDraftRoom: vi.fn(() => ({ snapshot: null, error: 'Discord로 참여해 주세요.', reconnect: vi.fn() })),
}));
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

function render(path: string) {
  const url = new URL(path, 'https://site.invalid');
  vi.stubGlobal('window', { location: { href: url.href, pathname: url.pathname } });
  return renderToStaticMarkup(<PublicDraftPage />);
}

describe('participant authentication feedback', () => {
  it('keeps unlisted users on the entry screen with account and roster guidance', () => {
    const markup = render('/draft/ABCDEF2345?draft_error=NOT_PARTICIPANT');
    expect(markup).toContain('role="alert"');
    expect(markup).toContain('Discord에서 배정된 계정으로 전환');
    expect(markup).toContain('운영자에게 명단의 Discord 계정 확인');
    expect(markup).toContain('Discord로 다시 인증');
    expect(useDraftRoom).toHaveBeenCalledWith({ roomCode: null, mode: 'participant' });
  });
  it('requests a new share link when the callback cannot recover a trusted room', () => {
    const markup = render('/draft/auth-error?draft_error=OAUTH_STATE_EXPIRED');
    expect(markup).toContain('공유받은 내전 링크를 다시 열어 주세요');
    expect(markup).not.toContain('Discord로 다시 인증');
    expect(useDraftRoom).toHaveBeenCalledWith({ roomCode: null, mode: 'participant' });
  });
  it('does not show upstream or arbitrary query text as an error', () => {
    const markup = render('/draft/ABCDEF2345?draft_error=private-upstream-details');
    expect(markup).not.toContain('private-upstream-details');
    expect(markup).toContain('잠시 후 다시 인증');
  });
  it('disables authentication for expired rooms and restores normal entry without an error', () => {
    const expired = render('/draft/ABCDEF2345?draft_error=ROOM_EXPIRED');
    expect(expired).toContain('운영자에게 새 공유 링크');
    expect(expired).toContain('disabled=""');
    expect(expired).not.toContain('기존 참가 인증으로 다시 연결');
    const normal = render('/draft/ABCDEF2345');
    expect(normal).toContain('Discord로 이 내전 참여');
    expect(useDraftRoom).toHaveBeenLastCalledWith({ roomCode: 'ABCDEF2345', mode: 'participant' });
  });
});
