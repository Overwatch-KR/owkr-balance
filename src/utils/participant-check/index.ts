import type { Player } from '../../types';

export interface ParticipantCheckResult {
    mentionedNames: string[];
    completedNames: string[];
    missingNames: string[];
    unmatchedPlayers: Player[];
}

/**
 * @description 디스코드 표시 이름을 멘션 대조에 사용할 수 있는 형태로 정규화한다.
 */
const normalizeParticipantIdentity = (value: string): string => value
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
    .replace(/\\([_*~`])/g, '$1')
    .replace(/^[\s@*]+|[\s*,，、;]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('ko-KR');

/**
 * @description 디스코드 이름과 예전 숫자 태그 표기의 차이를 흡수하는 대조용 별칭을 만든다.
 */
const getParticipantIdentityVariants = (value: string): string[] => {
    const normalized = normalizeParticipantIdentity(value);
    if (!normalized) return [];

    const withoutDiscriminator = normalized.replace(/#\d{4,}$/, '').trim();
    return withoutDiscriminator && withoutDiscriminator !== normalized
        ? [normalized, withoutDiscriminator]
        : [normalized];
};

/**
 * @description 굵은 글씨 또는 일반 텍스트로 복사된 디스코드 멘션에서 표시 이름을 추출한다.
 */
export const extractMentionedParticipantNames = (text: string): string[] => {
    const mentionPattern = /\*\*\s*@([^*\n]+?)\s*\*\*|(?:^|[\s,])@([^\s,*]+)/gmu;
    const names: string[] = [];
    const seenNames = new Set<string>();

    for (const match of text.matchAll(mentionPattern)) {
        const name = (match[1] ?? match[2] ?? '')
            .replace(/\\([_*~`])/g, '$1')
            .replace(/[\s,，、;]+$/g, '')
            .trim();
        const normalizedName = normalizeParticipantIdentity(name);

        if (!normalizedName || seenNames.has(normalizedName)) continue;
        names.push(name);
        seenNames.add(normalizedName);
    }

    return names;
};

/**
 * @description 멘션과 현재 플레이어를 1:1 대조해 양쪽에서 일치하지 않는 참가자를 찾는다.
 */
export const compareMentionedParticipants = (
    text: string,
    players: Player[],
    additionalNames: string[] = [],
): ParticipantCheckResult => {
    const mentionedNames = extractMentionedParticipantNames(text);
    const seenMentionedNames = new Set(
        mentionedNames.map(normalizeParticipantIdentity),
    );
    for (const additionalName of additionalNames) {
        const normalizedName = normalizeParticipantIdentity(additionalName);
        if (!normalizedName || seenMentionedNames.has(normalizedName)) continue;
        mentionedNames.push(additionalName.trim());
        seenMentionedNames.add(normalizedName);
    }
    const playerIdentities = players.map((player) => {
        const identities = new Set([
            player.discordName,
            player.name,
            player.name.split('#')[0],
        ].flatMap(identity => identity ? getParticipantIdentityVariants(identity) : []));
        return { playerId: player.id, identities };
    });
    const matchedPlayerIds = new Set<number>();
    const completedNames: string[] = [];
    const missingNames: string[] = [];

    for (const name of mentionedNames) {
        const mentionIdentities = getParticipantIdentityVariants(name);
        const candidates = playerIdentities.filter(({ playerId, identities }) => (
            !matchedPlayerIds.has(playerId)
            && mentionIdentities.some(identity => identities.has(identity))
        ));

        if (candidates.length === 1) {
            completedNames.push(name);
            matchedPlayerIds.add(candidates[0].playerId);
        } else {
            missingNames.push(name);
        }
    }

    const unmatchedPlayers = players.filter(player => !matchedPlayerIds.has(player.id));

    return { mentionedNames, completedNames, missingNames, unmatchedPlayers };
};
