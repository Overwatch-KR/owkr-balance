import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { UIEvent } from 'react';
import { AlertCircle, ChevronDown, ChevronUp, LocateFixed } from 'lucide-react';
import type { RosterValidationIssue } from '../../../utils/parser';
import type { TextHighlightRange } from '../../../utils/parser/avoidance-highlight';

interface RosterPasteTextareaProps {
    isValidationPending: boolean;
    issues: RosterValidationIssue[];
    onChange: (value: string) => void;
    value: string;
}

const renderHighlightedText = (
    text: string,
    ranges: TextHighlightRange[],
) => {
    const nodes = [];
    let cursor = 0;

    for (const [index, range] of ranges.entries()) {
        if (cursor < range.start) {
            nodes.push(
                <span key={`plain-${index}`} className="text-transparent">
                    {text.slice(cursor, range.start)}
                </span>,
            );
        }
        nodes.push(
            <mark
                key={`highlight-${index}`}
                data-highlight-start={range.start}
                className="rounded-sm bg-rose-500/25 text-rose-200 underline decoration-2 decoration-rose-400 underline-offset-2"
            >
                {text.slice(range.start, range.end)}
            </mark>,
        );
        cursor = range.end;
    }

    if (cursor < text.length) {
        nodes.push(
            <span key="plain-last" className="text-transparent">
                {text.slice(cursor)}
            </span>,
        );
    }
    return nodes;
};

const mergeHighlightRanges = (ranges: TextHighlightRange[]): TextHighlightRange[] => {
    const merged: TextHighlightRange[] = [];
    for (const range of [...ranges].sort((left, right) => (
        left.start - right.start || left.end - right.end
    ))) {
        const previous = merged.at(-1);
        if (!previous || range.start > previous.end) {
            merged.push({ ...range });
            continue;
        }
        previous.end = Math.max(previous.end, range.end);
    }
    return merged;
};

/**
 * @description Discord 명단 입력과 문제 포지션 구간을 같은 위치에 겹쳐 표시한다.
 */
