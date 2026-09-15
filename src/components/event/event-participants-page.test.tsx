import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { EventParticipantsPage } from './event-participants-page';

describe('EventParticipantsPage loading state', () => {
    it('최초 로딩 중에는 수동 새로고침 아이콘을 회전시키지 않는다', () => {
        const queryClient = new QueryClient({
            defaultOptions: { queries: { retry: false } },
        });
        const markup = renderToStaticMarkup(
            <QueryClientProvider client={queryClient}>
                <EventParticipantsPage csrfToken="csrf" userId="admin-1" />
            </QueryClientProvider>,
        );
        const refreshButton = markup.match(/<button[^>]*>.*?새로고침<\/button>/s)?.[0] ?? '';

        expect(markup).toContain('새로고침');
        expect(markup).toContain('이벤트 참여자를 불러오는 중…');
        expect(refreshButton).not.toContain('animate-spin');
    });

    it('캐시된 명단이 있으면 재진입 시 로딩 화면 대신 기존 내용을 바로 보여준다', () => {
        const queryClient = new QueryClient({
            defaultOptions: { queries: { retry: false } },
        });
        queryClient.setQueryData(['event-participants', 'admin-1'], {
            candidates: [],
            participantIds: [],
            updatedAt: '2026-09-15T00:00:00.000Z',
        });

        const markup = renderToStaticMarkup(
            <QueryClientProvider client={queryClient}>
                <EventParticipantsPage csrfToken="csrf" userId="admin-1" />
            </QueryClientProvider>,
        );

        expect(markup).toContain('저장된 이벤트 참여자가 없습니다.');
        expect(markup).not.toContain('이벤트 참여자를 불러오는 중…');
    });
});
