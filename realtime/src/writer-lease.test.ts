import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { superviseWriterLease } from './writer-lease.js';

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(1_800_000_000_000); });
afterEach(() => { vi.useRealTimers(); });

describe('writer lease supervision', () => {
  it('renews independently every five seconds', async () => {
    const store = { renewLease: vi.fn().mockResolvedValue(true) }; const lost = vi.fn();
    const lease = superviseWriterLease(store, lost);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(store.renewLease).toHaveBeenCalledTimes(4); expect(lost).not.toHaveBeenCalled(); lease.stop();
  });
  it('survives a transient failure when renewal succeeds before expiry', async () => {
    const store = { renewLease: vi.fn().mockRejectedValueOnce(new Error('network')).mockResolvedValue(true) };
    const lost = vi.fn(); const lease = superviseWriterLease(store, lost);
    await vi.advanceTimersByTimeAsync(12_000);
    expect(lost).not.toHaveBeenCalled(); expect(store.renewLease).toHaveBeenCalledTimes(3); lease.stop();
  });
  it('fails closed once if ownership is absent or belongs to another writer', async () => {
    const store = { renewLease: vi.fn().mockResolvedValue(false) }; const lost = vi.fn();
    const lease = superviseWriterLease(store, lost);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(lost).toHaveBeenCalledExactlyOnceWith('ownership-lost', 5000);
    expect(store.renewLease).toHaveBeenCalledTimes(1); expect(await lease.renew()).toBe(false);
  });
  it('expires even when the renewal promise never settles', async () => {
    let resolve!: (renewed: boolean) => void;
    const store = { renewLease: vi.fn(() => new Promise<boolean>(done => { resolve = done; })) };
    const lost = vi.fn(); const lease = superviseWriterLease(store, lost);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(lost).toHaveBeenCalledExactlyOnceWith('renewal-timeout', 15_000);
    expect(store.renewLease).toHaveBeenCalledTimes(1);
    resolve(true); await vi.advanceTimersByTimeAsync(20_000);
    expect(await lease.renew()).toBe(false); expect(lost).toHaveBeenCalledTimes(1);
  });
  it('times out repeated errors instead of remaining alive and unavailable forever', async () => {
    const store = { renewLease: vi.fn().mockRejectedValue(new Error('unreachable')) }; const lost = vi.fn();
    superviseWriterLease(store, lost);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(lost).toHaveBeenCalledExactlyOnceWith('renewal-timeout', 15_000);
  });
  it('shares renewal work and stops it during shutdown', async () => {
    let resolve!: (value: boolean) => void;
    const store = { renewLease: vi.fn(() => new Promise<boolean>(done => { resolve = done; })) }; const lost = vi.fn();
    const lease = superviseWriterLease(store, lost);
    const first = lease.renew(); expect(lease.renew()).toBe(first); lease.stop();
    resolve(false); expect(await first).toBe(false);
    await vi.advanceTimersByTimeAsync(30_000); expect(lost).not.toHaveBeenCalled();
  });
});
