import type { ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { EventParticipantActions } from './event-participant-actions';

const renderActions = (values: Partial<ComponentProps<typeof EventParticipantActions>> = {}) => (
    renderToStaticMarkup(
        <EventParticipantActions
            hasSaved={false}
            isDirty={false}
            isEditing
            isSaving={false}
            onCancel={vi.fn()}
            onClear={vi.fn()}
            onEdit={vi.fn()}
            onSave={vi.fn()}
            onSelectAll={vi.fn()}
            participantCount={0}
            {...values}
        />,
    )
);

describe('EventParticipantActions', () => {
    it('최초 상태에는 선택 후 저장 안내를 표시한다', () => {
        const markup = renderActions();

        expect(markup).toContain('참여자를 선택하면 저장할 수 있습니다.');
        expect(markup).toContain('sticky top-3');
        expect(markup).toContain('이벤트 참여 명단 제어');
    });

    it('변경한 상태에만 저장 버튼을 표시한다', () => {
        const markup = renderActions({ isDirty: true, participantCount: 3 });

        expect(markup).toContain('변경사항 저장');
        expect(markup).not.toContain('저장 완료');
    });

    it('저장한 뒤에는 버튼 대신 완료 상태와 참여 인원을 표시한다', () => {
        const markup = renderActions({ hasSaved: true, isEditing: false, participantCount: 3 });

        expect(markup).toContain('저장 완료');
        expect(markup).toContain('참여 3명');
        expect(markup).toContain('명단 수정');
        expect(markup).not.toContain('전원 선택');
        expect(markup).not.toContain('변경사항 저장');
    });

    it('저장된 명단을 수정할 때 취소 기능과 변경 상태를 표시한다', () => {
        const markup = renderActions({ hasSaved: true, isEditing: true, participantCount: 3 });

        expect(markup).toContain('수정 취소');
        expect(markup).toContain('변경사항이 없습니다.');
        expect(markup).not.toContain('저장 완료');
    });
});
