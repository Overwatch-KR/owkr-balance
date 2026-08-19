import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ParticipationClosed } from './participation-closed';

describe('ParticipationClosed', () => {
    it('shows the expired mascot and vote closure copy', () => {
        const markup = renderToStaticMarkup(<ParticipationClosed kind="vote" />);

        expect(markup).toContain('/mascot/dou-link-expired.svg');
        expect(markup).toContain('영웅 밴 투표가 마감되었습니다.');
        expect(markup).toContain('투표 결과는 관리자 확인 후 최종 확정됩니다.');
    });

    it('shows satisfaction closure copy', () => {
        const markup = renderToStaticMarkup(<ParticipationClosed kind="satisfaction" />);

        expect(markup).toContain('만족도 조사 기간이 종료되었습니다.');
        expect(markup).toContain('관리자가 기간을 연장하면 같은 링크로 다시 참여할 수 있습니다.');
    });
});
