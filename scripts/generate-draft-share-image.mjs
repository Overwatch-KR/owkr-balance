import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** @description 가상 참가자의 실제 밴픽 UI 캡처에 공통 제목만 붙여 공유 이미지를 만든다. */
async function textOverlay(text, left, top, size, color, weight = 'Bold') {
    const input = await sharp({ text: {
        text: `<span foreground="${color}">${text}</span>`, font: `Pretendard ${weight} ${size}`,
        fontfile: path.join(ROOT, `public/fonts/Pretendard-${weight}.woff2`), rgba: true, dpi: 72,
    } }).png().toBuffer();
    return { input, left, top };
}

const logo = await sharp(path.join(ROOT, 'public/favicon.svg')).resize(52, 52).png().toBuffer();
const selection = await sharp(path.join(ROOT, 'scripts/assets/draft-vote-ui.png')).png().toBuffer();
const layers = [
    { input: logo, left: 24, top: 24 },
    await textOverlay('OWKR 내전 밴픽', 94, 31, 36, '#f7f9fc'),
    await textOverlay('영웅 밴 투표', 1014, 43, 20, '#a3adb9', 'Medium'),
    { input: selection, left: 24, top: 112 },
    await textOverlay('참가 화면 예시', 26, 607, 16, '#8995a5', 'Medium'),
];
await mkdir(path.join(ROOT, 'public/og'), { recursive: true });
await sharp({ create: { width: 1200, height: 630, channels: 4, background: '#080b10' } })
    .composite(layers).png({ compressionLevel: 9 }).toFile(path.join(ROOT, 'public/og/draft-v2.png'));
