import { afterEach, describe, expect, it, vi } from 'vitest';
import { BAN_BGM_VOLUME, BAN_REVEAL_BEATS_MS, createDraftAudio, getBanRevealCount, getDraftSelectionSound } from './draft-audio';

class AudioContextMock {
  static instances: AudioContextMock[] = [];
  state = 'suspended'; currentTime = 10; destination = {};
  sources: { loop: boolean; start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }[] = [];
  gains: { gain: { value: number }; connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }[] = [];
  constructor() { AudioContextMock.instances.push(this); }
  resume = vi.fn(async () => { this.state = 'running'; });
  close = vi.fn(async () => { this.state = 'closed'; });
  decodeAudioData = vi.fn(async () => ({ duration: 2.45 }));
  createBufferSource() {
    const source = { loop: false, buffer: null, onended: null, start: vi.fn(), stop: vi.fn(), connect: vi.fn(), disconnect: vi.fn() };
    this.sources.push(source); return source;
  }
  createGain() {
    const gain = { gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() };
    this.gains.push(gain); return gain;
  }
}
function setup() {
  vi.stubGlobal('AudioContext', AudioContextMock);
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })));
  return createDraftAudio();
}
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); AudioContextMock.instances.length = 0; });

describe('draft sound sequencing', () => {
  it('distinguishes first map selection, changes and deselection', () => {
    expect(getDraftSelectionSound('MAP', [], ['map1'], true)).toBe('mapFirst');
    expect(getDraftSelectionSound('MAP', ['map1'], ['map2'], false)).toBe('mapChange');
    expect(getDraftSelectionSound('MAP', [], ['map2'], false)).toBe('mapChange');
    expect(getDraftSelectionSound('MAP', ['map1'], [], false)).toBeNull();
  });
  it('plays confirmation only when three ban slots are filled and ignores removal', () => {
    expect(getDraftSelectionSound('BAN', [], ['ana'], false)).toBe('banClick');
    expect(getDraftSelectionSound('BAN', ['ana'], ['ana', 'dva'], false)).toBe('banClick');
    expect(getDraftSelectionSound('BAN', ['ana', 'dva'], ['ana', 'dva', 'mei'], false)).toBe('banConfirm');
    expect(getDraftSelectionSound('BAN', ['ana', 'dva', 'mei'], ['ana', '', 'mei'], false)).toBeNull();
    expect(getDraftSelectionSound('BAN', ['ana'], [], false)).toBeNull();
  });
  it('reveals each ban at the measured impact rather than a uniform interval', () => {
    BAN_REVEAL_BEATS_MS.forEach((beat, index) => {
      expect(getBanRevealCount(beat - 1)).toBe(index);
      expect(getBanRevealCount(beat)).toBe(index + 1);
    });
  });
});

