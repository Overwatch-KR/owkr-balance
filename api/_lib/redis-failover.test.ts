import { Redis } from '@upstash/redis';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStorageRequester } from './redis-failover';

const primary = { url: 'https://local.invalid/storage', token: 'local-secret' };
const fallback = { url: 'https://upstash.invalid', token: 'upstream-secret' };
const reply = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe('local-first Redis transport', () => {
    it('uses the local gateway and keeps Unicode and pipeline results compatible with the SDK', async () => {
        const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
            if (String(url).endsWith('/status')) return reply({ backend: 'local' });
            const body = JSON.parse(options!.body as string);
            return reply(Array.isArray(body[0]) ? body.map(() => ({ result: '한글' })) : { result: '한글' });
        });
        const client = new Redis(createStorageRequester(primary, fallback));
        expect(await client.get('scrims:one')).toBe('한글');
        const pipeline = client.pipeline(); pipeline.get('scrims:one'); pipeline.get('scrims:two');
        expect(await pipeline.exec()).toEqual(['한글', '한글']);
        expect(fetch.mock.calls.every(([url]) => String(url).startsWith(primary.url))).toBe(true);
        expect(fetch).toHaveBeenLastCalledWith(`${primary.url}/pipeline`, expect.objectContaining({
            headers: expect.objectContaining({ Authorization: 'Bearer local-secret' }),
        }));
    });

    it('sends writes directly to Upstash when the local health probe fails and opens a cooldown', async () => {
        const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async url => {
            if (String(url).startsWith(primary.url)) throw new TypeError('offline');
            return reply({ result: 1 });
        });
        const requester = createStorageRequester(primary, fallback);
        expect(await requester.request({ body: ['INCR', 'scrims:counter'] })).toEqual({ result: 1 });
        await requester.request({ body: ['GET', 'scrims:counter'] });
        expect(fetch.mock.calls.map(([url]) => url)).toEqual([`${primary.url}/status`, fallback.url, fallback.url]);
        expect(fetch.mock.calls[1][1]?.headers).toMatchObject({ Authorization: 'Bearer upstream-secret' });
    });

    it('retries a failed read against Upstash', async () => {
        const fetch = vi.spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(reply({ backend: 'local' }))
            .mockRejectedValueOnce(new TypeError('connection lost'))
            .mockResolvedValueOnce(reply({ result: 'backup' }));
        const requester = createStorageRequester(primary, fallback);
        expect(await requester.request({ body: ['GET', 'scrims:one'] })).toEqual({ result: 'backup' });
        expect(fetch).toHaveBeenCalledTimes(3);
    });

    it.each([
        { body: ['INCR', 'scrims:counter'] },
        { body: ['GETDEL', 'scrims:once'] },
        { body: ['EVAL', 'return 1', 0] },
        { path: ['multi-exec'], body: [['GET', 'scrims:one'], ['INCR', 'scrims:counter']] },
    ])('never replays an ambiguous mutation: %j', async request => {
        const fetch = vi.spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(reply({ backend: 'local' }))
            .mockRejectedValueOnce(new TypeError('reply lost'));
        const requester = createStorageRequester(primary, fallback);
        await expect(requester.request(request)).rejects.toThrow('저장 결과를 확인하지 못했습니다');
        expect(fetch).toHaveBeenCalledTimes(2);
        expect(fetch.mock.calls.some(([url]) => url === fallback.url)).toBe(false);
    });

    it('requires recovery synchronization before returning a fallback client to local storage', async () => {
        vi.useFakeTimers(); vi.setSystemTime(1_800_000_000_000);
        let localAvailable = false; let lastSyncAt = Date.now() - 1000;
        const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async url => {
            if (String(url).endsWith('/status')) return localAvailable ? reply({ backend: 'local', lastSyncAt }) : reply({}, 503);
            return reply({ result: 'OK' });
        });
        const requester = createStorageRequester(primary, fallback);
        await requester.request({ body: ['SET', 'scrims:one', 'fallback write'] });
        localAvailable = true; vi.advanceTimersByTime(30_001);
        await requester.request({ body: ['GET', 'scrims:one'] });
        expect(fetch.mock.lastCall?.[0]).toBe(fallback.url);
        lastSyncAt = Date.now() + 1; vi.advanceTimersByTime(30_001);
        await requester.request({ body: ['GET', 'scrims:one'] });
        expect(fetch.mock.lastCall?.[0]).toBe(primary.url);
    });

    it('does not hide authentication or Redis command errors behind failover', async () => {
        const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(reply({}, 401));
        const requester = createStorageRequester(primary, fallback);
        await expect(requester.request({ body: ['GET', 'scrims:one'] })).rejects.toThrow('401');
        expect(fetch).toHaveBeenCalledTimes(1);
        fetch.mockResolvedValueOnce(reply({ backend: 'local' })).mockResolvedValueOnce(reply({ error: 'WRONGTYPE' }));
        expect(await requester.request({ body: ['GET', 'scrims:one'] })).toEqual({ error: 'WRONGTYPE' });
        expect(fetch).toHaveBeenCalledTimes(3);
    });

    it('fails clearly when both endpoints are down or no fallback is configured', async () => {
        vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('offline'));
        await expect(createStorageRequester(primary, fallback).request({ body: ['GET', 'scrims:one'] })).rejects.toThrow('저장소 연결');
        await expect(createStorageRequester(primary, null).request({ body: ['SET', 'scrims:one', 'value'] })).rejects.toThrow('저장소 연결');
    });
});
