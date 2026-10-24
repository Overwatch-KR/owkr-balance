import { getWithExpiry, setWithExpiry } from '../../utils/storage';
import { DEFAULT_DRAFT_VOLUME } from './draft-audio';

const VOLUME_KEY = 'owkr:draft:volume:v1';
const VOLUME_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;

export function readDraftVolume(): number {
  try {
    const value = getWithExpiry<number>(VOLUME_KEY, VOLUME_EXPIRY_MS);
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1 ? value : DEFAULT_DRAFT_VOLUME;
  } catch { return DEFAULT_DRAFT_VOLUME; }
}

export function rememberDraftVolume(value: number): void {
  try { setWithExpiry(VOLUME_KEY, value, VOLUME_EXPIRY_MS); } catch { /* 음량 변경은 저장 권한 없이도 적용한다. */ }
}
