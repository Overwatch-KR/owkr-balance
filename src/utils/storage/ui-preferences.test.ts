import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    readUiPreferences,
    writeShowAllRanksPreference,
    writeShowSheetNotesPreference,
} from './ui-preferences';

class MemoryStorage {
    private readonly values = new Map<string, string>();

    getItem(key: string): string | null {
        return this.values.get(key) ?? null;
    }

    setItem(key: string, value: string): void {
        this.values.set(key, value);
    }
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('UI preferences', () => {
    it('티어 전체 보기 설정을 브라우저에서 복원한다', () => {
        const storage = new MemoryStorage();
        vi.stubGlobal('localStorage', storage);

        writeShowAllRanksPreference(true);

        expect(readUiPreferences()).toEqual({
            showAllRanks: true,
            showSheetNotes: true,
        });
    });

    it('공용 특이사항 표시 설정을 다른 UI 설정과 함께 보존한다', () => {
        const storage = new MemoryStorage();
        vi.stubGlobal('localStorage', storage);

        writeShowAllRanksPreference(true);
        writeShowSheetNotesPreference(false);

        expect(readUiPreferences()).toEqual({
            showAllRanks: true,
            showSheetNotes: false,
        });
    });

    it('손상된 저장값은 기본 설정으로 복구한다', () => {
        const storage = new MemoryStorage();
        storage.setItem('owkr_ui_preferences:v1', '{invalid');
        vi.stubGlobal('localStorage', storage);

        expect(readUiPreferences()).toEqual({
            showAllRanks: false,
            showSheetNotes: true,
        });
    });
});
