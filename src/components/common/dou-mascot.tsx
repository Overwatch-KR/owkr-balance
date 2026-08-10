import { useState, type CSSProperties } from 'react';

const MASCOT_PATHS = {
    default: '/mascot/dou-default.svg',
    chat: '/mascot/dou-chat.svg',
    policy: '/mascot/dou-policy.svg',
    error: '/mascot/dou-error.svg',
    loading: '/mascot/dou-loading.svg',
    search: '/mascot/dou-search.svg',
    empty: '/mascot/dou-empty.svg',
    vote: '/mascot/dou-vote.svg',
    success: '/mascot/dou-success.svg',
    event: '/mascot/dou-event.svg',
    notification: '/mascot/dou-notification.svg',
    'link-expired': '/mascot/dou-link-expired.svg',
} as const;

export type DouMascotVariant = keyof typeof MASCOT_PATHS;
export const DOU_MASCOT_VARIANTS = Object.keys(MASCOT_PATHS) as DouMascotVariant[];

interface DouMascotProps {
    variant?: DouMascotVariant;
    size?: number | string;
    className?: string;
    alt?: string;
    decorative?: boolean;
}

/**
 * @description 고정된 도우 SVG 에셋을 접근성 및 로딩 실패 처리와 함께 표시한다.
 */
export function DouMascot({
    variant = 'default',
    size = 160,
    className,
    alt,
    decorative = false,
}: DouMascotProps) {
    const [hasFailed, setHasFailed] = useState(false);
    const isDecorative = decorative || !alt;
    const numericSize = typeof size === 'number' ? size : undefined;
    const sizeStyle: CSSProperties = { width: size, height: size };
    const containerClassName = ['flex shrink-0 items-center justify-center', className].filter(Boolean).join(' ');

    if (hasFailed) {
        return (
            <span
                className={`${containerClassName} rounded-full border border-slate-700/70 bg-surface text-cyan-300`}
                style={sizeStyle}
                role={isDecorative ? undefined : 'img'}
                aria-hidden={isDecorative || undefined}
                aria-label={isDecorative ? undefined : alt}
            >
                <span aria-hidden="true">·</span>
            </span>
        );
    }

    return (
        <span className={containerClassName} style={sizeStyle} aria-hidden={isDecorative || undefined}>
            <img
                className="h-full w-full"
                src={MASCOT_PATHS[variant]}
                alt={isDecorative ? '' : alt}
                width={numericSize}
                height={numericSize}
                onError={() => setHasFailed(true)}
            />
        </span>
    );
}
