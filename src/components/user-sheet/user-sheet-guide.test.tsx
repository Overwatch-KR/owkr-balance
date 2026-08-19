import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { UserSheetGuide } from './user-sheet-guide';
import { UserSheetModal } from './user-sheet-modal';
import { UserSheetTour } from './user-sheet-tour';

describe('UserSheetGuide', () => {
    it('시트 운영에 필요한 기준과 편집 규칙을 안내한다', () => {
        const markup = renderToStaticMarkup(
            <UserSheetGuide onClose={vi.fn()} />,
        );

        expect(markup).toContain('유저 시트 전용 가이드');
        expect(markup).toContain('Discord ID가 기준이에요');
        expect(markup).toContain('현재 매칭 명단과는 별도예요');
        expect(markup).toContain('팀 밸런스 계산은 참가자 작업실에 저장된 현재 명단의 티어');
        expect(markup).toContain('특이사항은 모든 관리자와 대진표에 공유');
        expect(markup).toContain('디스코드 표시명');
        expect(markup).toContain('1분마다 자동 확인');
    });

    it('시트 상단에서 가이드와 새로고침을 함께 제공한다', () => {
        const markup = renderToStaticMarkup(
            <UserSheetModal
                csrfToken="csrf-token"
                entries={[]}
                error={null}
                isLoading={false}
                noteCacheScope="user-1"
                participantBattleTags={new Set()}
                onClose={vi.fn()}
                onEntriesChange={vi.fn()}
                onRetry={vi.fn()}
                onSaveError={vi.fn()}
                onSnapshotChange={vi.fn()}
                sheetVersion={0}
            />,
        );

        const guideButtonIndex = markup.indexOf('시트 가이드');
        const refreshButtonIndex = markup.indexOf('새로고침');

        expect(guideButtonIndex).toBeGreaterThan(-1);
        expect(refreshButtonIndex).toBeGreaterThan(guideButtonIndex);
        expect(markup).toContain('aria-label="시트 가이드"');
    });
});

describe('UserSheetTour', () => {
    it('실제 시트 흐름을 7단계 가이드로 시작한다', () => {
        const markup = renderToStaticMarkup(
            <UserSheetTour
                hasEntries
                onComplete={vi.fn()}
                onDismiss={vi.fn()}
                onOpenRules={vi.fn()}
                onStepChange={vi.fn()}
            />,
        );

        expect(markup).toContain('시트 가이드 · 1/7');
        expect(markup).toContain('시트와 현재 매칭 명단을 구분해요');
        expect(markup).toContain('Discord ID');
        expect(markup).toContain('다음');
        expect(markup).toContain('이전');
    });

    it('정적 규칙 화면에서 단계별 가이드를 다시 시작할 수 있다', () => {
        const markup = renderToStaticMarkup(
            <UserSheetGuide onClose={vi.fn()} onStartTour={vi.fn()} />,
        );

        expect(markup).toContain('단계별 가이드 다시 보기');
    });
});
