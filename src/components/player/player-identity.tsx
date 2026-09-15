import type { Player } from '../../types';

interface PlayerIdentityProps {
    player: Player;
    align?: 'left' | 'right';
    layout?: 'stacked' | 'inline';
    grow?: boolean;
}

/**
 * @description 디스코드 표시 이름을 우선 보여주고 다른 배틀태그를 함께 표시한다.
 */
export const PlayerIdentity = ({ player, align = 'left', layout = 'stacked', grow = true }: PlayerIdentityProps) => {
    const discordName = player.discordName?.trim();
    const hasDistinctDiscordName = Boolean(discordName)
        && discordName?.localeCompare(player.name, undefined, { sensitivity: 'accent' }) !== 0;

    if (layout === 'inline') {
        return (
            <span className={`flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5 ${
                align === 'right' ? 'justify-end text-right' : 'text-left'
            }`}>
                <span className="break-words text-sm font-semibold text-slate-100">
                    {hasDistinctDiscordName ? discordName : player.name}
                </span>
                {hasDistinctDiscordName && (
                    <>
                        <span className="text-xs text-slate-700" aria-hidden="true">·</span>
                        <span className="break-all font-mono text-xs font-normal text-slate-400" translate="no">
                            {player.name}
                        </span>
                    </>
                )}
            </span>
        );
    }

    return (
        <span className={`flex min-w-0 flex-col ${grow ? 'flex-1' : ''} ${
            align === 'right' ? 'items-end text-right' : 'items-start text-left'
        }`}>
            <span className="max-w-full truncate text-sm font-semibold text-slate-100">
                {hasDistinctDiscordName ? discordName : player.name}
            </span>
            {hasDistinctDiscordName && (
                <span className="max-w-full truncate text-[11px] font-normal text-slate-400" translate="no">
                    {player.name}
                </span>
            )}
        </span>
    );
};
