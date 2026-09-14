import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { MatchWorkspaceHeader } from './match-workspace-header';

describe('MatchWorkspaceHeader', () => {
    it('현재 명단의 준비 상태를 한 줄로 안내한다', () => {
        const markup = renderToStaticMarkup(
            <MatchWorkspaceHeader
                participantCount={7}
                waitlistCount={2}
                onManageParticipants={vi.fn()}
            />,
        );

        expect(markup).toContain('<h1');
        expect(markup).toContain('대진표');
        expect(markup).toContain('3명 더 필요');
        expect(markup).toContain('대기 2명');
        expect(markup).toContain('명단 관리');
    });

    it('준비 완료 상태를 페이지 상단에 안내한다', () => {
        const markup = renderToStaticMarkup(
            <MatchWorkspaceHeader
                participantCount={10}
                waitlistCount={0}
                onManageParticipants={vi.fn()}
            />,
        );

        expect(markup).toContain('10명 준비 완료');
        expect(markup).toContain('자동 배정 후 선수를 눌러 자리를 바꿀 수 있습니다.');
    });
});
