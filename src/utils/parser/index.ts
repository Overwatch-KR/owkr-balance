import type { Player, Rank, Role } from 'src/types';
import { getAvailableTiers, getScore, TIERS } from 'src/constants';
import { normalizePlayerRolePreferences } from 'src/utils/role-preference';
import { findAvoidedRoleHighlightRanges } from './avoidance-highlight';

/**
 * @description 티어 문자열을 정규화해 TIERS 인덱스로 매핑한다.
 * @param tierStr - 티어 문자열 (예: "에메랄드", "에메", "다이아", "플레" 등)
 * @returns 티어 인덱스 (0-8), 찾지 못하면 -1
 */
const findTierIndex = (tierStr: string): number => {
    const normalized = tierStr.toLowerCase().trim();

    const tierMap: Record<string, number> = {
        // 브론즈 (0)
        '브론즈': 0, '브론': 0, '브': 0, 'bronze': 0, 'br': 0,
        // 실버 (1)
        '실버': 1, '실': 1, 'silver': 1, 'si': 1,
        // 골드 (2)
        '골드': 2, '골': 2, 'gold': 2, 'go': 2,
        // 플래티넘 (3)
        '플래티넘': 3, '플레티넘': 3, '플래': 3, '플레': 3, '플': 3, 'platinum': 3, 'plat': 3, 'pl': 3,
        // 에메랄드 (4)
        '에메랄드': 4, '에메': 4, '에매': 4, '애매': 4, '애': 4,
        'emerald': 4, 'eme': 4, 'em': 4, 'e': 4,
        // 다이아몬드 (5)
        '다이아몬드': 5, '다이아': 5, '다이': 5, '다': 5, 'diamond': 5, 'dia': 5, 'di': 5,
        // 마스터 (6)
        '마스터': 6, '마스': 6, '마': 6, 'master': 6, 'ma': 6,
        // 그랜드마스터 (7)
        '그랜드마스터': 7, '그마': 7, '그': 7, 'grandmaster': 7, 'gm': 7,
        // 챔피언 (8)
        '챔피언': 8, '챔피': 8, '챔': 8, 'champion': 8, 'champ': 8, 'ch': 8
    };

    if (tierMap[normalized] !== undefined) {
        return getAvailableTiers().indexOf(TIERS[tierMap[normalized]]);
    }

    // 부분 매칭 시도
    for (const [key, idx] of Object.entries(tierMap)) {
        if (key.length === 1) continue;
        if (normalized.startsWith(key) || key.startsWith(normalized)) {
            return getAvailableTiers().indexOf(TIERS[idx]);
        }
    }

    return -1;
};

/**
 * @description 역할 문자열을 표준 역할 타입으로 정규화한다.
 * @param roleStr - 역할 문자열 (예: "탱커", "탱", "딜러", "힐러", 이모지 등)
 * @returns 'TANK' | 'DPS' | 'SUPPORT' | null
 */
const parseRole = (roleStr: string): 'TANK' | 'DPS' | 'SUPPORT' | null => {
    const normalized = roleStr.toLowerCase().trim();

    // 이모지 패턴 먼저 체크 (더 구체적인 패턴)
    if (normalized.includes('ob_tank')) return 'TANK';
    if (normalized.includes('oc_damage')) return 'DPS';
    if (normalized.includes('od_support')) return 'SUPPORT';

    // 한글 패턴
    if (normalized.includes('탱커') || normalized.includes('탱')) return 'TANK';
    if (normalized.includes('딜러') || normalized.includes('딜')) return 'DPS';
    if (normalized.includes('힐러') || normalized.includes('힐')) return 'SUPPORT';

    // 영문 단축키 (단독 문자는 정확히 매칭)
    if (normalized === 't' || normalized.includes('tank')) return 'TANK';
    if (normalized === 'd' || normalized.includes('dps') || normalized.includes('damage')) return 'DPS';
    if (normalized === 's' || normalized.includes('support') || normalized.includes('sup') || normalized.includes('heal')) return 'SUPPORT';

    return null;
};

/**
 * @description 설명이 섞인 문자열에서 처음 발견되는 유효 티어와 등급을 찾는다.
 * @param text - 티어 후보가 포함된 문자열
 * @returns 티어 인덱스와 등급 또는 null
 */
