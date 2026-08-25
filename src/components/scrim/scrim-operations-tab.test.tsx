import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ScrimRecord } from '../../../domains/scrim/shared/public';
import { ScrimOperationsTab } from './scrim-operations-tab';

const scrim: ScrimRecord = {
    id: 'scrim-1',
    date: '2026-08-19',
    startTime: '21:00',
    customGameStartsAt: 1,
    satisfactionExpiresAt: 2,
    createdAt: 0,
    createdBy: '관리자',
    rosterSnapshot: [],
    publicLinks: {
        vote: { token: 'vote-token', active: true, createdAt: 0 },
        satisfaction: { token: 'survey-token', active: true, createdAt: 0 },
    },
    usedBanHeroIds: [],
    votes: [],
    satisfactionResponses: [],
};

describe('ScrimOperationsTab pending state', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('비활성화 처리 중인 링크 버튼만 진행 상태로 표시한다', () => {
        vi.stubGlobal('window', { location: { origin: 'https://owkr.example' } });
        const markup = renderToStaticMarkup(
            <ScrimOperationsTab
                onAction={vi.fn()}
                onCopy={vi.fn()}
                pendingActionKey="deactivateLink:vote"
                scrim={scrim}
            />,
        );

        expect(markup).toContain('비활성화 중');
        expect(markup).toContain('disabled=""');
        expect(markup.match(/링크 비활성화/g)).toHaveLength(1);
    });
});
