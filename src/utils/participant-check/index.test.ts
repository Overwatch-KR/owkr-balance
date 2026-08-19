import { describe, expect, it } from 'vitest';
import type { Player } from '../../types';
import {
    compareMentionedParticipants,
    extractMentionedParticipantNames,
} from './index';

const rank: Player['tank'] = {
    tier: 'DIAMOND',
    div: 3,
    score: 2800,
    isPreferred: false,
    isAvoided: false,
};

const createPlayer = (id: number, name: string, discordName?: string): Player => ({
    id,
    name,
    discordName,
    tank: rank,
    dps: rank,
    sup: rank,
});

describe('extractMentionedParticipantNames', () => {
    it('마크다운과 일반 텍스트 멘션을 순서대로 추출하고 중복을 제거한다', () => {
        const names = extractMentionedParticipantNames(
            '**@상만** **@에어맨이 쓰러지지 않아** @롤랑, **@상만** **@yog\\_1952**',
        );

        expect(names).toEqual(['상만', '에어맨이 쓰러지지 않아', '롤랑', 'yog_1952']);
    });
});

describe('compareMentionedParticipants', () => {
    it('디스코드 이름과 배틀태그 닉네임을 기준으로 미입력자를 찾는다', () => {
        const players = [
            createPlayer(1, 'PlayerOne#1234', '상만'),
            createPlayer(2, '롤랑#5678'),
            createPlayer(3, 'K200#31384', '미누'),
        ];

        const result = compareMentionedParticipants(
            '**@상만** **@롤랑** **@민성** **@미누** **@강아지**',
            players,
        );

        expect(result.mentionedNames).toEqual(['상만', '롤랑', '민성', '미누', '강아지']);
        expect(result.completedNames).toEqual(['상만', '롤랑', '미누']);
        expect(result.missingNames).toEqual(['민성', '강아지']);
        expect(result.unmatchedPlayers).toEqual([]);
    });

    it('대소문자, 유니코드 폭과 이름 내부 공백 차이를 정규화한다', () => {
        const players = [
            createPlayer(1, 'QUASAR#31909', 'Minha'),
            createPlayer(2, 'Player#1234', '에어맨이   쓰러지지 않아'),
        ];

        const result = compareMentionedParticipants(
            '**@ｍｉｎｈａ** **@에어맨이 쓰러지지 않아**',
            players,
        );

        expect(result.missingNames).toEqual([]);
    });

    it('보이지 않는 문자와 예전 디스코드 숫자 태그 차이를 정규화한다', () => {
        const players = [
            createPlayer(1, 'Player#1234', '상\u200B만#5678'),
        ];

        const result = compareMentionedParticipants('**@상만**', players);

        expect(result.completedNames).toEqual(['상만']);
        expect(result.missingNames).toEqual([]);
    });

    it('한 참가자의 여러 별칭을 서로 다른 두 사람으로 중복 완료 처리하지 않는다', () => {
        const players = [
            createPlayer(1, 'PlayerOne#1234', '상만'),
        ];

        const result = compareMentionedParticipants('**@상만** **@PlayerOne**', players);

        expect(result.completedNames).toEqual(['상만']);
        expect(result.missingNames).toEqual(['PlayerOne']);
        expect(result.unmatchedPlayers).toEqual([]);
    });

    it('여러 참가자가 같은 디스코드 이름을 쓰면 임의의 한 사람으로 처리하지 않는다', () => {
        const players = [
            createPlayer(1, 'PlayerOne#1234', '상만'),
            createPlayer(2, 'PlayerTwo#5678', '상만'),
        ];

        const result = compareMentionedParticipants('**@상만**', players);

        expect(result.completedNames).toEqual([]);
        expect(result.missingNames).toEqual(['상만']);
        expect(result.unmatchedPlayers).toEqual(players);
    });

    it('공지에 없는 현재 명단 참가자를 오입력 후보로 반환한다', () => {
        const players = [
            createPlayer(1, 'PlayerOne#1234', '상만'),
            createPlayer(2, 'WrongPlayer#5678', '잘못 추가한 사람'),
        ];

        const result = compareMentionedParticipants('**@상만**', players);

        expect(result.completedNames).toEqual(['상만']);
        expect(result.missingNames).toEqual([]);
        expect(result.unmatchedPlayers).toEqual([players[1]]);
    });

    it('관리자 본인 참여를 선택하면 공지의 추가 참가자로 함께 대조한다', () => {
        const players = [
            createPlayer(1, 'PlayerOne#1234', '상만'),
            createPlayer(2, 'Admin#5678', '관리자'),
        ];

        const result = compareMentionedParticipants(
            '**@상만**',
            players,
            ['관리자'],
        );

        expect(result.mentionedNames).toEqual(['상만', '관리자']);
        expect(result.completedNames).toEqual(['상만', '관리자']);
        expect(result.missingNames).toEqual([]);
        expect(result.unmatchedPlayers).toEqual([]);
    });

    it('관리자 이름이 이미 공지에 있으면 본인 참여 이름을 중복 추가하지 않는다', () => {
        const players = [createPlayer(1, 'Admin#5678', '관리자')];

        const result = compareMentionedParticipants(
            '**@관리자**',
            players,
            ['관리자'],
        );

        expect(result.mentionedNames).toEqual(['관리자']);
        expect(result.completedNames).toEqual(['관리자']);
    });
});
