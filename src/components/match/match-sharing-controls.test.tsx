import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MatchLiveSessionSnapshot } from '#domain/balance';
import { MatchLiveControls } from './match-live-controls';
import { MatchShareControls } from './match-share-controls';

const liveSession: MatchLiveSessionSnapshot = {
    code: 'LIVE234567',
    participants: [],
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

        expect(markup).toContain('실시간 대진표 공유');
        expect(markup).toContain('수정 중 약 0.5초 간격');
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

        expect(markup).toContain('읽기 전용 결과 공유');
        expect(markup).toContain('이후 수정은 동기화되지 않습니다.');
        expect(markup.match(/READ234567/g)).toHaveLength(1);
        expect(markup).toContain('placeholder="읽기 전용 코드 10자리"');
    });
});
