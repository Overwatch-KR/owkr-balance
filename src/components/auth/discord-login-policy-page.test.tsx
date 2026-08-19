import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DiscordLoginPolicyPage } from './discord-login-policy-page';

describe('DiscordLoginPolicyPage', () => {
    it('관리자 인증에 사용하는 정보와 이용 범위를 안내한다', () => {
        const markup = renderToStaticMarkup(<DiscordLoginPolicyPage />);

        expect(markup).toContain('로그인 화면으로 돌아가기');
        expect(markup).toContain('Discord 로그인 정보 이용 안내');
        expect(markup).toContain('이용 목적');
        expect(markup).toContain('처리하는 정보');
        expect(markup).toContain('Discord 사용자 ID');
        expect(markup).toContain('관리자 목록과 대조');
        expect(markup).toContain('권한 범위와 보관');
        expect(markup).toContain('OAuth 액세스 토큰은 저장하지 않습니다');
        expect(markup).toContain('로그인 세션은 1주일 후');
        expect(markup).toContain('메시지는 조회하지');
    });
});
