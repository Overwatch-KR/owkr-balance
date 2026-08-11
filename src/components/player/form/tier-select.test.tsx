import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EMERALD_RELEASE_AT } from '../../../constants';
import { createDefaultPlayerInputs } from '../../../hooks/use-player-input';
import TierSelect from './tier-select';

afterEach(() => vi.useRealTimers());

const renderTierSelect = () => renderToStaticMarkup(
    <TierSelect
        prefix="s"
        label="힐러"
        prefKey="sPref"
        avoidKey="sAvoid"
        inputs={createDefaultPlayerInputs()}
        setInputs={() => undefined}
    />,
);

describe('TierSelect', () => {
    it('활성화 전에는 에메랄드를 선택지에 표시하지 않는다', () => {
        vi.useFakeTimers();
        vi.setSystemTime(EMERALD_RELEASE_AT - 1);

        expect(renderTierSelect()).not.toContain('value="EMERALD"');
    });

    it('활성화 시각부터 에메랄드와 디비전 선택을 표시한다', () => {
        vi.useFakeTimers();
        vi.setSystemTime(EMERALD_RELEASE_AT);
        const markup = renderTierSelect();

        expect(markup).toContain('value="EMERALD"');
        expect(markup).toContain('에메랄드');
        expect(markup).toContain('/tier/platinum.png');
        expect(markup).toContain('name="s-division"');
        expect(markup).toContain('aria-label="힐러 등급"');
    });
});