describe('draft audio lifecycle', () => {
  it('requires browser activation, shares cached buffers and uses the audio clock', async () => {
    const audio = setup();
    expect(await audio.play('mapStart', 'voice')).toBeNull();
    expect(await audio.unlock()).toBe(true);
    const playback = await audio.play('mapStart', 'voice');
    const ctx = AudioContextMock.instances[0];
    expect(ctx.sources[0].start).toHaveBeenCalledWith(10);
    expect(ctx.gains[0].gain.value).toBe(0.6);
    ctx.currentTime = 10.78;
    expect(playback?.elapsedMs()).toBeCloseTo(780);
    await audio.play('mapStart', 'voice');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(ctx.sources[0].stop).toHaveBeenCalledTimes(1);
    audio.dispose();
    expect(ctx.close).toHaveBeenCalledOnce();
  });
  it('downloads and decodes every sound in advance and starts cached clicks synchronously', async () => {
    const audio = setup();
    const outcomes = await audio.preload();
    expect(outcomes).toHaveLength(10);
    expect(outcomes.every(outcome => outcome.status === 'fulfilled')).toBe(true);
    const ctx = AudioContextMock.instances[0];
    expect(fetch).toHaveBeenCalledTimes(10);
    expect(ctx.decodeAudioData).toHaveBeenCalledTimes(10);
    await audio.unlock();
    const pending = audio.play('mapFirst', 'click');
    expect(ctx.sources[0].start).toHaveBeenCalledWith(ctx.currentTime);
    await pending;
    await audio.play('banClick', 'click');
    expect(fetch).toHaveBeenCalledTimes(10);
    expect(ctx.decodeAudioData).toHaveBeenCalledTimes(10);
    audio.dispose();
  });
  it('reuses in-flight preloads without downloading or decoding twice', async () => {
    const audio = setup();
    await Promise.all([audio.preload(), audio.preload()]);
    expect(fetch).toHaveBeenCalledTimes(10);
    expect(AudioContextMock.instances[0].decodeAudioData).toHaveBeenCalledTimes(10);
    audio.dispose();
  });
  it('plays both map selection effects at twenty-five percent', async () => {
    const audio = setup(); await audio.unlock();
    await audio.play('mapFirst', 'click');
    await audio.play('mapChange', 'click');
    expect(AudioContextMock.instances[0].gains.map(gain => gain.gain.value)).toEqual([0.25, 0.25]);
    audio.dispose();
  });
  it('loops a quiet ban bed independently from the voice and countdown channels', async () => {
    const audio = setup(); await audio.unlock();
    await audio.play('banBgm', 'bgm', { loop: true, volume: BAN_BGM_VOLUME });
    await audio.play('banStart', 'voice');
    await audio.play('banClick', 'click');
    expect(AudioContextMock.instances[0].gains[2].gain.value).toBe(0.25);
    await audio.play('banConfirm', 'click');
    expect(AudioContextMock.instances[0].gains[3].gain.value).toBe(0.25);
    await audio.play('countdown', 'countdown', { loop: true });
    const ctx = AudioContextMock.instances[0];
    expect(ctx.sources.map(source => source.loop)).toEqual([true, false, false, false, true]);
    expect(ctx.gains[0].gain.value).toBe(0.12);
    audio.stop('countdown');
    expect(ctx.sources[0].stop).not.toHaveBeenCalled();
    expect(ctx.sources[4].stop).toHaveBeenCalledOnce();
    audio.setEnabled(false);
    expect(ctx.sources[0].stop).toHaveBeenCalledOnce();
    expect(ctx.sources[1].stop).toHaveBeenCalledOnce();
    expect(await audio.play('banClick', 'click')).toBeNull();
    audio.dispose();
  });
  it('cancels pending downloads when a stage ends or a newer click replaces it', async () => {
    const audio = setup(); await audio.unlock();
    let complete!: (response: Response) => void;
    vi.mocked(fetch).mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }) as Promise<Response>);
    const old = audio.play('mapFirst', 'click');
    await audio.play('mapChange', 'click');
    complete({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) } as Response);
    expect(await old).toBeNull();
    expect(AudioContextMock.instances[0].sources).toHaveLength(1);
    audio.dispose();
  });
  it('never starts a pending sound after mute or unmount', async () => {
    const audio = setup(); await audio.unlock();
    let complete!: (response: Response) => void;
    vi.mocked(fetch).mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }) as Promise<Response>);
    const pending = audio.play('banComplete', 'result');
    audio.setEnabled(false); audio.dispose();
    complete({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) } as Response);
    expect(await pending).toBeNull();
    expect(AudioContextMock.instances[0].sources).toHaveLength(0);
  });
  it('falls back without holding the result indefinitely when loading is slow or fails', async () => {
    vi.useFakeTimers();
    const audio = setup(); await audio.unlock();
    vi.mocked(fetch).mockImplementationOnce(() => new Promise(() => undefined));
    const pending = audio.play('banComplete', 'result');
    await vi.advanceTimersByTimeAsync(1000);
    expect(await pending).toBeNull();
    vi.mocked(fetch).mockRejectedValueOnce(new Error('offline'));
    expect(await audio.play('mapStart', 'voice')).toBeNull();
    audio.dispose();
  });
});
