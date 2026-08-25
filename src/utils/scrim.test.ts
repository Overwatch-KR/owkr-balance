import { describe, expect, it } from 'vitest';
import {
    formatRemainingDuration,
} from './scrim';

describe('scrim presentation helpers', () => {
    it('formats the remaining voting time down to seconds', () => {
        expect(formatRemainingDuration(3_661_001)).toBe('1시간 01분 02초');
        expect(formatRemainingDuration(61_000)).toBe('01분 01초');
        expect(formatRemainingDuration(0)).toBe('00분 00초');
    });
});
