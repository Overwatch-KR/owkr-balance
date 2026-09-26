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
    <header className="mb-5 flex flex-col gap-3 border-b border-slate-800 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 flex-1">
            {eyebrow && (
                <p className="mb-2 text-xs font-medium text-slate-500">
                    {eyebrow}
                </p>
            )}
            <h1 className="text-pretty text-2xl font-semibold tracking-tight text-white sm:text-[28px]">{title}</h1>
            {description && (
                <div className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-400">
                    {description}
                </div>
            )}
            {meta && <div className="mt-3 flex flex-wrap items-center gap-2">{meta}</div>}
        </div>
        {actions && (
            <div className="flex shrink-0 flex-wrap items-center gap-2 lg:justify-end">
                {actions}
            </div>
        )}
    </header>
);
