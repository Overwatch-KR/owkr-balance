import { useEffect, useState } from 'react';
import { getBanRevealCount, type DraftAudio } from './draft-audio';

/** @description 음원 재생 시계를 기준으로 네 타격 시점에 슬롯을 공개하며 무음·재생 실패 시에도 결과를 보여준다. */
export function useDraftBanReveal(audio: DraftAudio | undefined, resolutionId: string, replay: number) {
  const key = `${resolutionId}:${replay}`;
  const [state, setState] = useState({ key, visible: 0 });
  useEffect(() => {
    let cancelled = false;
    let frame = 0;
    const start = async () => {
      const playback = await audio?.play('banComplete', 'result');
      if (cancelled) return;
      const started = performance.now();
      const update = () => {
        if (cancelled) return;
        const elapsed = playback?.elapsedMs() ?? performance.now() - started;
        setState({ key, visible: getBanRevealCount(elapsed) });
        if (elapsed < 1400) frame = requestAnimationFrame(update);
      };
      frame = requestAnimationFrame(update);
    };
    void start();
    return () => { cancelled = true; cancelAnimationFrame(frame); audio?.stop('result'); };
  }, [audio, key]);
  return state.key === key ? state.visible : 0;
}
