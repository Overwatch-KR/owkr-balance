import { afterEach, describe, expect, it, vi } from 'vitest';
import { APP_UPDATE_CHECK_INTERVAL_MS, watchAppVersion } from './watch-app-version';

const cleanups: (() => void)[] = [];
afterEach(() => {
    cleanups.splice(0).forEach(cleanup => cleanup());
    vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals();
});

function setup({ visible = true, online = true } = {}) {
    vi.useFakeTimers(); vi.setSystemTime(0);
    const page = Object.assign(new EventTarget(), { visibilityState: visible ? 'visible' : 'hidden' });
    const browser = Object.assign(new EventTarget(), { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout });
    const network = { onLine: online };
    vi.stubGlobal('document', page); vi.stubGlobal('window', browser); vi.stubGlobal('navigator', network);
    const fetcher = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ version: 'current' })));
    vi.stubGlobal('fetch', fetcher);
    const onAvailable = vi.fn();
    const start = () => { const stop = watchAppVersion('current', onAvailable); cleanups.push(stop); return stop; };
    return { page, browser, network, fetcher, onAvailable, start };
}

describe('application version checks', () => {
    it('uses a stable cache-revalidated URL and at most one check per five minutes despite focus events', async () => {
        const app = setup(); app.start(); await vi.advanceTimersByTimeAsync(0);
        expect(app.fetcher).toHaveBeenCalledTimes(1);
        expect(app.fetcher).toHaveBeenLastCalledWith('/version.json', expect.objectContaining({ cache: 'no-cache', signal: expect.any(AbortSignal) }));
        for (let i = 0; i < 10; i++) {
            app.browser.dispatchEvent(new Event('focus'));
            app.page.dispatchEvent(new Event('visibilitychange'));
        }
        await vi.advanceTimersByTimeAsync(APP_UPDATE_CHECK_INTERVAL_MS - 1);
        expect(app.fetcher).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(1);
        expect(app.fetcher).toHaveBeenCalledTimes(2);
        expect(app.onAvailable).not.toHaveBeenCalled();
    });

    it('pauses all polling while hidden and checks once on return when overdue', async () => {
        const app = setup(); app.start(); await vi.advanceTimersByTimeAsync(0);
        app.page.visibilityState = 'hidden'; app.page.dispatchEvent(new Event('visibilitychange'));
        expect(vi.getTimerCount()).toBe(0);
        await vi.advanceTimersByTimeAsync(60 * 60_000);
        app.browser.dispatchEvent(new Event('focus'));
        expect(app.fetcher).toHaveBeenCalledTimes(1);
        app.page.visibilityState = 'visible';
        app.page.dispatchEvent(new Event('visibilitychange')); app.browser.dispatchEvent(new Event('focus'));
        await vi.advanceTimersByTimeAsync(0);
        expect(app.fetcher).toHaveBeenCalledTimes(2);
        await vi.advanceTimersByTimeAsync(APP_UPDATE_CHECK_INTERVAL_MS);
        expect(app.fetcher).toHaveBeenCalledTimes(3);
    });

    it('does not check hidden or offline on startup and resumes on visibility or online events', async () => {
        const app = setup({ visible: false, online: false }); app.start();
        await vi.advanceTimersByTimeAsync(APP_UPDATE_CHECK_INTERVAL_MS * 2);
        expect(app.fetcher).not.toHaveBeenCalled();
        app.page.visibilityState = 'visible'; app.page.dispatchEvent(new Event('visibilitychange'));
        expect(app.fetcher).not.toHaveBeenCalled();
        app.network.onLine = true; app.browser.dispatchEvent(new Event('online'));
        await vi.advanceTimersByTimeAsync(0);
        expect(app.fetcher).toHaveBeenCalledTimes(1);
        app.network.onLine = false; app.browser.dispatchEvent(new Event('offline'));
        await vi.advanceTimersByTimeAsync(APP_UPDATE_CHECK_INTERVAL_MS * 3);
        expect(app.fetcher).toHaveBeenCalledTimes(1);
    });

    it('notifies once and removes polling and event listeners after detecting another deployment', async () => {
        const app = setup(); app.fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ version: 'new-build' })));
        app.start(); await vi.advanceTimersByTimeAsync(0);
        expect(app.onAvailable).toHaveBeenCalledTimes(1);
        expect(vi.getTimerCount()).toBe(0);
        await vi.advanceTimersByTimeAsync(APP_UPDATE_CHECK_INTERVAL_MS * 10);
        app.browser.dispatchEvent(new Event('focus'));
        expect(app.fetcher).toHaveBeenCalledTimes(1);
    });

    it('throttles failures and invalid version responses without reporting an update', async () => {
        const app = setup(); app.fetcher.mockRejectedValueOnce(new Error('temporary network issue'));
        app.start(); await vi.advanceTimersByTimeAsync(0);
        app.browser.dispatchEvent(new Event('focus'));
        expect(app.fetcher).toHaveBeenCalledTimes(1);
        app.fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ version: '' })));
        await vi.advanceTimersByTimeAsync(APP_UPDATE_CHECK_INTERVAL_MS);
        expect(app.fetcher).toHaveBeenCalledTimes(2);
        expect(app.onAvailable).not.toHaveBeenCalled();
    });

    it('aborts a stalled check after eight seconds and retries at the normal interval', async () => {
        const app = setup();
        app.fetcher.mockImplementationOnce((_url: string, options: RequestInit) => new Promise((_resolve, reject) => {
            options.signal!.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        }));
        app.start(); await vi.advanceTimersByTimeAsync(8_000);
        expect(app.fetcher.mock.calls[0][1].signal.aborted).toBe(true);
        await vi.advanceTimersByTimeAsync(APP_UPDATE_CHECK_INTERVAL_MS - 8_000);
        expect(app.fetcher).toHaveBeenCalledTimes(2);
    });

    it('aborts on disposal and ignores a late response without scheduling another check', async () => {
        const app = setup(); let finish!: (response: Response) => void;
        app.fetcher.mockReturnValueOnce(new Promise<Response>(resolve => { finish = resolve; }));
        const stop = app.start(); stop();
        expect(app.fetcher.mock.calls[0][1].signal.aborted).toBe(true);
        finish(new Response(JSON.stringify({ version: 'new-build' })));
        await vi.advanceTimersByTimeAsync(APP_UPDATE_CHECK_INTERVAL_MS * 2);
        app.browser.dispatchEvent(new Event('focus'));
        expect(app.onAvailable).not.toHaveBeenCalled();
        expect(app.fetcher).toHaveBeenCalledTimes(1);
        expect(vi.getTimerCount()).toBe(0);
    });
});
