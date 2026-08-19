import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DOU_MASCOT_VARIANTS, DouMascot } from './dou-mascot';

describe('DouMascot', () => {
    it.each(DOU_MASCOT_VARIANTS)('renders the %s asset', variant => {
        const markup = renderToStaticMarkup(<DouMascot variant={variant} alt="도우" />);

        expect(markup).toContain(`/mascot/dou-${variant}.svg`);
        expect(markup).toContain('alt="도우"');
    });

    it('hides decorative mascots from assistive technology', () => {
        const markup = renderToStaticMarkup(<DouMascot decorative />);

        expect(markup).toContain('aria-hidden="true"');
        expect(markup).toContain('alt=""');
    });
});
