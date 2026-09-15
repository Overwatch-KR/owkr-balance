import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MatchLiveSessionSnapshot } from '#domain/balance';
import { MatchLiveControls } from './match-live-controls';
import { MatchShareControls } from './match-share-controls';
import { MatchSharingPanel } from './match-sharing-panel';

const liveSession: MatchLiveSessionSnapshot = {
    code: 'LIVE234567',
    collaborators: [{
        userId: 'discord-admin-1',
        displayName: '관리자 A',
        lastSeenAt: 1,
    }],
    participants: [],
    recentChange: null,
    revision: 7,
    updatedAt: 1,
};

const storageItems = new Map<string, string>();

describe('match sharing controls', () => {
    beforeEach(() => {
        storageItems.clear();
        vi.stubGlobal('localStorage', {
            getItem: vi.fn((key: string) => storageItems.get(key) ?? null),
            removeItem: vi.fn((key: string) => storageItems.delete(key)),
            setItem: vi.fn((key: string, value: string) => storageItems.set(key, value)),
        });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('실시간 공유가 새로고침 후 자동 재연결됨을 안내한다', () => {
        const markup = renderToStaticMarkup(
            <MatchLiveControls
                canStart
                isConnected
                isConnecting={false}
                isPublishing={false}
                isRemote
                session={liveSession}
                syncError=""
                onStart={vi.fn()}
                onJoin={vi.fn()}
                onLeave={vi.fn()}
            />,
        );

        expect(markup).toContain('함께 편집');
        expect(markup).toContain('명단·팀 변경을 자동으로 맞춥니다.');
        expect(markup).toContain('새로고침해도 이 브라우저에서 자동으로 다시 연결됩니다.');
        expect(markup.match(/LIVE234567/g)).toHaveLength(1);
    });

    it('자동 재연결 오류도 연결 전 화면에서 확인할 수 있다', () => {
        const markup = renderToStaticMarkup(
            <MatchLiveControls
                canStart
                isConnected={false}
                isConnecting={false}
                isPublishing={false}
                isRemote
                session={null}
                syncError="다시 연결하지 못했습니다."
                onStart={vi.fn()}
                onJoin={vi.fn()}
                onLeave={vi.fn()}
            />,
        );

        expect(markup).toContain('다시 연결하지 못했습니다.');
        expect(markup).toContain('실시간 참여');
    });

    it('생성 코드와 불러오기 입력을 분리해 같은 코드를 중복 표시하지 않는다', () => {
        storageItems.set('owkr_match_share_created:admin-1', JSON.stringify({
            data: 'READ234567',
            expiry: Date.now() + 60_000,
            storedAt: Date.now(),
            version: 2,
        }));

        const markup = renderToStaticMarkup(
            <MatchShareControls
                canCreate
                isRemote
                userId="admin-1"
                onCreate={vi.fn()}
                onImport={vi.fn()}
            />,
        );

        expect(markup).toContain('결과 전달');
        expect(markup).toContain('24시간 동안 읽기 전용으로 전달합니다.');
        expect(markup.match(/READ234567/g)).toHaveLength(1);
        expect(markup).toContain('placeholder="읽기 전용 코드 10자리"');
    });

    it('두 공유 방식을 접힌 보조 영역으로 묶고 연결 상태만 먼저 보여준다', () => {
        const markup = renderToStaticMarkup(
            <MatchSharingPanel
                canCreateSnapshot
                canStartLive
                isLiveConnected
                isLiveConnecting={false}
                isLivePublishing={false}
                isRemote
                liveSession={liveSession}
                liveSyncError=""
                userId="admin-1"
                onCreateSnapshot={vi.fn()}
                onImportSnapshot={vi.fn()}
                onJoinLive={vi.fn()}
                onLeaveLive={vi.fn()}
                onStartLive={vi.fn()}
            />,
        );

        expect(markup).toContain('<details');
        expect(markup).toContain('<summary');
        expect(markup).toContain('LIVE234567 · 1명 연결 · 동기화됨');
        expect(markup).toContain('함께 편집');
        expect(markup).toContain('결과 전달');
    });
});
