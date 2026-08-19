import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ScrimManagerGuide } from './scrim-manager-guide';

describe('ScrimManagerGuide', () => {
    it('관리자용 내전 운영 흐름만 안내한다', () => {
        const markup = renderToStaticMarkup(
            <ScrimManagerGuide onClose={vi.fn()} />,
        );

        expect(markup).toContain('내전 관리 가이드');
        expect(markup).toContain('먼저 내전과 로스터를 등록해요');
        expect(markup).toContain('참여 링크는 운영 화면에서 관리해요');
        expect(markup).toContain('공개 참여 화면의 사용 방법은 이 관리자 가이드에 포함하지 않습니다.');
        expect(markup).toContain('삭제는 마지막에 신중히 진행해요');
    });
});
