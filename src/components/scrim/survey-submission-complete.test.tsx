import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SurveySubmissionComplete } from './survey-submission-complete';

describe('SurveySubmissionComplete', () => {
    it('shows the success mascot, completion copy, and a home link', () => {
        const markup = renderToStaticMarkup(<SurveySubmissionComplete />);

        expect(markup).toContain('/mascot/dou-success.svg');
        expect(markup).toContain('설문 제출이 완료되었습니다.');
        expect(markup).toContain('소중한 의견 감사합니다.');
        expect(markup).toContain('이미 참여한 설문입니다.');
        expect(markup).toContain('href="/"');
        expect(markup).toContain('홈으로 이동');
    });

    it('shows vote-specific completion copy after a hero ban vote', () => {
        const markup = renderToStaticMarkup(<SurveySubmissionComplete kind="vote" />);

        expect(markup).toContain('영웅 밴 투표가 완료되었습니다.');
        expect(markup).toContain('선택한 영웅이 밴 투표에 반영되었습니다.');
        expect(markup).toContain('이미 참여한 투표입니다.');
    });
});
