import sharp from 'sharp';

export async function encodeWebp(input, assetPath) {
  const icon = /(?:^|\/)(?:tier\/|favicon\.)/.test(assetPath);
  const portrait = /(?:^|\/)(?:hero\/|heroes\/)/.test(assetPath);
  const size = portrait ? 256 : assetPath.includes('background/') ? 1920 : 1280;
  const pipeline = sharp(input, { limitInputPixels: 40_000_000 }).rotate();
  if (!icon) pipeline.resize(size, size, { fit: 'inside', withoutEnlargement: true });
  return pipeline.webp({ quality: portrait ? 68 : 62, alphaQuality: 90, lossless: icon,
    effort: 6, smartSubsample: true }).toBuffer({ resolveWithObject: true });
}
