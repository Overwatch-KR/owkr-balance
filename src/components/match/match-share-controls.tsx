import { useState } from 'react';
import { Check, ClipboardCopy, Download, Loader2, Share2 } from 'lucide-react';
import { normalizeMatchShareCode } from '#domain/balance';
import { getWithExpiry, removeItem, setWithExpiry } from '../../utils/storage';

const MATCH_SHARE_CODE_EXPIRY_MS = 24 * 60 * 60 * 1000;
const MATCH_SHARE_CREATED_CODE_KEY_PREFIX = 'owkr_match_share_created:';
const MATCH_SHARE_IMPORT_CODE_KEY_PREFIX = 'owkr_match_share_import:';

interface MatchShareControlsProps {
    canCreate: boolean;
    isRemote: boolean;
    userId: string;
    onCreate: () => Promise<string>;
    onImport: (code: string) => Promise<void>;
}

type PendingAction = 'create' | 'import' | null;

const readStoredCode = (key: string): string => {
    if (typeof localStorage === 'undefined') return '';
    const code = normalizeMatchShareCode(getWithExpiry<string>(key) ?? '');
    return code.length === 10 ? code : '';
};

/**
 * @description 관리자끼리 현재 명단·팀 배치를 코드로 만들고 다른 관리자의 코드를 불러오는 제어를 제공한다.
 */
export function MatchShareControls({
    canCreate,
    isRemote,
    userId,
    onCreate,
    onImport,
}: MatchShareControlsProps) {
    const createdCodeKey = `${MATCH_SHARE_CREATED_CODE_KEY_PREFIX}${userId}`;
    const importCodeKey = `${MATCH_SHARE_IMPORT_CODE_KEY_PREFIX}${userId}`;
    const [code, setCode] = useState(() => readStoredCode(importCodeKey));
    const [createdCode, setCreatedCode] = useState(() => readStoredCode(createdCodeKey));
    const [pendingAction, setPendingAction] = useState<PendingAction>(null);
    const [copyCompleted, setCopyCompleted] = useState(false);
    const isBusy = pendingAction !== null;

    const handleCreate = async () => {
        if (!isRemote || !canCreate || isBusy) return;
        setPendingAction('create');
        setCopyCompleted(false);
        try {
            const nextCode = await onCreate();
            setCreatedCode(nextCode);
            setWithExpiry(createdCodeKey, nextCode, MATCH_SHARE_CODE_EXPIRY_MS);
        } catch {
            // 상위 화면의 공통 토스트가 실제 오류 메시지를 안내한다.
        } finally {
            setPendingAction(null);
        }
    };

    const handleCodeChange = (value: string) => {
        const nextCode = normalizeMatchShareCode(value);
        setCode(nextCode);
        if (nextCode.length === 10) {
            setWithExpiry(importCodeKey, nextCode, MATCH_SHARE_CODE_EXPIRY_MS);
        } else {
            removeItem(importCodeKey);
        }
    };

    const handleImport = async () => {
        if (!isRemote || code.length !== 10 || isBusy) return;
        setPendingAction('import');
        try {
            await onImport(code);
        } catch {
            // 상위 화면의 공통 토스트가 실제 오류 메시지를 안내한다.
        } finally {
            setPendingAction(null);
        }
    };

    const handleCopy = async () => {
        if (!createdCode || !navigator.clipboard) return;
        try {
            await navigator.clipboard.writeText(createdCode);
            setCopyCompleted(true);
            window.setTimeout(() => setCopyCompleted(false), 1_500);
        } catch {
            setCopyCompleted(false);
        }
    };

    return (
        <section
            className="border-l-2 border-slate-700 bg-slate-950/25 p-4"
            aria-labelledby="match-share-title"
        >
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <Share2 size={16} className="text-cyan-300" aria-hidden="true" />
                        <h2 id="match-share-title" className="text-sm font-semibold text-white">
                            결과 전달
                        </h2>
                    </div>
                    <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-500">
                        현재 팀 결과를 24시간 동안 읽기 전용으로 전달합니다.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => void handleCreate()}
                    disabled={!isRemote || !canCreate || isBusy}
                    title={canCreate
                        ? '현재 팀 배치의 읽기 전용 코드를 만듭니다.'
                        : '최신 팀 배정 결과가 있어야 공유할 수 있습니다.'}
                    className="btn-ghost flex items-center gap-2 text-sm disabled:cursor-not-allowed disabled:opacity-40"
                >
                    {pendingAction === 'create'
                        ? <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                        : <Share2 size={14} aria-hidden="true" />}
                    {pendingAction === 'create' ? '코드 만드는 중…' : '읽기 전용 코드 만들기'}
                </button>
            </div>

            {createdCode && (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-cyan-500/20 bg-cyan-500/[0.035] px-3 py-2">
                    <span className="text-xs text-slate-400">
                        읽기 전용 코드 <strong className="ml-1 font-mono tracking-[0.12em] text-cyan-200">{createdCode}</strong>
                    </span>
                    <button
                        type="button"
                        onClick={() => void handleCopy()}
                        className="flex items-center gap-1.5 text-xs font-medium text-cyan-300 transition-colors hover:text-cyan-200"
                    >
                        {copyCompleted
                            ? <Check size={13} aria-hidden="true" />
                            : <ClipboardCopy size={13} aria-hidden="true" />}
                        {copyCompleted ? '복사됨' : '코드 복사'}
                    </button>
                </div>
            )}

            <div className="mt-4">
                <span className="text-xs font-medium text-slate-400">공유받은 읽기 전용 코드 불러오기</span>
            </div>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                <label htmlFor="match-share-code" className="sr-only">내전 공유 코드</label>
                <input
                    id="match-share-code"
                    value={code}
                    onChange={event => handleCodeChange(event.target.value)}
                    onKeyDown={event => {
                        if (event.key === 'Enter') void handleImport();
                    }}
                    disabled={!isRemote || isBusy}
                    maxLength={10}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="읽기 전용 코드 10자리"
                    className="min-w-0 flex-1 rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 font-mono text-sm uppercase tracking-[0.16em] text-white outline-none transition-colors placeholder:font-sans placeholder:tracking-normal placeholder:text-slate-500 focus:border-cyan-500 disabled:cursor-not-allowed disabled:opacity-50"
                />
                <button
                    type="button"
                    onClick={() => void handleImport()}
                    disabled={!isRemote || code.length !== 10 || isBusy}
                    className="btn-primary flex shrink-0 items-center justify-center gap-2 text-sm disabled:cursor-not-allowed disabled:opacity-40"
                >
                    {pendingAction === 'import'
                        ? <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                        : <Download size={14} aria-hidden="true" />}
                    {pendingAction === 'import' ? '불러오는 중…' : '코드 불러오기'}
                </button>
            </div>

            {!isRemote && (
                <p className="mt-3 text-xs text-amber-300/80">
                    원격 Redis와 유저 시트를 사용하는 실행 환경에서만 공유할 수 있습니다.
                </p>
            )}
        </section>
    );
}
