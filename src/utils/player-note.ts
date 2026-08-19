import { requestJson } from './api';
import {
    createPlayerNoteSync,
    type PlayerNoteSyncEvent,
} from './player-note-sync';

export interface PlayerNote {
    battleTag: string;
    content: string;
    entryId?: string;
    authorName: string;
    updatedAt: number;
}

export interface PlayerNoteReference {
    battleTag: string;
    entryId?: string;
}

export interface CachedPlayerNote {
    fetchedAt: number;
    note: PlayerNote | null;
}

interface PlayerNoteResponse {
    note: PlayerNote | null;
}

interface FetchPlayerNoteOptions {
    cacheScope: string;
    force?: boolean;
}

type PlayerNoteListener = (note: PlayerNote | null) => void;

export const PLAYER_NOTE_CACHE_TTL_MS = 60_000;

const noteCache = new Map<string, CachedPlayerNote>();
const noteRequests = new Map<string, Promise<PlayerNote | null>>();
const noteListeners = new Map<string, Set<PlayerNoteListener>>();
const noteRevisions = new Map<string, number>();
const noteSync = createPlayerNoteSync<PlayerNote>(handlePlayerNoteSyncMessage);
let noteCacheGeneration = 0;

const getReferenceKey = ({ battleTag, entryId }: PlayerNoteReference): string => (
    entryId?.trim()
        ? `entry:${entryId.trim()}`
        : `battle-tag:${battleTag.trim().toLowerCase()}`
);

const getCacheKey = (reference: PlayerNoteReference, cacheScope: string): string => (
    `${cacheScope}:${getReferenceKey(reference)}`
);

const bumpNoteRevision = (key: string): number => {
    const revision = (noteRevisions.get(key) ?? 0) + 1;
    noteRevisions.set(key, revision);
    return revision;
};

const notifyNoteListeners = (key: string, note: PlayerNote | null) => {
    for (const listener of noteListeners.get(key) ?? []) listener(note);
};

const writePlayerNoteCache = (
    key: string,
    note: PlayerNote | null,
    sync?: {
        cacheScope: string;
        referenceKey: string;
    },
): PlayerNote | null => {
    noteCache.set(key, { note, fetchedAt: Date.now() });
    notifyNoteListeners(key, note);
    if (sync) {
        noteSync.publish({
            type: 'UPDATE',
            cacheScope: sync.cacheScope,
            referenceKey: sync.referenceKey,
            note,
        });
    }
    return note;
};

const deleteScopedPlayerNoteCache = (
    cacheScope: string,
    notify: boolean,
): void => {
    const prefix = `${cacheScope}:`;
    for (const key of new Set([
        ...noteCache.keys(),
        ...noteRequests.keys(),
        ...noteListeners.keys(),
    ])) {
        if (!key.startsWith(prefix)) continue;
        bumpNoteRevision(key);
        noteCache.delete(key);
        noteRequests.delete(key);
        if (notify) notifyNoteListeners(key, null);
    }
};

function handlePlayerNoteSyncMessage(message: PlayerNoteSyncEvent<PlayerNote>): void {
    if (message.type === 'CLEAR') {
        deleteScopedPlayerNoteCache(message.cacheScope, true);
        return;
    }
    if (!message.referenceKey) return;

    const key = `${message.cacheScope}:${message.referenceKey}`;
    bumpNoteRevision(key);
    noteRequests.delete(key);
    if (message.type === 'INVALIDATE') {
        noteCache.delete(key);
        return;
    }
    if (message.note !== null && (
        !message.note
        || typeof message.note.content !== 'string'
        || typeof message.note.updatedAt !== 'number'
    )) {
        return;
    }
    writePlayerNoteCache(key, message.note);
}

