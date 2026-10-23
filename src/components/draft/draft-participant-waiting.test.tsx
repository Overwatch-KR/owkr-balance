import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DraftParticipantWaiting } from './draft-participant-waiting';

describe('participant admission screen', () => {
  it('shows successful login while waiting for a roster without a ready or voting action', () => {
    const html = renderToStaticMarkup(<DraftParticipantWaiting admission={{ status: 'WAITING', displayName: '하늘', participantCount: 4 }} error="" login={() => {}} />);
    expect(html).toContain('Discord 로그인 완료'); expect(html).toContain('내전 시작을 기다리고 있습니다');
    expect(html).toContain('자동으로 입장'); expect(html).toContain('4');
    expect(html).not.toContain('준비 완료'); expect(html).not.toContain('투표하기');
  });
  it('shows exclusion rather than a new login requirement when the ten-player roster omits the account', () => {
    const html = renderToStaticMarkup(<DraftParticipantWaiting admission={{ status: 'EXCLUDED', displayName: '하늘', participantCount: 10 }} error="" login={() => {}} />);
    expect(html).toContain('이번 내전 명단에 포함되지 않았습니다'); expect(html).toContain('Discord 로그인 완료');
    expect(html).toContain('다른 Discord 계정');
  });
});
