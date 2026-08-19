import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { pickRandomBackgroundIndex } from './login-background';
import LoginScreen from './login-screen';

describe('LoginScreen', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('배경 효과를 화면 안에 고정하고 정책 페이지 링크를 제공한다', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0.5);
        vi.stubGlobal('window', {
            location: {
                hostname: 'localhost',
                search: '',
            },
        });

        const markup = renderToStaticMarkup(<LoginScreen />);
        const footerIndex = markup.indexOf('<footer');

        expect(markup).toContain('min-h-screen overflow-hidden');
        expect(markup).not.toContain('overflow-x-hidden');
        expect(markup.match(/class="login-background(?: login-background-active)?"/g)).toHaveLength(3);
        expect(markup).toContain(
            'class="login-background login-background-active" style="background-image:url(/background/le-sserafim.jpg)"',
        );
        expect(footerIndex).toBeGreaterThan(markup.indexOf('href="/api/auth/login"'));
        expect(markup.slice(footerIndex)).toContain('href="/discord-login-policy"');
    });

    it('다음 배경은 현재 배경과 다른 이미지에서 무작위로 선택한다', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0.5);

        expect(pickRandomBackgroundIndex(1)).toBe(2);
    });
});
