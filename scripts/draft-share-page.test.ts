import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildDraftShareHtml } from './draft-share-page';

describe('draft link preview', () => {
    const entry = '<html><head><title>OWKR Match</title><meta name="description" content="기존 설명" /><script type="module" crossorigin src="/assets/app-HASH.js"></script><link rel="icon" href="/favicon.svg" /></head><body><div id="root"></div></body></html>';
    it('exposes absolute image metadata before JavaScript without replacing the bundled app', () => {
        const html = buildDraftShareHtml(entry);
        expect(html).toContain('<meta property="og:title" content="내전 밴픽 | OWKR Match"');
        expect(html).toContain('content="https://owkr-internal-balance.vercel.app/og/draft-v3.png"');
        expect(html).toContain('content="1200"');
        expect(html).toContain('content="630"');
        expect(html).toContain('name="twitter:card" content="summary_large_image"');
        expect(html).toContain('src="/assets/app-HASH.js"');
        expect(html).toContain('<div id="root"></div>');
        expect(html).not.toContain('og:url');
    });
    it('replaces stale preview metadata without duplicate images or a discarded room redirect', () => {
        const html = buildDraftShareHtml(buildDraftShareHtml(entry));
        expect(html.match(/property="og:image"/g)).toHaveLength(1);
        expect(html).not.toContain('http-equiv="refresh"');
        expect(html).not.toContain('og:updated_time');
    });
    it('routes real room URLs to the same app entry instead of an image-only page', () => {
        const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
        expect(config.rewrites.find((route: { source: string }) => route.source === '/draft/:roomCode').destination).toBe('/draft.html');
        expect(config.rewrites.find((route: { source: string }) => route.source === '/draft-control').destination).toBe('/draft.html');
        expect(config.rewrites.find((route: { source: string }) => route.source === '/participants').destination).toBe('/index.html');
    });
});
