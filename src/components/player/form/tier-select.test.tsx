import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createDefaultPlayerInputs } from '../../../hooks/use-player-input';
import TierSelect from './tier-select';

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
    it('에메랄드와 디비전 선택을 항상 표시한다', () => {
        const markup = renderTierSelect();

        expect(markup).toContain('value="EMERALD"');
        expect(markup).toContain('에메랄드');
        expect(markup).toContain('/tier/platinum.png');
        expect(markup).toContain('name="s-division"');
        expect(markup).toContain('aria-label="힐러 등급"');
    });

    it('미배치를 선택하면 중립 상태를 표시하고 디비전 선택을 숨긴다', () => {
        const markup = renderToStaticMarkup(
            <TierSelect
                prefix="s"
                label="힐러"
                prefKey="sPref"
                avoidKey="sAvoid"
                inputs={{ ...createDefaultPlayerInputs(), sTier: 'UNRANKED', sDiv: '0' }}
                setInputs={() => undefined}
            />,
        );

        expect(markup).toContain('data-tier-state="unranked"');
        expect(markup).toContain('value="UNRANKED" selected=""');
        expect(markup).toContain('미배치');
        expect(markup).toContain('lucide-shield-question-mark');
        expect(markup).not.toContain('name="s-division"');
    });
});