const requestPlayerNote = (
    reference: PlayerNoteReference,
    cacheScope: string,
): Promise<PlayerNote | null> => {
    const key = getCacheKey(reference, cacheScope);
    const pending = noteRequests.get(key);
    if (pending) return pending;

    const requestGeneration = noteCacheGeneration;
    const requestRevision = noteRevisions.get(key) ?? 0;
    const referenceKey = getReferenceKey(reference);
    const params = new URLSearchParams({ battleTag: reference.battleTag });
    if (reference.entryId) params.set('entryId', reference.entryId);
    const request = requestJson<PlayerNoteResponse>(`/api/notes?${params.toString()}`, {
        credentials: 'same-origin',
    })
        .then((response) => {
            if (
                requestGeneration !== noteCacheGeneration
                || requestRevision !== (noteRevisions.get(key) ?? 0)
            ) {
                return noteCache.get(key)?.note ?? response.note;
            }
            return writePlayerNoteCache(key, response.note, {
                cacheScope,
                referenceKey,
            });
        })
        .finally(() => {
            if (noteRequests.get(key) === request) noteRequests.delete(key);
        });
    noteRequests.set(key, request);
    return request;
};

/**
 * @description 개인 메모 캐시의 현재 값을 네트워크 요청 없이 읽는다.
 */
export const getCachedPlayerNote = (
    reference: PlayerNoteReference,
    cacheScope: string,
): CachedPlayerNote | undefined => noteCache.get(getCacheKey(reference, cacheScope));

/**
 * @description 같은 개인 메모의 캐시 갱신을 여러 화면에 전달한다.
 */
export const subscribePlayerNote = (
    reference: PlayerNoteReference,
    cacheScope: string,
    listener: PlayerNoteListener,
): (() => void) => {
    noteSync.ensure();
    const key = getCacheKey(reference, cacheScope);
    const listeners = noteListeners.get(key) ?? new Set<PlayerNoteListener>();
    listeners.add(listener);
    noteListeners.set(key, listeners);
    return () => {
        listeners.delete(listener);
        if (listeners.size === 0) noteListeners.delete(key);
    };
};

/**
 * @description 개인 메모를 메모리 캐시와 진행 중 요청 합치기를 적용해 조회한다.
 */
export const fetchPlayerNote = async (
    reference: PlayerNoteReference,
    { cacheScope, force = false }: FetchPlayerNoteOptions,
): Promise<PlayerNote | null> => {
    noteSync.ensure();
    const key = getCacheKey(reference, cacheScope);
    const cached = noteCache.get(key);
    if (!force && cached) {
        if (Date.now() - cached.fetchedAt >= PLAYER_NOTE_CACHE_TTL_MS) {
            void requestPlayerNote(reference, cacheScope).catch(() => undefined);
        }
        return cached.note;
    }
    return requestPlayerNote(reference, cacheScope);
};

/**
 * @description 특정 개인 메모를 다음 조회에서 강제로 다시 불러오도록 무효화한다.
 */
export const invalidatePlayerNoteCache = (
    reference: PlayerNoteReference,
    cacheScope: string,
): void => {
    noteSync.ensure();
    const referenceKey = getReferenceKey(reference);
    const key = getCacheKey(reference, cacheScope);
    bumpNoteRevision(key);
    noteCache.delete(key);
    noteRequests.delete(key);
    noteSync.publish({
        type: 'INVALIDATE',
        cacheScope,
        referenceKey,
    });
};

/**
 * @description 로그아웃이나 테스트 격리를 위해 개인 메모 메모리 캐시를 비운다.
 */
export const clearPlayerNoteCache = (cacheScope?: string): void => {
    noteCacheGeneration += 1;
    if (cacheScope) {
        noteSync.ensure();
        deleteScopedPlayerNoteCache(cacheScope, false);
        noteSync.publish({ type: 'CLEAR', cacheScope });
        return;
    }
    noteCache.clear();
    noteRequests.clear();
    noteListeners.clear();
    noteRevisions.clear();
    noteSync.close();
};

/**
 * @description 개인 메모를 저장하고 현재 세션 캐시를 즉시 최신 값으로 바꾼다.
 */
export const savePlayerNote = async (
    reference: PlayerNoteReference,
    content: string,
    csrfToken: string,
    cacheScope: string = csrfToken,
): Promise<PlayerNote | null> => {
    noteSync.ensure();
    const response = await requestJson<PlayerNoteResponse>('/api/notes', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrfToken,
        },
        body: JSON.stringify({
            battleTag: reference.battleTag,
            entryId: reference.entryId,
            content,
        }),
    });
    const key = getCacheKey(reference, cacheScope);
    bumpNoteRevision(key);
    noteRequests.delete(key);
    return writePlayerNoteCache(
        key,
        response.note,
        {
            cacheScope,
            referenceKey: getReferenceKey(reference),
        },
    );
};
