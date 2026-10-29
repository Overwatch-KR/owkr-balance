import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PHOTO = await sharp(path.join(ROOT, 'public/draft-assets/maps/kings-row.webp'))
    .resize(500, 170, { fit: 'cover' }).png().toBuffer();
const BANS = [
    { asset: 'support/ana', name: '아나', team: '1팀', color: '#ef4444', text: '#fca5a5' },
    { asset: 'damage/widowmaker', name: '위도우메이커', team: '2팀', color: '#3b82f6', text: '#93c5fd' },
    { asset: 'support/kiriko', name: '키리코', team: '1팀', color: '#ef4444', text: '#fca5a5' },
];
const portraits = await Promise.all(BANS.map(async ban =>
    sharp(path.join(ROOT, `public/hero/${ban.asset}.webp`)).resize(104, 104, { fit: 'cover' }).png().toBuffer()));
const logo = await sharp(path.join(ROOT, 'public/favicon.svg')).resize(54, 54).png().toBuffer();
const slotX = index => 650 + index * 174;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
<defs><clipPath id="map"><rect x="644" y="185" width="500" height="170" rx="4"/></clipPath>
${BANS.map((_, index) => `<clipPath id="hero${index}"><rect x="${slotX(index) + 4}" y="418" width="104" height="104" rx="3"/></clipPath>`).join('')}</defs>
<rect width="1200" height="630" fill="#0b0d11"/>
<path d="M56 124H1144M600 170V581M56 600H1144" stroke="#292c32"/>
<image href="data:image/png;base64,${PHOTO.toString('base64')}" x="644" y="185" width="500" height="170" clip-path="url(#map)"/>
<rect x="644" y="297" width="500" height="58" fill="#05070a" fill-opacity="0.64"/>
<rect x="644" y="185" width="500" height="170" rx="4" fill="none" stroke="#40444a"/>
${BANS.map((ban, index) => `<rect x="${slotX(index)}" y="414" width="112" height="112" rx="5" fill="${ban.color}" fill-opacity="0.1" stroke="${ban.color}" stroke-opacity="0.7" stroke-width="2"/>
<image href="data:image/png;base64,${portraits[index].toString('base64')}" x="${slotX(index) + 4}" y="418" width="104" height="104" clip-path="url(#hero${index})"/>
<path d="M${slotX(index) + 85} 498h23v24h-24v-23Z" fill="#000" fill-opacity="0.85"/>
<circle cx="${slotX(index) + 97}" cy="510" r="6" fill="none" stroke="#fca5a5" stroke-width="1.5"/>
<path d="m${slotX(index) + 93} 506 8 8" stroke="#fca5a5" stroke-width="1.5"/>
<path d="M${slotX(index) - 8} 568h128" stroke="${ban.color}" stroke-width="4"/>
<circle cx="${slotX(index) + 56}" cy="568" r="11" fill="#0b0d11" stroke="${ban.color}"/>`).join('')}
${[69, 190, 338].map(x => `<circle cx="${x}" cy="437" r="12" fill="none" stroke="#46525c"/><path d="m${x - 5} 437 4 4 7-8" stroke="#8995a3" fill="none" stroke-width="1.5"/>`).join('')}
<circle cx="484" cy="437" r="12" fill="#102834" stroke="#4cc3f1"/>
<path d="M987 375h14" stroke="#ef4444" stroke-width="3"/><path d="M1072 375h14" stroke="#3b82f6" stroke-width="3"/>
</svg>`;

/** @description 승인된 배너 구도에 실제 밴 결과의 팀 색상·확정 아이콘·순서 표시를 조합한다. */
async function textOverlay(text, left, top, size, color = '#f1f3f7', weight = 'Bold', centered = false) {
    const input = await sharp({ text: {
        text: `<span foreground="${color}">${text}</span>`, font: `Pretendard ${weight} ${size}`,
        fontfile: path.join(ROOT, `public/fonts/Pretendard-${weight}.woff2`), rgba: true, dpi: 72,
    } }).png().toBuffer();
    const width = (await sharp(input).metadata()).width;
    return { input, left: centered ? Math.round(left - width / 2) : left, top };
}
const layers = [
    { input: logo, left: 56, top: 38 },
    await textOverlay('OWKR MATCH', 126, 44, 26),
    await textOverlay('내전 운영', 127, 80, 17, '#8c95a2', 'Medium'),
    await textOverlay('내전 밴픽', 56, 213, 78),
    await textOverlay('맵을 고르고,', 61, 326, 30, '#b2bbc8', 'Medium'),
    await textOverlay('영웅 밴을 정하세요.', 61, 370, 30, '#b2bbc8', 'Medium'),
    await textOverlay('준비', 91, 428, 17, '#8c95a2', 'Medium'),
    await textOverlay('맵 투표', 212, 428, 17, '#8c95a2', 'Medium'),
    await textOverlay('밴 투표', 360, 428, 17, '#8c95a2', 'Medium'),
    await textOverlay('4', 480, 430, 14, '#8addf7', 'Medium'),
    await textOverlay('결과', 506, 428, 17, '#b1eafa', 'SemiBold'),
    await textOverlay('맵 선정', 644, 157, 19, '#a4adba', 'Medium'),
    await textOverlay('왕의 길', 660, 318, 22),
    await textOverlay('밴 확정', 644, 367, 20, '#c9d0da', 'SemiBold'),
    await textOverlay('1팀', 1008, 366, 15, '#fca5a5', 'Medium'),
    await textOverlay('2팀', 1093, 366, 15, '#93c5fd', 'Medium'),
    await textOverlay('OWKR MATCH CONTROL', 57, 615, 12, '#707b89', 'Medium'),
    await textOverlay('화면 구성 예시', 1041, 615, 12, '#707b89', 'Medium'),
];
for (const [index, ban] of BANS.entries()) {
    layers.push(await textOverlay(`BAN 0${index + 1}`, slotX(index) + 56, 396, 11, '#7f8a99', 'SemiBold', true));
    layers.push(await textOverlay(ban.name, slotX(index) + 56, 536, 17, '#e7ebf0', 'SemiBold', true));
    layers.push(await textOverlay(String(index + 1), slotX(index) + 56, 561, 12, ban.text, 'SemiBold', true));
}
await mkdir(path.join(ROOT, 'public/og'), { recursive: true });
await sharp(Buffer.from(svg)).composite(layers).png({ compressionLevel: 9 })
    .toFile(path.join(ROOT, 'public/og/draft-v3.png'));
