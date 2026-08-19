import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { UserSheetEntry } from '../../utils/user-sheet';
import { UserSheetEntryView } from './user-sheet-entry-view';

const entry: UserSheetEntry = {
    id: 'sheet-row-1',
    discordName: '상민',
    battleTag: 'Player#1234',
    tank: '다3',
    dps: '플2',
    support: '마5',
    note: '공유 특이사항',
    createdAt: 1,
    updatedAt: 2,
    updatedByName: '관리자',
};

describe('UserSheetEntryView', () => {
    it('공용 정보 수정과 개인 운영 메모를 별도 영역으로 표시한다', () => {
        const markup = renderToStaticMarkup(
            <UserSheetEntryView
                csrfToken="csrf-token"
                entries={[entry]}
                entry={entry}
                isCurrentParticipant={false}
                noteCacheScope="user-1"
                onSaveError={vi.fn()}
                onSaved={vi.fn()}
                onSnapshotChange={vi.fn()}
            />,
        );

        expect(markup).toContain('공용 정보 수정');
        expect(markup).toContain('최종 수정 · 관리자');
        expect(markup).toContain('관리자 공유');
        expect(markup).toContain('개인 운영 메모');
        expect(markup).toContain('현재 로그인한 관리자 본인에게만');
        expect(markup).not.toContain('바로 수정');
    });
});
