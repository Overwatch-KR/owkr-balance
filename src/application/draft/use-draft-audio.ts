import { useCallback, useEffect, useRef, useState } from 'react';
import type { DraftRoomSnapshot } from '#domain/draft';
import { BAN_BGM_VOLUME, createDraftAudio } from './draft-audio';

/** @description 방의 현재 단계·서버 마감 시간에 맞춰 안내음과 반복음을 재생한다. */
export function useDraftAudio(snapshot: DraftRoomSnapshot | null, connected: boolean) {
  const [audio] = useState(createDraftAudio);
  const [muted, setMuted] = useState(false);
  const [ready, setReady] = useState(false);
  const announced = useRef('');
  const clock = useRef({ serverNow: 0, receivedAt: 0 });
  useEffect(() => {
    if (snapshot) clock.current = { serverNow: snapshot.serverNow, receivedAt: performance.now() };
  }, [snapshot]);
  const unlock = useCallback(() => {
    void audio.unlock().then(setReady);
  }, [audio]);
  useEffect(() => {
    audio.preload();
    let mounted = true;
    void audio.unlock().then(value => { if (mounted) setReady(value); });
    const activate = (event: Event) => { if (event.isTrusted) unlock(); };
    document.addEventListener('pointerdown', activate, true);
    document.addEventListener('keydown', activate, true);
    return () => {
      mounted = false;
      document.removeEventListener('pointerdown', activate, true);
      document.removeEventListener('keydown', activate, true);
      audio.dispose();
    };
  }, [audio, unlock]);
  const toggle = () => {
    if (!ready) { setMuted(false); audio.setEnabled(true); unlock(); return; }
    audio.setEnabled(muted); setMuted(!muted);
    if (muted) unlock();
  };
  const phase = snapshot?.phase;
  const stageKey = snapshot ? `${snapshot.roomCode}:${snapshot.gameId}:${snapshot.epoch}:${phase}` : '';
  const active = connected && snapshot?.timer.status === 'ACTIVE' && !muted && ready;
  useEffect(() => {
    audio.setEnabled(active);
    if (!active) return;
    const map = phase === 'MAP_VOTING' || phase === 'MAP_PICKING';
    const ban = phase === 'HERO_VOTING';
    if ((map || ban) && announced.current !== stageKey) {
      announced.current = stageKey;
      void audio.play(map ? 'mapStart' : 'banStart', 'voice');
    }
    if (ban) void audio.play('banBgm', 'bgm', { loop: true, volume: BAN_BGM_VOLUME });
    return () => { audio.stop('bgm'); audio.stop('voice'); audio.stop('click'); };
  }, [audio, active, phase, stageKey]);
  const deadline = snapshot?.timer.deadlineAt;
  useEffect(() => {
    if (!active || !['MAP_VOTING', 'MAP_PICKING', 'HERO_VOTING'].includes(phase ?? '') || deadline == null) return;
    let playing = false;
    const update = () => {
      const remaining = deadline - clock.current.serverNow - (performance.now() - clock.current.receivedAt);
      const shouldPlay = remaining > 0 && remaining <= 5000;
      if (shouldPlay && !playing) void audio.play('countdown', 'countdown', { loop: true });
      if (!shouldPlay && playing) audio.stop('countdown');
      playing = shouldPlay;
    };
    update();
    const timer = setInterval(update, 50);
    return () => { clearInterval(timer); audio.stop('countdown'); };
  }, [audio, active, phase, stageKey, deadline]);
  return { audio, muted, ready, toggle };
}
