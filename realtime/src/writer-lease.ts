interface LeaseStore { renewLease(): Promise<boolean> }
export type LeaseLossReason = 'ownership-lost' | 'renewal-timeout';

/** @description 갱신을 직렬 작업과 분리하고 유효기간이 지난 작성자는 재사용하지 않는다. */
export function superviseWriterLease(store: LeaseStore, onLost: (reason: LeaseLossReason, elapsedMs: number) => void) {
  let lastSuccess = Date.now();
  let stopped = false;
  let pending: Promise<boolean> | null = null;
  const lose = (reason: LeaseLossReason) => {
    if (stopped) return;
    stopped = true; clearInterval(interval);
    onLost(reason, Date.now() - lastSuccess);
  };
  const renew = (): Promise<boolean> => {
    if (stopped) return Promise.resolve(false);
    if (Date.now() - lastSuccess >= 15_000) { lose('renewal-timeout'); return Promise.resolve(false); }
    if (pending) return pending;
    pending = store.renewLease().then(renewed => {
      if (stopped) return false;
      if (Date.now() - lastSuccess >= 15_000) { lose('renewal-timeout'); return false; }
      if (!renewed) { lose('ownership-lost'); return false; }
      lastSuccess = Date.now(); return true;
    }).catch(() => false).finally(() => { pending = null; });
    return pending;
  };
  const interval = setInterval(() => {
    if (Date.now() - lastSuccess >= 15_000) lose('renewal-timeout');
    else if (Date.now() - lastSuccess >= 5000) void renew();
  }, 1000);
  interval.unref();
  return { renew, stop: () => { stopped = true; clearInterval(interval); } };
}