const findRankToken = (text: string): { tierIdx: number; div: number } | null => {
    const matches = text.matchAll(/([가-힣a-zA-Z]+)\s*([1-5])?/g);

    for (const match of matches) {
        const tierIdx = findTierIndex(match[1]);
        if (tierIdx !== -1) {
            return {
                tierIdx,
                div: match[2] ? Number.parseInt(match[2], 10) : 3,
            };
        }
    }

    return null;
};

/**
 * @description 단일 역할 세그먼트를 파싱해 티어/등급/선호 여부를 만든다.
 * @param segment - 파싱할 세그먼트 문자열
 * @returns { tierIdx, div, isPreferred } 또는 null
 */
const parseRankSegment = (segment: string): { tierIdx: number; div: number; isPreferred: boolean; isAvoided: boolean } | null => {
    const isPreferred = segment.includes('!');
    const isAvoided = segment.includes('?');
    const cleanSegment = segment.replace(/[!?]/g, '').trim();

    // 미배치 입력은 예상 티어가 함께 적혀 있어도 더 이상 받지 않는다.
    if (cleanSegment.match(/미배치|언랭|unranked/i)) {
        return null;
    }

    // 예상 티어는 보존하고 영웅, 복귀, 마이크 같은 부가 설명은 제거한다.
    const withoutNotes = cleanSegment
        .replace(/\(\s*예상\s*([^)]*)\)/gi, ' $1 ')
        .replace(/\([^)]*\)/g, ' ')
        .replace(/예상/gi, ' ')
        .trim();

    const rankToken = findRankToken(withoutNotes);
    if (rankToken) return { ...rankToken, isPreferred, isAvoided };

    return null;
};

/**
 * @description 티어/등급/선호를 받아 Rank 객체로 변환한다.
 * @param tierIdx - 티어 인덱스 (0-8)
 * @param div - 등급 (1-5)
 * @param isPreferred - 선호 역할 여부
 * @returns Rank 객체
 */
const createRank = (tierIdx: number, div: number, isPreferred: boolean, isAvoided: boolean): Rank => {
    const tier = getAvailableTiers()[tierIdx];
    return {
        tier,
        div,
        score: getScore(tierIdx, div),
        isPreferred,
        isAvoided
    };
};

/**
 * @description 티어 이모지를 티어 문자열로 변환한다.
 * @param emoji - 이모지 문자열 (예: "ow_Te_diamond", "ow_Tf_master")
 * @returns 티어 문자열 또는 null
 */
const emojiToTier = (emoji: string): string | null => {
    const lower = emoji.toLowerCase();
    if (lower.includes('bronze')) return '브';
    if (lower.includes('silver')) return '실';
    if (lower.includes('gold')) return '골';
    if (lower.includes('plat')) return '플';
    if (lower.includes('emerald')) return '에메';
    if (lower.includes('diamond')) return '다';
    if (lower.includes('master')) return '마';
    if (lower.includes('grand')) return '그';
    if (lower.includes('champ')) return '챔';
    return null;
};

/**
 * @description 디스코드 이모지(:xxx:)를 제거하되 역할 이모지 정보는 추출하고 티어로 변환한다.
 * @param text - 원본 텍스트
 * @returns { cleanText, emojiRoles } 이모지 제거된 텍스트와 역할 정보
 */
const extractEmojiInfo = (text: string): { cleanText: string; emojiRoles: ('TANK' | 'DPS' | 'SUPPORT')[] } => {
    const emojiRoles: ('TANK' | 'DPS' | 'SUPPORT')[] = [];

    // 슬래시로 나누어 각 파트의 역할 이모지 추출
    const parts = text.split('/');
    for (const part of parts) {
        const roleMatch = part.match(/:p(ob_tank|oc_damage|od_support):/i);
        if (roleMatch) {
            const role = parseRole(roleMatch[1]);
            if (role) emojiRoles.push(role);
        }
    }

    // 티어 이모지를 티어 문자열로 변환: ":ow_Te_diamond: 3" -> "다3"
    // 먼저 역할+티어 이모지 조합 처리: ":pob_Tank::ow_Te_diamond: 3" -> "다3"
    let cleanText = text.replace(/:p(ob_tank|oc_damage|od_support):/gi, ''); // 역할 이모지 제거

    // 티어 이모지 변환
    cleanText = cleanText.replace(/:ow_[A-Za-z_]+:\s*(\d)/g, (match, div) => {
        const tierMatch = match.match(/:ow_[A-Za-z]*_([a-z]+):/i);
        if (tierMatch) {
            const tier = emojiToTier(tierMatch[1]);
            if (tier) return `${tier}${div}`;
        }
        return div;
    });

    // 남은 이모지 제거
    cleanText = cleanText.replace(/:[a-zA-Z0-9_]+:/g, ' ').replace(/\s+/g, ' ').trim();

    return { cleanText, emojiRoles };
};

