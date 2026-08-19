import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { parseMultipleLines } from '../../../utils/parser';
import RosterPasteTextarea from './roster-paste-textarea';

describe('RosterPasteTextarea', () => {
    it('문제 구간과 참가자 단위 이전·다음 오류 이동 UI를 표시한다', () => {
        const value = [
            'First#1234 다3? / 플2? / 골1',
            'Second#5678 마4? / 마4? / 마1',
        ].join('\n');
        const markup = renderToStaticMarkup(
            <RosterPasteTextarea
                isValidationPending={false}
                issues={parseMultipleLines(value).validationIssues}
                value={value}
                onChange={vi.fn()}
            />,
        );

        expect(markup).toContain('<mark');
        expect(markup).toContain('오류 1/2');
        expect(markup).toContain('First#1234');
        expect(markup).toContain('비선호 역할은 한 개만 지정해 주세요.');
        expect(markup).toContain('aria-label="이전 입력 오류로 이동"');
        expect(markup).toContain('aria-label="다음 입력 오류로 이동"');
        expect(markup).not.toContain('비선호 포지션을 한 개만 남겨 주세요');
    });

    it('오류가 한 개여도 해당 위치로 다시 이동할 수 있다', () => {
        const value = 'Only#1234 다3? / 플2? / 골1';
        const markup = renderToStaticMarkup(
            <RosterPasteTextarea
                isValidationPending={false}
                issues={parseMultipleLines(value).validationIssues}
                value={value}
                onChange={vi.fn()}
            />,
        );

        expect(markup).toContain('오류 1/1');
        expect(markup).toContain('오류 위치로 이동');
        expect(markup).not.toContain('disabled=""');
    });

    it('최신 파서가 거부한 형식 오류도 원문 위치와 안내를 표시한다', () => {
        const value = [
            'Valid#1234 다3 / 플2 / 골1',
            'Broken#123 다3 / 플2 / 골1',
        ].join('\n');
        const markup = renderToStaticMarkup(
            <RosterPasteTextarea
                isValidationPending={false}
                issues={parseMultipleLines(value).validationIssues}
                value={value}
                onChange={vi.fn()}
            />,
        );

        expect(markup).toContain('<mark');
        expect(markup).toContain('Broken#123');
        expect(markup).toContain('배틀태그는 Player#1234 형식으로 입력해 주세요.');
        expect(markup).toContain('오류 위치로 이동');
    });
});
