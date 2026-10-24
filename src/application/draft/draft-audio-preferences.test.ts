import { afterEach, describe, expect, it, vi } from 'vitest';
import { readDraftVolume, rememberDraftVolume } from './draft-audio-preferences';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
function setup() {
  const data = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value), removeItem: (key: string) => data.delete(key) });
}
describe('remembered draft volume', () => {
  it('defaults to half volume, remembers zero and restores the default after thirty days', () => {
    vi.useFakeTimers(); setup();
    expect(readDraftVolume()).toBe(0.5);
    rememberDraftVolume(0); expect(readDraftVolume()).toBe(0);
    rememberDraftVolume(0.75); expect(readDraftVolume()).toBe(0.75);
    vi.advanceTimersByTime(30 * 24 * 60 * 60 * 1000 + 1);
    expect(readDraftVolume()).toBe(0.5);
  });
  it('keeps the default when browser storage is unavailable or saved values are malformed', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } });
    expect(readDraftVolume()).toBe(0.5);
    expect(() => rememberDraftVolume(0.2)).not.toThrow();
    setup(); rememberDraftVolume(2); expect(readDraftVolume()).toBe(0.5);
  });
});
