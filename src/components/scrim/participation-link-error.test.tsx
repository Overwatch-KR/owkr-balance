import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ParticipationLinkError } from './participation-link-error';

describe('ParticipationLinkError', () => {
    it('shows one concise unavailable-link explanation without repeating the server error', () => {
        const serverError = '유효하지 않거나 비활성화된 참여 링크입니다.';
        const markup = renderToStaticMarkup(
            <ParticipationLinkError
                error={serverError}
                isUnavailable
            />,
        );

        expect(markup).toContain('참여할 수 없는 링크입니다');
        expect(markup).toContain('이 링크는 만료되었거나 비활성화되었습니다.');
        expect(markup).not.toContain(serverError);
        expect(markup.match(/class="block"/g)).toHaveLength(2);
    });

    it('keeps an unexpected load error in an accessible alert', () => {
        const markup = renderToStaticMarkup(
            <ParticipationLinkError
                error="서버에 연결하지 못했습니다."
                isUnavailable={false}
            />,
        );

        expect(markup).toContain('참여 링크를 불러오지 못했습니다');
        expect(markup).toContain('role="alert"');
        expect(markup).toContain('서버에 연결하지 못했습니다.');
    });
});
