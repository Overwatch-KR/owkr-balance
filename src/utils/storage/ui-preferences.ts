interface UiPreferencesV1 {
    showAllRanks: boolean;
}

const UI_PREFERENCES_KEY = 'owkr_ui_preferences:v1';

const DEFAULT_UI_PREFERENCES: UiPreferencesV1 = {
    showAllRanks: false,
};

/**
 * @description 브라우저에 저장된 UI 환경설정을 안전하게 읽는다.
 */
export const readUiPreferences = (): UiPreferencesV1 => {
    if (typeof localStorage === 'undefined') return DEFAULT_UI_PREFERENCES;

    try {
        const stored = JSON.parse(localStorage.getItem(UI_PREFERENCES_KEY) ?? 'null') as Partial<UiPreferencesV1> | null;
        return {
            showAllRanks: typeof stored?.showAllRanks === 'boolean'
                ? stored.showAllRanks
                : DEFAULT_UI_PREFERENCES.showAllRanks,
        };
    } catch {
        return DEFAULT_UI_PREFERENCES;
    }
};

/**
 * @description 티어 전체 보기 설정을 기존 UI 환경설정과 병합해 저장한다.
 */
export const writeShowAllRanksPreference = (showAllRanks: boolean): void => {
    if (typeof localStorage === 'undefined') return;

    try {
        const preferences = readUiPreferences();
        localStorage.setItem(UI_PREFERENCES_KEY, JSON.stringify({
            ...preferences,
            showAllRanks,
        } satisfies UiPreferencesV1));
    } catch {
        // 저장소 사용이 차단된 환경에서도 화면 설정 변경은 유지한다.
    }
};
