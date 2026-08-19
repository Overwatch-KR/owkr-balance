import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { AppHeader } from './app-header';
import type { DataMode } from '../../hooks/use-auth';

const renderHeader = (authMode: 'discord' | 'local', dataMode: DataMode = 'remote'): string => (
    renderToStaticMarkup(
        <AppHeader
            authMode={authMode}
            dataMode={dataMode}
            isGuideOpen={false}
            isLoggingOut={false}
            isUserSheetOpen={false}
            onLogout={vi.fn()}
            onOpenGuide={vi.fn()}
            onOpenScrims={vi.fn()}
            onOpenUserSheet={vi.fn()}
            userName="테스트 관리자"
            userSheetHasError={false}
        />,
    )
);

describe('AppHeader authentication mode', () => {
    it('로컬 모드에서는 인증 배지를 표시하고 로그아웃을 숨긴다', () => {
        const markup = renderHeader('local');

        expect(markup).toContain('로컬 인증');
        expect(markup).toContain('연결된 Redis의 변경 사항이 즉시 반영됩니다.');
        expect(markup).not.toContain('aria-label="로그아웃"');
    });

    it('Discord 모드에서는 기존 로그아웃 동작을 유지한다', () => {
        const markup = renderHeader('discord');

        expect(markup).not.toContain('로컬 인증');
        expect(markup).toContain('aria-label="로그아웃"');
    });

    it('로컬 전용 모드에서는 원격 저장소를 사용하지 않는다는 배지를 표시한다', () => {
        const markup = renderHeader('local', 'local');

        expect(markup).toContain('로컬 전용');
        expect(markup).toContain('원격 Redis에 연결하지 않고');
        expect(markup).not.toContain('연결된 Redis의 변경 사항이 즉시 반영됩니다.');
    });
});
