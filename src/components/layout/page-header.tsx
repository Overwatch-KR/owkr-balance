import type { ReactNode } from 'react';

interface PageHeaderProps {
    actions?: ReactNode;
    description?: ReactNode;
    eyebrow?: string;
    meta?: ReactNode;
    title: string;
}

/**
 * @description 전체 페이지와 작업실에서 같은 제목·설명·보조 액션 구조를 제공한다.
 */
export const PageHeader = ({
    actions,
    description,
    eyebrow,
    meta,
    title,
}: PageHeaderProps) => (
    <header className="mb-5 flex flex-col gap-3 border-b border-slate-800/90 pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 flex-1">
            {eyebrow && (
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-cyan-300/80">
                    {eyebrow}
                </p>
            )}
            <div className="flex min-w-0 items-center gap-3">
                <span className="h-7 w-1 shrink-0 rounded-sm bg-cyan-400" aria-hidden="true" />
                <h1 className="text-pretty text-2xl font-semibold tracking-tight text-white sm:text-[28px]">{title}</h1>
            </div>
            {description && (
                <div className="mt-1.5 max-w-3xl pl-4 text-sm leading-relaxed text-slate-400">
                    {description}
                </div>
            )}
            {meta && <div className="mt-3 flex flex-wrap items-center gap-2 pl-4">{meta}</div>}
        </div>
        {actions && (
            <div className="flex shrink-0 flex-wrap items-center gap-2 lg:justify-end">
                {actions}
            </div>
        )}
    </header>
);
