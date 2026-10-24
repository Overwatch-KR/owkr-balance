export const DRAFT_AUDIO_FILES = {
  mapStart: 'map-start', mapFirst: 'map-first', mapChange: 'map-change', countdown: 'countdown',
  mapComplete: 'map-complete', banBgm: 'ban-bgm', banStart: 'ban-start',
  banClick: 'ban-click', banConfirm: 'ban-confirm', banComplete: 'ban-complete',
} as const;
export type DraftSound = keyof typeof DRAFT_AUDIO_FILES;
export type DraftAudioChannel = 'voice' | 'click' | 'countdown' | 'bgm' | 'result';
export interface DraftPlayback { elapsedMs: () => number }
export const BAN_REVEAL_BEATS_MS = [240, 780, 1050, 1330] as const;
export const BAN_BGM_VOLUME = 0.12;

export function getBanRevealCount(elapsedMs: number): number {
  return BAN_REVEAL_BEATS_MS.filter(beat => elapsedMs >= beat).length;
}

export function getDraftSelectionSound(kind: 'MAP' | 'BAN', previous: readonly string[], next: readonly string[], firstMap: boolean): DraftSound | null {
  if (!next.some((id, index) => id && previous[index] !== id)) return null;
  if (kind === 'MAP') return firstMap ? 'mapFirst' : 'mapChange';
  return next.filter(Boolean).length === 3 ? 'banConfirm' : 'banClick';
}

/** @description 음원을 캐시하고 채널별 취소를 적용해 늦은 로딩·음소거·화면 이탈 후의 재생을 막는다. */
export function createDraftAudio() {
  let context: AudioContext | null = null;
  let enabled = true;
  const buffers = new Map<DraftSound, Promise<AudioBuffer>>();
  const decoded = new Map<DraftSound, AudioBuffer>();
  const sources = new Map<DraftAudioChannel, AudioBufferSourceNode>();
  const generations = new Map<DraftAudioChannel, number>();
  function prepare() {
    if (!context && typeof AudioContext !== 'undefined') context = new AudioContext();
    return context;
  }
  function load(sound: DraftSound): Promise<AudioBuffer> {
    const ctx = prepare();
    if (!ctx) return Promise.reject(new Error('audio unavailable'));
    let buffer = buffers.get(sound);
    if (!buffer) {
      buffer = fetch(`/draft-assets/audio/${DRAFT_AUDIO_FILES[sound]}.opus`, { signal: AbortSignal.timeout(20000) }).then(response => {
        if (!response.ok) throw new Error('audio unavailable');
        return response.arrayBuffer();
      }).then(data => ctx.decodeAudioData(data)).then(value => {
        if (ctx === context) decoded.set(sound, value);
        return value;
      });
      buffers.set(sound, buffer);
      void buffer.catch(() => { if (buffers.get(sound) === buffer) buffers.delete(sound); });
    }
    return buffer;
  }
  function stop(channel: DraftAudioChannel) {
    generations.set(channel, (generations.get(channel) ?? 0) + 1);
    const source = sources.get(channel);
    if (source) { source.stop(); source.disconnect(); sources.delete(channel); }
  }
  function stopAll() {
    for (const channel of ['voice', 'click', 'countdown', 'bgm', 'result'] as const) stop(channel);
  }
  return {
    preload() {
      return Promise.allSettled((Object.keys(DRAFT_AUDIO_FILES) as DraftSound[]).map(load));
    },
    async unlock() {
      const ctx = prepare();
      if (!ctx) return false;
      try { if (ctx.state !== 'running') await ctx.resume(); return ctx.state === 'running'; } catch { return false; }
    },
    isReady: () => enabled && context?.state === 'running',
    setEnabled(value: boolean) { enabled = value; if (!value) stopAll(); },
    async play(sound: DraftSound, channel: DraftAudioChannel, options: { loop?: boolean; volume?: number } = {}): Promise<DraftPlayback | null> {
      stop(channel);
      const ctx = context;
      if (!enabled || !ctx || ctx.state !== 'running') return null;
      const generation = generations.get(channel);
      try {
        let timeout: ReturnType<typeof setTimeout> | undefined;
        const limit = options.loop ? 15000 : channel === 'click' ? 350 : channel === 'voice' ? 5000 : 1000;
        const buffer = decoded.get(sound) ?? await Promise.race([
          load(sound),
          new Promise<null>(resolve => { timeout = setTimeout(() => resolve(null), limit); }),
        ]).finally(() => clearTimeout(timeout));
        if (!buffer) return null;
        if (!enabled || ctx !== context || ctx.state !== 'running' || generations.get(channel) !== generation) return null;
        const source = ctx.createBufferSource();
        const gain = ctx.createGain();
        source.buffer = buffer; source.loop = options.loop ?? false;
        gain.gain.value = options.volume ?? (sound === 'mapFirst' || sound === 'mapChange' || sound === 'banClick' || sound === 'banConfirm' ? 0.25 : 0.6);
        source.connect(gain); gain.connect(ctx.destination);
        sources.set(channel, source);
        source.onended = () => { source.disconnect(); gain.disconnect(); if (sources.get(channel) === source) sources.delete(channel); };
        const start = ctx.currentTime + (channel === 'result' ? 0.03 : 0);
        source.start(start);
        return { elapsedMs: () => (ctx.currentTime - start) * 1000 };
      } catch { return null; }
    },
    stop, stopAll,
    dispose() {
      stopAll(); buffers.clear(); decoded.clear();
      const previous = context; context = null;
      if (previous && previous.state !== 'closed') void previous.close().catch(() => undefined);
    },
  };
}
export type DraftAudio = ReturnType<typeof createDraftAudio>;