const RosterPasteTextarea = ({
    isValidationPending,
    issues,
    onChange,
    value,
}: RosterPasteTextareaProps) => {
    const highlightLayerRef = useRef<HTMLDivElement>(null);
    const shouldAutoNavigateAfterPasteRef = useRef(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [activeIssueIndex, setActiveIssueIndex] = useState(0);
    const ranges = useMemo(() => (
        mergeHighlightRanges(issues.flatMap(issue => issue.ranges))
    ), [issues]);
    const navigationTargets = useMemo(() => issues.flatMap((issue) => {
        const firstRange = issue.ranges[0];
        const lastRange = issue.ranges.at(-1);
        if (!firstRange || !lastRange) return [];
        return [{
            end: lastRange.end,
            start: firstRange.start,
            issue,
        }];
    }), [issues]);
    const hasIssues = ranges.length > 0;
    const currentIssueIndex = navigationTargets.length > 0
        ? activeIssueIndex % navigationTargets.length
        : 0;
    const currentTarget = navigationTargets[currentIssueIndex];

    const syncHighlightScroll = useCallback((textarea: HTMLTextAreaElement) => {
        if (!highlightLayerRef.current) return;
        highlightLayerRef.current.style.transform = (
            `translate(${-textarea.scrollLeft}px, ${-textarea.scrollTop}px)`
        );
    }, []);

    useLayoutEffect(() => {
        if (textareaRef.current) syncHighlightScroll(textareaRef.current);
    }, [ranges, syncHighlightScroll]);

    const scrollToIssue = useCallback((targetIndex: number) => {
        if (!textareaRef.current || navigationTargets.length === 0) return;
        const target = navigationTargets[targetIndex];
        const targetMark = highlightLayerRef.current?.querySelector<HTMLElement>(
            `[data-highlight-start="${target.start}"]`,
        );
        const textarea = textareaRef.current;

        textarea.focus({ preventScroll: true });
        textarea.setSelectionRange(target.start, target.end);
        if (targetMark) {
            textarea.scrollTop = Math.max(
                0,
                targetMark.offsetTop - (textarea.clientHeight / 2) + (targetMark.offsetHeight / 2),
            );
        }
        syncHighlightScroll(textarea);
    }, [navigationTargets, syncHighlightScroll]);

    useLayoutEffect(() => {
        if (isValidationPending || !shouldAutoNavigateAfterPasteRef.current) return;
        shouldAutoNavigateAfterPasteRef.current = false;
        if (navigationTargets.length > 0) scrollToIssue(0);
    }, [isValidationPending, navigationTargets.length, scrollToIssue]);

    const navigateToIssue = (direction: -1 | 1) => {
        if (navigationTargets.length === 0) return;
        const nextIndex = (
            currentIssueIndex + direction + navigationTargets.length
        ) % navigationTargets.length;
        setActiveIssueIndex(nextIndex);
        scrollToIssue(nextIndex);
    };

    return (
        <div className="space-y-2">
            <div className="relative">
                {hasIssues && (
                    <div
                        className="pointer-events-none absolute inset-y-px left-px right-[9px] z-10 overflow-hidden rounded-[7px]"
                        aria-hidden="true"
                    >
                        <div
                            ref={highlightLayerRef}
                            className="min-h-full whitespace-pre-wrap break-words px-4 py-3 font-mono text-sm leading-relaxed"
                        >
                            {renderHighlightedText(value, ranges)}
                        </div>
                    </div>
                )}
                <textarea
                    ref={textareaRef}
                    id="discord-chat"
                    name="discord-chat"
                    autoComplete="off"
                    spellCheck={false}
                    className={`input-base custom-scrollbar h-40 resize-none overflow-y-scroll font-mono text-sm leading-relaxed ${
                        hasIssues
                            ? 'border-rose-500/70 focus:border-rose-400 focus:ring-rose-500/20'
                            : ''
                    }`}
                    placeholder={`예시:\nkimjungun#11853 다5/다1/다5\n학살#38848 다3/마4/다4\nAki#34981 에3/플1/미배치\n재봉이#31207 그5!/마1!/마4`}
                    value={value}
                    onChange={event => onChange(event.target.value)}
                    onPaste={() => {
                        shouldAutoNavigateAfterPasteRef.current = true;
                        setActiveIssueIndex(0);
                    }}
                    onScroll={(event: UIEvent<HTMLTextAreaElement>) => (
                        syncHighlightScroll(event.currentTarget)
                    )}
                    aria-invalid={hasIssues || undefined}
                    aria-describedby={hasIssues ? 'roster-paste-error-navigation' : undefined}
                />
            </div>
            {currentTarget && (
                <div
                    id="roster-paste-error-navigation"
                    className="flex min-h-9 items-center gap-2 rounded-lg border border-rose-500/25 bg-rose-500/[0.06] px-2.5 py-1.5"
                    role="status"
                    aria-live="polite"
                >
                    <AlertCircle size={13} className="shrink-0 text-rose-400" aria-hidden="true" />
                    <p className="min-w-0 flex-1 truncate text-[11px] text-rose-200/80">
                        <span className="font-semibold text-rose-200">
                            오류 {currentIssueIndex + 1}/{navigationTargets.length}
                        </span>
                        {' · '}
                        {currentTarget.issue.discordName || currentTarget.issue.playerName || '입력 형식'}
                        {' · '}
                        {currentTarget.issue.message}
                    </p>
                    <div className="flex shrink-0 items-center gap-0.5">
                        {navigationTargets.length === 1 ? (
                            <button
                                type="button"
                                onClick={() => scrollToIssue(0)}
                                className="inline-flex min-h-7 items-center gap-1 rounded-md px-2 text-[11px] font-medium text-rose-100 transition-colors hover:bg-rose-400/10"
                            >
                                <LocateFixed size={13} aria-hidden="true" />
                                오류 위치로 이동
                            </button>
                        ) : (
                            <>
                                <button
                                    type="button"
                                    onClick={() => navigateToIssue(-1)}
                                    className="inline-flex h-7 w-7 items-center justify-center rounded-md text-rose-200/70 transition-colors hover:bg-rose-400/10 hover:text-rose-100"
                                    aria-label="이전 입력 오류로 이동"
                                >
                                    <ChevronUp size={15} aria-hidden="true" />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => navigateToIssue(1)}
                                    className="inline-flex h-7 w-7 items-center justify-center rounded-md text-rose-200/70 transition-colors hover:bg-rose-400/10 hover:text-rose-100"
                                    aria-label="다음 입력 오류로 이동"
                                >
                                    <ChevronDown size={15} aria-hidden="true" />
                                </button>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default RosterPasteTextarea;
