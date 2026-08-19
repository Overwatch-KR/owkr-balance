import { describe, expect, it } from 'vitest';
import {
    canResumeGuide,
    getGuideStepPosition,
    isValidGuideProgress,
} from './guide-progress';

describe('guide progress', () => {
    it('첫 단계보다 진행된 같은 종류의 가이드만 이어볼 수 있다', () => {
        expect(canResumeGuide({
            stepId: 'start-roster',
            variant: 'start',
            version: 2,
        }, 'start')).toBe(true);
        expect(canResumeGuide({
            stepId: 'start-workspace',
            variant: 'start',
            version: 2,
        }, 'start')).toBe(false);
        expect(canResumeGuide({
            stepId: 'result-alternatives',
            variant: 'result',
            version: 2,
        }, 'start')).toBe(false);
    });

    it('저장 스키마와 단계 식별자를 검증한다', () => {
        expect(isValidGuideProgress({
            stepId: 'result-swap',
            variant: 'result',
            version: 2,
        })).toBe(true);
        expect(isValidGuideProgress({
            stepId: 'missing-step',
            variant: 'result',
            version: 2,
        })).toBe(false);
        expect(isValidGuideProgress({
            stepId: 'result-swap',
            variant: 'result',
            version: 1,
        })).toBe(false);
    });

    it('현재 단계와 전체 단계 수를 계산한다', () => {
        expect(getGuideStepPosition('result', 'result-alternatives')).toEqual({
            current: 4,
            total: 6,
        });
    });
});
