import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const font = name => path.join(ROOT, `public/fonts/Pretendard-${name}.woff2`);
const photo = await sharp(path.join(ROOT, 'public/draft-assets/maps/kings-row.webp')).resize(816, 528, { fit: 'cover' }).png().toBuffer();
const logo = await readFile(path.join(ROOT, 'public/favicon.svg'));
const portraits = await Promise.all(['tank/roadhog', 'damage/genji', 'support/ana'].map(async name => ({
    image: await sharp(path.join(ROOT, `public/hero/${name}.webp`)).resize(224, 224, { fit: 'cover' }).png().toBuffer(),
})));
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
<defs>
 <radialGradient id="glow"><stop stop-color="#163b50"/><stop offset="1" stop-color="#0a0d12"/></radialGradient>
 <linearGradient id="shade" x2="0" y2="1"><stop stop-color="#0a0d12" stop-opacity="0.08"/><stop offset="1" stop-color="#0a0d12" stop-opacity="0.8"/></linearGradient>
 <clipPath id="map"><rect x="728" y="158" width="408" height="264" rx="18"/></clipPath>
 ${portraits.map((_, i) => `<clipPath id="hero${i}"><rect x="${744 + i * 132}" y="444" width="112" height="112" rx="16"/></clipPath>`).join('')}
</defs>
<rect width="1200" height="630" fill="#0a0d12"/>
<ellipse cx="1040" cy="260" rx="660" ry="550" fill="url(#glow)"/>
<path d="M0 132H1200M680 132V630" stroke="#243342"/>
<image href="data:image/svg+xml;base64,${logo.toString('base64')}" x="64" y="44" width="64" height="64"/>
<rect x="1015" y="56" width="121" height="40" rx="20" fill="#163544" stroke="#28677e"/>
<rect x="718" y="148" width="428" height="284" rx="26" fill="#142330" stroke="#305568"/>
<image href="data:image/png;base64,${photo.toString('base64')}" x="728" y="158" width="408" height="264" preserveAspectRatio="xMidYMid slice" clip-path="url(#map)"/>
<rect x="728" y="158" width="408" height="264" rx="18" fill="url(#shade)"/>
<path d="M750 388H1112" stroke="#4cc3f1" stroke-width="3"/>
${portraits.map(({image}, i) => `<rect x="${744+i*132}" y="444" width="112" height="112" rx="16" fill="#263341"/>
<image href="data:image/png;base64,${image.toString('base64')}" x="${744+i*132}" y="444" width="112" height="112" preserveAspectRatio="xMidYMid slice" clip-path="url(#hero${i})"/>
<rect x="${744+i*132}" y="444" width="112" height="112" rx="16" fill="#0a0d12" opacity="0.25"/>
<path d="M${758+i*132} 540L${842+i*132} 460" stroke="#f27983" stroke-width="5" stroke-linecap="round"/>`).join('')}
<rect x="64" y="470" width="548" height="1" fill="#2a3a49"/>
</svg>`;

/** @description 저장소의 한국어 폰트와 공개 게임 자산으로 개인정보 없는 공통 미리보기를 만든다. */
async function textOverlay(text, left, top, size, color, weight = 'Bold') {
    const image = await sharp({ text: {
        text: `<span foreground="${color}">${text}</span>`, font: `Pretendard ${weight} ${size}`,
        fontfile: font(weight), rgba: true, dpi: 72,
    } }).png().toBuffer();
    return { input: image, left, top };
}
const layers = await Promise.all([
    textOverlay('OWKR MATCH', 148, 52, 26, '#f7f9fc'),
    textOverlay('SCRIM DRAFT', 149, 88, 15, '#8cabbc', 'Medium'),
    textOverlay('참가 링크', 1042, 69, 18, '#8cdef7'),
    textOverlay('내전 밴픽', 64, 214, 80, '#f7f9fc'),
    textOverlay('준비부터 맵·영웅 밴까지', 68, 326, 34, '#4cc3f1', 'SemiBold'),
    textOverlay('팀 확인 → 맵 선정 → 영웅 밴', 68, 402, 24, '#c1cdd8', 'Medium'),
    textOverlay('초대받은 링크에서 참여하세요.', 68, 504, 24, '#8ea3b7', 'Medium'),
    textOverlay('MAP SELECTION', 754, 350, 20, '#f7f9fc'),
]);
await mkdir(path.join(ROOT, 'public/og'), { recursive: true });
await sharp(Buffer.from(svg)).composite(layers).png({ compressionLevel: 9 }).toFile(path.join(ROOT, 'public/og/draft-v1.png'));