/**
 * @description 한 줄 입력을 정규화→역할/티어 파싱→Player 생성 흐름으로 처리한다.
 * @param line - 파싱할 한 줄의 텍스트
 * @returns Player 객체 또는 파싱 실패 시 null
 */
const parseRawLineToPlayer = (line: string, discordName?: string): Player | null => {
    const trimmedLine = line.trim();
    const cleanLine = trimmedLine.replace(/\s+[XO]$/i, '').trim();

    // 닉네임#태그 추출 (공백 허용)
    const nameMatch = cleanLine.match(/([^\s]+\s*#\s*\d+)/);
    if (!nameMatch) return null;

    const name = nameMatch[1].replace(/\s+/g, '');
    let remainText = cleanLine.slice(cleanLine.indexOf(nameMatch[1]) + nameMatch[1].length).trim();

    // 반복된 선호/비선호 마커를 단일 마커로 정규화한다. (예: !!! -> !, ???? -> ?)
    // 디스코드에서 자주 쓰는 ★도 선호(!)로 취급한다.
    remainText = remainText.replace(/★+/g, '!').replace(/!+/g, '!').replace(/\?+/g, '?');

    // 이모지 정보 추출 및 제거
    const { cleanText, emojiRoles } = extractEmojiInfo(remainText);
    remainText = cleanText;

    // 역할별 랭크 초기화
    let tank: Rank | null = null;
    let dps: Rank | null = null;
    let sup: Rank | null = null;

    // 슬래시로 구분된 형식 처리: "다5/다1/다5" 또는 "탱! 실3/ 딜 브1/ 힐(예상)실2"
    const slashParts = remainText.split('/').map(p => p.trim()).filter(p => p.length > 0);

    if (slashParts.length >= 2) {
        // 슬래시 구분 형식
        let roleIndex = 0; // 0: TANK, 1: DPS, 2: SUPPORT

        for (let i = 0; i < slashParts.length; i++) {
            const part = slashParts[i];

            // 역할이 명시되어 있는지 확인 (예: "탱 실3", "딜 브1", "힐 골3", "탱! 실3")
            const roleMatch = part.match(/^[!?]?(탱(?:커)?|딜(?:러)?|힐(?:러)?|t|d|s)[!?]?\s*/i);
            let currentRole: 'TANK' | 'DPS' | 'SUPPORT' | null = null;
            let rankPart = part;
            let isRolePreferred = part.includes('!') && roleMatch !== null;
            let isRoleAvoided = part.includes('?') && roleMatch !== null;

            if (roleMatch) {
                currentRole = parseRole(roleMatch[1]);
                rankPart = part.slice(roleMatch[0].length).trim();
            }

            // 이모지 역할이 있으면 사용
            if (!currentRole && emojiRoles[i]) {
                currentRole = emojiRoles[i];
            }

            rankPart = rankPart.trim();

            // "!" 처리 - 역할 매칭 없어도 ! 있으면 선호
            if (!isRolePreferred && part.includes('!')) isRolePreferred = true;
            // "?" 처리 - 역할 매칭 없어도 ? 있으면 비선호
            if (!isRoleAvoided && part.includes('?')) isRoleAvoided = true;

            // 랭크 파싱
            const parsed = parseRankSegment(rankPart);

            if (parsed) {
                // 역할에 ! / ? 가 붙었으면 각각 선호/비선호로 처리
                const rank = createRank(
                    parsed.tierIdx,
                    parsed.div,
                    parsed.isPreferred || isRolePreferred,
                    parsed.isAvoided || isRoleAvoided
                );

                if (currentRole === 'TANK') {
                    tank = rank;
                } else if (currentRole === 'DPS') {
                    dps = rank;
                } else if (currentRole === 'SUPPORT') {
                    sup = rank;
                } else {
                    // 역할 명시 없으면 순서대로 할당
                    if (roleIndex === 0) tank = rank;
                    else if (roleIndex === 1) dps = rank;
                    else if (roleIndex === 2) sup = rank;
                }
            }

            // 역할이 명시되지 않은 경우에만 인덱스 증가
            if (!currentRole) {
                roleIndex++;
            }
        }
    } else {
        // 공백 또는 다른 구분자로 분리된 형식
        // "탱커 다이아3 딜러 플레4 힐러 마스터5"
        // "그5! 마1! 마4"
        const normalizedText = remainText.replace(/[,]/g, ' ');

        // 역할-랭크 쌍 추출
        const roleRankPattern = /(탱(?:커)?|딜(?:러)?|힐(?:러)?|t|d|s)?\s*([!?]+)?\s*([가-힣a-zA-Z]+)\s*(\d)?\s*([!?]+)?/gi;
        const matches = [...normalizedText.matchAll(roleRankPattern)];

        let autoIndex = 0;
        let pendingRole: Role | null = null;
        let pendingPreferred = false;
        let pendingAvoided = false;

        for (const m of matches) {
            const roleStr = m[1];
            const roleMarker = m[2];
            const tierStr = m[3];
            const divStr = m[4];
            const tailMarker = m[5];

            // 역할 토큰(탱/딜/힐)만 단독으로 잡힌 경우, 다음 티어 토큰에 역할을 연결한다.
            if (!roleStr) {
                const parsedRoleOnly = parseRole(tierStr);
                if (parsedRoleOnly) {
                    pendingRole = parsedRoleOnly;
                    pendingPreferred = !!roleMarker?.includes('!') || !!tailMarker?.includes('!');
                    pendingAvoided = !!roleMarker?.includes('?') || !!tailMarker?.includes('?');
                    continue;
                }
            }

            // 미배치 역할이 포함된 참가자는 마지막 완전성 검사에서 거부한다.
            if (tierStr.match(/미배치|언랭|unranked|배치/i)) {
                if (!roleStr) autoIndex++;
                continue;
            }

            // "예상" 같은 키워드 무시
            if (tierStr.match(/예상/)) continue;

            const tierIdx = findTierIndex(tierStr);
            if (tierIdx === -1) continue;

            const div = divStr ? parseInt(divStr) : 3;

            // ! 표시는 역할 앞이나 뒤에 올 수 있음
            const hasRolePreferredMarker = roleStr ? remainText.includes(`${roleStr}!`) : false;
            const hasRoleAvoidedMarker = roleStr ? remainText.includes(`${roleStr}?`) : false;
            const isPreferred = !!roleMarker?.includes('!') || !!tailMarker?.includes('!') || hasRolePreferredMarker || pendingPreferred;
            const isAvoided = !!roleMarker?.includes('?') || !!tailMarker?.includes('?') || hasRoleAvoidedMarker || pendingAvoided;
            const rank = createRank(tierIdx, div, isPreferred, isAvoided);

            const explicitRole = roleStr ? parseRole(roleStr) : null;
            const targetRole = explicitRole ?? pendingRole;

            if (targetRole) {
                if (targetRole === 'TANK') tank = rank;
                else if (targetRole === 'DPS') dps = rank;
                else if (targetRole === 'SUPPORT') sup = rank;
            } else {
                // 역할 명시 없으면 순서대로 할당
                if (autoIndex === 0) tank = rank;
                else if (autoIndex === 1) dps = rank;
                else if (autoIndex === 2) sup = rank;
                autoIndex++;
            }

            pendingRole = null;
            pendingPreferred = false;
            pendingAvoided = false;
        }
    }

    // 세 역할 모두 정식 티어가 있어야 유효한 플레이어다.
    if (!tank || !dps || !sup) {
        return null;
    }

    return {
        id: Date.now() + Math.random(),
        name,
        discordName: discordName?.trim() || undefined,
        tank,
        dps,
        sup,
    };
};

/**
 * @description 한 줄 입력을 파싱하되 비선호 역할이 여러 개면 임의 보정 없이 거부한다.
 */
export const parseLineToPlayer = (line: string, discordName?: string): Player | null => {
    const player = parseRawLineToPlayer(line, discordName);
    if (!player || createAvoidedRoleWarning(player)) return null;
    return normalizePlayerRolePreferences(player);
};

/**
 * @description 닉네임만 있는 줄인지 확인한다.
 * @param line - 확인할 줄
 * @returns 닉네임만 있으면 닉네임, 아니면 null
 */
const extractNameOnly = (line: string): string | null => {
    const trimmed = line.trim();
    // 닉네임#태그 패턴만 있고 티어 정보가 없는 경우
    const nameMatch = trimmed.match(/^([^\s]+#\d{4,})$/);
    if (nameMatch) return nameMatch[1];
    return null;
};

/**
 * @description 티어 정보만 있는 줄인지 확인한다.
 * @param line - 확인할 줄
 * @returns 티어 정보가 있으면 true
 */
const hasTierInfoOnly = (line: string): boolean => {
    const trimmed = line.trim();
    if (!trimmed) return false;
    // 닉네임#태그가 있으면 티어 전용 줄이 아님
    if (/[^\s]+#\d{4,}/.test(trimmed)) return false;

    const normalized = trimmed.replace(/★/g, '!').replace(/!+/g, '!').replace(/\?+/g, '?');

    if (normalized === '-' || /미배치|언랭|unranked|배치/i.test(normalized)) return true;
    if (normalized.includes('/') || normalized.includes(':pob_') || normalized.includes(':poc_') || normalized.includes(':pod_')) return true;
    if (/(탱(?:커)?|딜(?:러)?|힐(?:러)?|t|d|s)\s*[!?]?\s*[가-힣a-zA-Z]+\s*\d?/i.test(normalized)) return true;
    if (/^[가-힣a-zA-Z]+\s*\d?\s*[!?]?$/.test(normalized)) return true;

    return false;
};

/**
 * @description 디스코드 복사본의 메시지 헤더에서 작성자 표시 이름을 추출한다.
 * @param line - 디스코드 메시지 헤더 후보
 * @returns 작성자 표시 이름 또는 null
 */
const extractDiscordName = (line: string): string | null => {
    const trimmed = line.trim();
    if (!trimmed.includes('—')) return null;

    const markdownName = trimmed.match(/^\*\*(.+?)\*\*/)?.[1]?.replace(/\\([_*~`])/g, '$1').trim();
    if (markdownName) return markdownName;

    if (trimmed.includes('역할 아이콘')) {
        const accessibleName = trimmed
            .split('역할 아이콘')[0]
            .replace(/\*\*/g, '')
            .replace(/\s*\[[^\]]+\],?\s*$/, '')
            .trim();
        return accessibleName || null;
    }

    const plainName = trimmed
        .split('—')[0]
        .replace(/\*\*/g, '')
        .replace(/\s*\[[^\]]+\],?\s*$/, '')
        .trim();
    return plainName || null;
};

/**
 * @description 파싱 결과 타입
 */
export interface ParseResult {
    players: Player[];
    failedLines: string[];
    avoidedRoleWarnings: AvoidedRoleWarning[];
    validationIssues: RosterValidationIssue[];
}

export interface AvoidedRoleWarning {
    playerName: string;
    discordName?: string;
    avoidedRoleCount: number;
    avoidedRoles: Role[];
}

export interface RosterValidationIssue {
    kind: 'invalid-entry' | 'multiple-avoided-roles';
    message: string;
    playerName?: string;
    discordName?: string;
    ranges: Array<{
        start: number;
        end: number;
    }>;
}

/**
 * @description 파싱 문제에 연결된 배틀태그를 적용 직전에 다시 제외해 정상 참가자만 반환한다.
 */
export const getEligibleRosterPlayers = (
    players: Player[],
    failedLines: string[],
    warnings: AvoidedRoleWarning[],
): Player[] => {
    const rejectedBattleTags = new Set(
        warnings.map(warning => warning.playerName.trim().toLowerCase()),
    );
    for (const line of failedLines) {
        const battleTag = line.match(/[^\s·()]+#\d{4,}/)?.[0];
        if (battleTag) rejectedBattleTags.add(battleTag.trim().toLowerCase());
    }

    return players.filter(player => (
        !rejectedBattleTags.has(player.name.trim().toLowerCase())
    ));
};

const ROLE_ENTRIES = [
    ['TANK', 'tank'],
    ['DPS', 'dps'],
    ['SUPPORT', 'sup'],
] as const;

/**
 * @description 비선호가 여러 개인 원본 플레이어에서 가져오기 제외 안내 정보를 만든다.
 */
const createAvoidedRoleWarning = (player: Player): AvoidedRoleWarning | null => {
    const avoidedRoles = ROLE_ENTRIES
        .filter(([, rankKey]) => player[rankKey].isAvoided)
        .map(([role]) => role);
    if (avoidedRoles.length <= 1) return null;

    return {
        playerName: player.name,
        discordName: player.discordName,
        avoidedRoleCount: avoidedRoles.length,
        avoidedRoles,
    };
};

/**
 * @description 채팅 로그에서 유효한 라인만 골라 Player 배열을 만든다.
 * @param text - 전체 채팅 로그 텍스트
 * @returns 파싱된 Player 배열과 실패한 줄 목록
 */
export const parseMultipleLines = (text: string): ParseResult => {
    const lines = text.split('\n');
    const lineOffsets: number[] = [];
    let nextLineOffset = 0;
    for (const line of lines) {
        lineOffsets.push(nextLineOffset);
        nextLineOffset += line.length + 1;
    }
    const players: Player[] = [];
    const failedLines: string[] = [];
    const failedLineSet = new Set<string>();
    const avoidedRoleWarnings: AvoidedRoleWarning[] = [];
    const validationIssues: RosterValidationIssue[] = [];
    const seenNames = new Set<string>();
    const seenPlayerIdentities = new Set<string>();
    let pendingDiscordName: string | undefined;
    const getLineRange = (startLineIndex: number, endLineIndex = startLineIndex) => {
        let start = lineOffsets[startLineIndex] ?? 0;
        let end = (lineOffsets[endLineIndex] ?? start) + (lines[endLineIndex]?.length ?? 0);
        while (start < end && /\s/.test(text[start])) start += 1;
        while (end > start && /\s/.test(text[end - 1])) end -= 1;
        return { start, end };
    };
    const addFailedLine = (
        line: string,
        startLineIndex: number,
        endLineIndex = startLineIndex,
        message = '배틀태그와 역할 티어 형식을 확인해 주세요.',
    ) => {
        const normalized = line.trim();
        if (!normalized || failedLineSet.has(normalized)) return;
        failedLines.push(normalized);
        failedLineSet.add(normalized);
        const range = getLineRange(startLineIndex, endLineIndex);
        validationIssues.push({
            kind: 'invalid-entry',
            message,
            playerName: normalized.match(/[^\s·()]+\s*#\s*\d+/)?.[0]?.replace(/\s+/g, ''),
            discordName: pendingDiscordName,
            ranges: range.start < range.end ? [range] : [],
        });
    };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        const discordName = extractDiscordName(line);
        if (discordName) {
            pendingDiscordName = discordName;
            continue;
        }

        // 디스코드 메타데이터 라인 제외 (역할 아이콘, 시간 등)
        if (line.includes('역할 아이콘') || line.includes('—')) continue;

        const trimmedLine = line.trim();
        const hasBattleTag = /[^\s#]+\s*#\s*\d{4,}/.test(line);
        if (line.includes('#') && !hasBattleTag) {
            addFailedLine(
                pendingDiscordName ? `${pendingDiscordName} · ${trimmedLine}` : trimmedLine,
                i,
                i,
                '배틀태그는 Player#1234 형식으로 입력해 주세요.',
            );
            pendingDiscordName = undefined;
            continue;
        }
        if (!hasBattleTag && hasTierInfoOnly(line)) {
            addFailedLine(pendingDiscordName
                ? `${pendingDiscordName} · ${trimmedLine}`
                : trimmedLine, i, i, '배틀태그가 없어 가져올 수 없습니다.');
            pendingDiscordName = undefined;
            continue;
        }

        // 닉네임#태그 패턴이 있는 줄 처리
        if (hasBattleTag) {
            const playerDiscordName = pendingDiscordName;
            pendingDiscordName = undefined;

            // 닉네임만 있는 줄인지 확인
            const nameOnly = extractNameOnly(line);

            if (nameOnly) {
                // 다음 1~3줄의 티어 정보를 모아 합쳐서 파싱
                const tierLines: string[] = [];
                let j = i + 1;
                while (j < lines.length && tierLines.length < 3) {
                    const candidate = lines[j];
                    if (!hasTierInfoOnly(candidate)) break;
                    tierLines.push(candidate.trim());
                    j++;
                }

                if (tierLines.length > 0) {
                    // 줄바꿈 입력은 역할 순서 보존을 위해 슬래시로 합친다.
                    const combinedLine = `${nameOnly} ${tierLines.join(' / ')}`;
                    const rawPlayer = parseRawLineToPlayer(combinedLine, playerDiscordName);
                    const warning = rawPlayer ? createAvoidedRoleWarning(rawPlayer) : null;
                    const player = rawPlayer ? normalizePlayerRolePreferences(rawPlayer) : null;
                    const normalizedName = player?.name.toLowerCase();
                    const parsedIdentity = normalizedName
                        ? `${playerDiscordName?.trim().toLowerCase() ?? ''}|${normalizedName}`
                        : '';
                    if (warning && parsedIdentity && !seenPlayerIdentities.has(parsedIdentity)) {
                        avoidedRoleWarnings.push(warning);
                        seenPlayerIdentities.add(parsedIdentity);
                    } else if (player && parsedIdentity && !seenPlayerIdentities.has(parsedIdentity)) {
                        players.push(player);
                        seenPlayerIdentities.add(parsedIdentity);
                    } else if (player || warning) {
                        // 같은 Discord 이름과 배틀태그로 반복 게시된 항목은 한 번만 사용한다.
                    } else if (!seenNames.has(nameOnly.toLowerCase())) {
                        // 파싱 실패 - 닉네임만 추출해서 실패 목록에 추가
                        addFailedLine(nameOnly, i, j - 1);
                        seenNames.add(nameOnly.toLowerCase());
                    }
                    i = j - 1; // 소비한 티어 줄만큼 스킵
                    continue;
                } else if (!seenNames.has(nameOnly.toLowerCase())) {
                    // 닉네임만 있고 다음 줄에 티어 정보 없음
                    addFailedLine(nameOnly, i, i, '역할 티어 정보가 없어 가져올 수 없습니다.');
                    seenNames.add(nameOnly.toLowerCase());
                    continue;
                }
            }

            // 일반적인 한 줄 파싱
            const rawPlayer = parseRawLineToPlayer(line, playerDiscordName);
            const warning = rawPlayer ? createAvoidedRoleWarning(rawPlayer) : null;
            const player = rawPlayer ? normalizePlayerRolePreferences(rawPlayer) : null;
            const normalizedName = player?.name.toLowerCase();
            const parsedIdentity = normalizedName
                ? `${playerDiscordName?.trim().toLowerCase() ?? ''}|${normalizedName}`
                : '';
            if (warning && parsedIdentity && !seenPlayerIdentities.has(parsedIdentity)) {
                avoidedRoleWarnings.push(warning);
                seenPlayerIdentities.add(parsedIdentity);
            } else if (player && parsedIdentity && !seenPlayerIdentities.has(parsedIdentity)) {
                players.push(player);
                seenPlayerIdentities.add(parsedIdentity);
            } else if (player || warning) {
                // 같은 Discord 이름과 배틀태그로 반복 게시된 항목은 한 번만 사용한다.
            } else {
                // 파싱 실패 - 닉네임 추출 시도
                const nameMatch = line.match(/([^\s#]+\s*#\s*\d{4,})/);
                const failedName = nameMatch?.[1]?.replace(/\s+/g, '');
                if (failedName && !seenNames.has(failedName.toLowerCase())) {
                    addFailedLine(failedName, i);
                    seenNames.add(failedName.toLowerCase());
                }
            }
        }
    }

    for (const warning of avoidedRoleWarnings) {
        const ranges = findAvoidedRoleHighlightRanges(text, [warning]);
        validationIssues.push({
            kind: 'multiple-avoided-roles',
            message: '비선호 역할은 한 개만 지정해 주세요.',
            playerName: warning.playerName,
            discordName: warning.discordName,
            ranges,
        });
    }

    validationIssues.sort((left, right) => (
        (left.ranges[0]?.start ?? Number.MAX_SAFE_INTEGER)
        - (right.ranges[0]?.start ?? Number.MAX_SAFE_INTEGER)
    ));

    return { players, failedLines, avoidedRoleWarnings, validationIssues };
};
