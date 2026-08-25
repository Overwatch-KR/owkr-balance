import { useState, type KeyboardEvent } from 'react';
import {
    AlertCircle,
    ArrowRight,
    Check,
    CheckCircle2,
    ChevronDown,
    ChevronUp,
    ClipboardPaste,
    Info,
    MessageSquareText,
    Trash2,
} from 'lucide-react';

export interface DiscordSheetImportResult {
    addedCount: number;
    failedCount: number;
    updatedCount: number;
    warningCount: number;
}

interface DiscordSheetImportProps {
    onImport: (text: string) => DiscordSheetImportResult | null;
}

const IMPORT_STEPS = [
    '디스코드에서 복사',
    '여기에 붙여넣기',
    '편집 표에 반영',
] as const;

/**
 * @description 붙여넣은 명단에서 실제 내용이 있는 줄만 센다.
 */
const countDiscordSheetImportLines = (text: string) => (
    text.split(/\r?\n/).filter(line => line.trim()).length
);

/**
 * @description Discord 명단 텍스트를 시트 행으로 가져오는 독립 입력 패널을 제공한다.
 */
export function DiscordSheetImport({ onImport }: DiscordSheetImportProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [text, setText] = useState('');
    const [result, setResult] = useState<DiscordSheetImportResult | null>(null);
    const [error, setError] = useState('');
    const lineCount = countDiscordSheetImportLines(text);

    const apply = () => {
        if (!text.trim()) {
            setError('먼저 디스코드에서 복사한 명단을 붙여넣어 주세요.');
            return;
        }
        const nextResult = onImport(text);
        if (!nextResult) {
            setError('읽어낸 유저가 없습니다. 예시처럼 배틀태그와 역할별 티어를 입력해 주세요.');
            setResult(null);
            return;
        }
        setError('');
        setResult(nextResult);
        setText('');
    };

    const handleTextareaKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
        if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
            event.preventDefault();
            apply();
        }
    };

    const clearText = () => {
        setText('');
        setError('');
        setResult(null);
    };

    if (!isOpen) {
        return (
            <div
                id="user-sheet-import"
                className="shrink-0 border-b border-slate-800 bg-slate-950/20 px-4 py-3 md:px-6"
            >
                <button
                    type="button"
                    onClick={() => setIsOpen(true)}
                    className="group flex min-h-16 w-full touch-manipulation items-center gap-3 rounded-xl border border-violet-400/20 bg-gradient-to-r from-violet-500/[0.09] via-slate-900/80 to-cyan-500/[0.04] px-3.5 py-3 text-left shadow-sm shadow-black/10 transition-[background-color,border-color,box-shadow] hover:border-violet-400/35 hover:from-violet-500/[0.13] hover:shadow-violet-950/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/70 sm:px-4"
                    aria-controls="discord-sheet-import-panel"
                    aria-expanded="false"
                >
                    <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${
                        result
                            ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300'
                            : 'border-violet-400/25 bg-violet-400/10 text-violet-200'
                    }`}>
                        {result
                            ? <CheckCircle2 size={19} aria-hidden="true" />
                            : <MessageSquareText size={19} aria-hidden="true" />}
                    </span>
                    <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold text-slate-100">
                                {result ? '디스코드 명단 반영 완료' : '디스코드 채팅에서 가져오기'}
                            </span>
                            {!result && (
                                <span className="rounded-full bg-violet-400/10 px-2 py-0.5 text-[10px] font-semibold text-violet-200">
                                    빠른 입력
                                </span>
                            )}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-slate-500">
                            {result
                                ? `신규 ${result.addedCount}명 · 업데이트 ${result.updatedCount}명`
                                : '채팅 명단을 붙여넣어 여러 유저를 한 번에 추가하거나 업데이트하세요.'}
                        </span>
                    </span>
                    <span className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-lg px-2.5 text-xs font-semibold text-violet-200 transition-colors group-hover:bg-violet-400/10 group-hover:text-violet-100">
                        {result ? '다시 열기' : '열기'}
                        <ChevronDown size={15} aria-hidden="true" />
                    </span>
                </button>
            </div>
        );
    }

    return (
        <section
            id="user-sheet-import"
            className="custom-scrollbar max-h-[min(42dvh,30rem)] shrink-0 overflow-y-auto border-b border-violet-400/20 bg-gradient-to-br from-violet-500/[0.07] via-slate-950/40 to-cyan-500/[0.035] px-4 py-4 md:px-6"
            aria-labelledby="discord-sheet-import-title"
        >
            <div id="discord-sheet-import-panel">
                <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-violet-400/25 bg-violet-400/10 text-violet-200">
                            <ClipboardPaste size={19} aria-hidden="true" />
                        </span>
                        <div className="min-w-0">
                            <h3
                                id="discord-sheet-import-title"
                                className="text-pretty text-sm font-semibold text-violet-50"
                            >
                                디스코드 채팅에서 명단 가져오기
                            </h3>
                            <p className="mt-1 text-xs leading-relaxed text-slate-400">
                                여러 줄을 한 번에 붙여넣고, 확인한 뒤 편집 표에 반영하세요.
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => setIsOpen(false)}
                        className="inline-flex min-h-9 shrink-0 touch-manipulation items-center gap-1 rounded-lg px-2.5 text-xs font-medium text-slate-400 transition-colors hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/70"
                        aria-controls="discord-sheet-import-panel"
                        aria-expanded="true"
                    >
                        접기
                        <ChevronUp size={14} aria-hidden="true" />
                    </button>
                </div>

                <ol className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3" aria-label="명단 가져오기 순서">
                    {IMPORT_STEPS.map((step, index) => (
                        <li
                            key={step}
                            className="flex min-w-0 items-center gap-2 rounded-lg border border-white/[0.055] bg-slate-950/30 px-3 py-2"
                        >
                            <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-violet-400/15 text-[10px] font-bold tabular-nums text-violet-200">
                                {index + 1}
                            </span>
                            <span className="truncate text-[11px] font-medium text-slate-300">{step}</span>
                            {index < IMPORT_STEPS.length - 1 && (
                                <ArrowRight
                                    size={12}
                                    className="ml-auto hidden shrink-0 text-slate-600 sm:block"
                                    aria-hidden="true"
                                />
                            )}
                        </li>
                    ))}
                </ol>

                <div className="mt-3">
                    <div className="mb-1.5 flex items-center justify-between gap-3">
                        <label
                            htmlFor="discord-sheet-import-text"
                            className="text-xs font-semibold text-slate-200"
                        >
                            명단 텍스트
                        </label>
                        <span className="text-[11px] tabular-nums text-slate-500" aria-live="polite">
                            {lineCount > 0 ? `${lineCount}줄 감지` : '붙여넣기 대기'}
                        </span>
                    </div>
                    <div className="overflow-hidden rounded-xl border border-slate-700/70 bg-slate-950/65 shadow-inner shadow-black/10 transition-[border-color,box-shadow] focus-within:border-violet-400/60 focus-within:ring-2 focus-within:ring-violet-400/15">
                        <textarea
                            id="discord-sheet-import-text"
                            name="discord-sheet-import-text"
                            autoComplete="off"
                            value={text}
                            onChange={event => {
                                setText(event.target.value);
                                setError('');
                                setResult(null);
                            }}
                            onKeyDown={handleTextareaKeyDown}
                            className="custom-scrollbar min-h-32 w-full resize-y bg-transparent px-4 py-3 font-mono text-xs leading-relaxed text-slate-100 outline-none placeholder:text-slate-600"
                            placeholder={'상민역할 아이콘, 다이아 — 오늘 오후 3:02\nPlayer#1234 다3!/플2?/마5\n재봉역할 아이콘, 플래티넘 — 오늘 오후 3:03\nOther#5678 플1/다4/골2\n…'}
                            spellCheck={false}
                            aria-describedby="discord-sheet-import-help discord-sheet-import-status"
                        />
                        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800/80 px-3 py-2">
                            <p id="discord-sheet-import-help" className="text-[10px] leading-relaxed text-slate-500">
                                이름·시간 줄까지 그대로 붙여넣으세요. 중복 배틀태그는 기존 특이사항을 유지합니다.
                            </p>
                            <button
                                type="button"
                                onClick={clearText}
                                disabled={!text && !result && !error}
                                className="inline-flex min-h-8 touch-manipulation items-center gap-1.5 rounded-md px-2 text-[11px] font-medium text-slate-500 transition-colors hover:bg-white/5 hover:text-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/70 disabled:cursor-default disabled:opacity-30"
                            >
                                <Trash2 size={12} aria-hidden="true" />
                                입력 지우기
                            </button>
                        </div>
                    </div>
                </div>

                <div
                    id="discord-sheet-import-status"
                    className="mt-3 min-h-5 text-xs"
                    role="status"
                    aria-live="polite"
                >
                    {error && (
                        <div className="flex items-start gap-2 rounded-lg border border-rose-400/20 bg-rose-400/[0.07] px-3 py-2 text-rose-200">
                            <AlertCircle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
                            <span className="leading-relaxed">{error}</span>
                        </div>
                    )}
                    {result && !error && (
                        <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.065] p-3">
                            <div className="flex items-start gap-2.5">
                                <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-400/15 text-emerald-300">
                                    <Check size={14} strokeWidth={2.5} aria-hidden="true" />
                                </span>
                                <div className="min-w-0">
                                    <p className="font-semibold text-emerald-200">편집 표에 반영했습니다.</p>
                                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                                        <span className="rounded-md bg-emerald-400/10 px-2 py-1 text-[11px] text-emerald-200">
                                            신규 {result.addedCount}명
                                        </span>
                                        <span className="rounded-md bg-cyan-400/10 px-2 py-1 text-[11px] text-cyan-200">
                                            업데이트 {result.updatedCount}명
                                        </span>
                                        {result.failedCount > 0 && (
                                            <span className="rounded-md bg-rose-400/10 px-2 py-1 text-[11px] text-rose-200">
                                                읽지 못함 {result.failedCount}줄
                                            </span>
                                        )}
                                        {result.warningCount > 0 && (
                                            <span className="rounded-md bg-amber-400/10 px-2 py-1 text-[11px] text-amber-200">
                                                비선호 확인 {result.warningCount}명
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                            <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-slate-400">
                                <Info size={12} className="mt-0.5 shrink-0 text-slate-500" aria-hidden="true" />
                                아직 저장 전입니다. 아래 표를 확인한 뒤 상단의 ‘시트 저장’을 눌러 주세요.
                            </p>
                        </div>
                    )}
                </div>

                <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <p className="inline-flex items-start gap-1.5 text-[11px] leading-relaxed text-slate-500">
                        <Info size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
                        선호·비선호 기호(!, ?, ★)는 반영할 때 자동으로 제거합니다.
                    </p>
                    <button
                        type="button"
                        onClick={apply}
                        className="btn-primary inline-flex min-h-10 w-full shrink-0 items-center justify-center gap-2 px-4 text-xs sm:w-auto"
                    >
                        <ClipboardPaste size={14} aria-hidden="true" />
                        {lineCount > 0 ? `${lineCount}줄 편집 표에 반영` : '편집 표에 반영'}
                        <kbd className="hidden rounded border border-white/15 bg-black/15 px-1.5 py-0.5 font-sans text-[9px] font-medium text-white/60 md:inline">
                            ⌘/Ctrl Enter
                        </kbd>
                    </button>
                </div>
            </div>
        </section>
    );
}
