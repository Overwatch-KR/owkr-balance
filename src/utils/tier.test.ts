import { describe, expect, it } from 'vitest';
import { getTierImage } from './tier';

describe('getTierImage', () => {
    it('에메랄드 이미지 경로를 티어 코드에서 만든다', () => {
        expect(getTierImage('EMERALD')).toContain('/tier/emerald.png');
    });
});
