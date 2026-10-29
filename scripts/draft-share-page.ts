import type { Plugin } from 'vite';

const TITLE = '내전 밴픽 | OWKR Match';
const DESCRIPTION = '초대받은 내전에서 팀을 확인하고 맵 선정과 영웅 밴에 참여하세요.';
const IMAGE_URL = 'https://owkr-internal-balance.vercel.app/og/draft-v3.png';
const IMAGE_ALT = 'OWKR 내전 밴픽 · 맵과 세 영웅의 밴 확정 구성 예시';

/** @description 방 데이터나 코드를 조회하지 않고 크롤러가 읽을 밴픽 초대 정보를 HTML에 넣는다. */
export function buildDraftShareHtml(html: string): string {
    return html
        .replace(/<title>[^<]*<\/title>/, `<title>${TITLE}</title>`)
        .replace(/<meta\s+name="description"\s+content="[^"]*"\s*\/?>/, `<meta name="description" content="${DESCRIPTION}" />`)
        .replace(/<meta\s+(?:property|name)="(?:og:|twitter:)[^"]*"[^>]*>\s*/g, '')
        .replace('</head>', `    <meta name="robots" content="noindex" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="OWKR Match" />
    <meta property="og:locale" content="ko_KR" />
    <meta property="og:title" content="${TITLE}" />
    <meta property="og:description" content="${DESCRIPTION}" />
    <meta property="og:image" content="${IMAGE_URL}" />
    <meta property="og:image:type" content="image/png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="${IMAGE_ALT}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${TITLE}" />
    <meta name="twitter:description" content="${DESCRIPTION}" />
    <meta name="twitter:image" content="${IMAGE_URL}" />
    <meta name="twitter:image:alt" content="${IMAGE_ALT}" />
  </head>`);
}

/** @description 번들링된 같은 앱 진입점을 복제해 실제 방 URL과 참가 동작을 그대로 유지한다. */
export const draftSharePagePlugin = (): Plugin => ({
    name: 'draft-share-page',
    apply: 'build',
    enforce: 'post',
    generateBundle: {
        order: 'post',
        handler(_options, bundle) {
            const entry = bundle['index.html'];
            if (!entry || entry.type !== 'asset' || typeof entry.source !== 'string') {
                throw new Error('밴픽 공유 진입점의 원본 HTML을 찾지 못했습니다.');
            }
            this.emitFile({ type: 'asset', fileName: 'draft.html', source: buildDraftShareHtml(entry.source) });
        },
    },
});
