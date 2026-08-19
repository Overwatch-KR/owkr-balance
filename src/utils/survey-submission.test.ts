import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    hasSubmittedSurvey,
    hasSubmittedVote,
    markSurveyAsSubmitted,
    markVoteAsSubmitted,
} from './survey-submission';

class MemoryStorage {
    private readonly values = new Map<string, string>();

    get length(): number {
        return this.values.size;
    }

    clear(): void {
        this.values.clear();
    }

    getItem(key: string): string | null {
        return this.values.get(key) ?? null;
    }

    key(index: number): string | null {
        return [...this.values.keys()][index] ?? null;
    }

    removeItem(key: string): void {
        this.values.delete(key);
    }

    setItem(key: string, value: string): void {
        this.values.set(key, value);
    }
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('survey submission storage', () => {
    it('stores a successful submission under the survey-specific key', () => {
        const storage = new MemoryStorage();
        vi.stubGlobal('localStorage', storage);

        expect(markSurveyAsSubmitted('scrim-42')).toBe(true);
        expect(storage.getItem('survey:scrim-42:submitted')).toBe('true');
    });

    it('recognizes a submitted survey after a later page visit', () => {
        const storage = new MemoryStorage();
        storage.setItem('survey:scrim-42:submitted', 'true');
        vi.stubGlobal('localStorage', storage);

        expect(hasSubmittedSurvey('scrim-42')).toBe(true);
        expect(hasSubmittedSurvey('scrim-43')).toBe(false);
    });

    it('keeps the survey usable when browser storage is unavailable', () => {
        vi.stubGlobal('localStorage', {
            getItem: () => {
                throw new Error('storage unavailable');
            },
            setItem: () => {
                throw new Error('storage unavailable');
            },
        });

        expect(hasSubmittedSurvey('scrim-42')).toBe(false);
        expect(markSurveyAsSubmitted('scrim-42')).toBe(false);
    });

    it('stores a successful vote separately from survey completion', () => {
        const storage = new MemoryStorage();
        vi.stubGlobal('localStorage', storage);

        expect(markVoteAsSubmitted('scrim-42')).toBe(true);
        expect(hasSubmittedVote('scrim-42')).toBe(true);
        expect(hasSubmittedSurvey('scrim-42')).toBe(false);
        expect(storage.getItem('vote:scrim-42:submitted')).toBe('true');
    });
});
