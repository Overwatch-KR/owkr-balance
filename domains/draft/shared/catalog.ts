import { requireDraft, type DraftCatalog, type DraftHero, type DraftMap } from './model.js';

export function validateCatalogApproval<T>(catalog: DraftCatalog<T>): void {
  const approval = catalog.approval;
  requireDraft(approval.version.trim() && approval.approvedBy.trim()
    && Number.isSafeInteger(approval.approvedAt) && approval.approvedAt > 0
    && approval.verifiedAt.trim() && approval.gameBuild.trim()
    && approval.sources.length > 0 && approval.sources.every(source => /^https:\/\//.test(source)),
  'CATALOG_UNAPPROVED', '출처·적용 빌드·검증일·승인자가 기록된 카탈로그가 필요합니다.');
}

export function validateMapCatalog(catalog: DraftCatalog<DraftMap>): void {
  validateCatalogApproval(catalog);
  requireDraft(new Set(catalog.entries.map(map => map.mapId)).size === catalog.entries.length,
    'DUPLICATE_MAP_ID', '맵 식별자가 중복되었습니다.');
  const canonicalModes = new Map<string, string>();
  for (const map of catalog.entries) {
    requireDraft(map.mapId.trim() && map.mapId !== 'RANDOM' && map.canonicalMapId.trim()
      && map.nameKo.trim() && map.nameEn.trim()
      && ['CONTROL', 'HYBRID', 'ESCORT', 'PUSH', 'FLASHPOINT'].includes(map.mode),
    'INVALID_MAP', '맵 정보 또는 기본 모드를 확인해 주세요.');
    const previous = canonicalModes.get(map.canonicalMapId);
    requireDraft(!previous || previous === map.mode, 'CANONICAL_MODE_MISMATCH', '같은 맵 변형의 모드가 다릅니다.');
    canonicalModes.set(map.canonicalMapId, map.mode);
  }
}

export function validateHeroCatalog(catalog: DraftCatalog<DraftHero>): void {
  validateCatalogApproval(catalog);
  requireDraft(new Set(catalog.entries.map(hero => hero.heroId)).size === catalog.entries.length,
    'DUPLICATE_HERO_ID', '영웅 식별자가 중복되었습니다.');
  requireDraft(catalog.entries.every(hero => hero.heroId.trim() && hero.nameKo.trim()
    && ['TANK', 'DPS', 'SUPPORT'].includes(hero.role)),
  'INVALID_HERO', '영웅 정보와 역할을 확인해 주세요.');
}
