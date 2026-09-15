import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { DataLoadError } from './data-load-error';

describe('DataLoadError', () => {
    it('연결 오류와 사용자가 실행할 수 있는 재시도 동작을 함께 안내한다', () => {
        const markup = renderToStaticMarkup(
            <DataLoadError
                isRetrying={false}
                message="서버에 연결할 수 없습니다."
                onRetry={vi.fn()}
                title="유저 시트를 불러오지 못했습니다"
            />,
        );

        expect(markup).toContain('role="alert"');
        expect(markup).toContain('유저 시트를 불러오지 못했습니다');
        expect(markup).toContain('서버에 연결할 수 없습니다.');
        expect(markup).toContain('다시 연결');
    });
});
