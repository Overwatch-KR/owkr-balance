import type { ClipboardEvent } from 'react';
import { AlertCircle, CheckCircle2, Trash2 } from 'lucide-react';
import {
    isActiveUserSheetEntry,
    type UserSheetDraftEntry,
    type UserSheetValidationError,
} from '../../utils/user-sheet';

export type UserSheetEditorField =
    | 'discordName'
    | 'discordUserId'
    | 'battleTag'
    | 'tank'
    | 'dps'
    | 'support'
    | 'note';

interface UserSheetEditorTableProps {
    disableAutoFocus: boolean;
    errors: ReadonlyMap<string, UserSheetValidationError>;
    focusRowId?: string;
    onCellChange: (rowId: string, field: UserSheetEditorField, value: string) => void;
    onPaste: (
        event: ClipboardEvent<HTMLInputElement>,
        startRowIndex: number,
        startColumnIndex: number,
    ) => void;
    onRemoveRow: (rowId: string) => void;
    rows: UserSheetDraftEntry[];
}

const COLUMNS: ReadonlyArray<{
    field: UserSheetEditorField;
    label: string;
    placeholder: string;
    width: string;
}> = [
    { field: 'discordName', label: '디스코드 이름', placeholder: '상민', width: 'min-w-40' },
    { field: 'discordUserId', label: 'Discord ID *', placeholder: '필수 · 123456789012345678', width: 'min-w-52' },
    { field: 'battleTag', label: '배틀태그', placeholder: 'Player#1234', width: 'min-w-56' },
    { field: 'tank', label: '탱커', placeholder: '다3', width: 'min-w-28' },
    { field: 'dps', label: '딜러', placeholder: '플1', width: 'min-w-28' },
    { field: 'support', label: '힐러', placeholder: '마5', width: 'min-w-28' },
    { field: 'note', label: '특이사항', placeholder: '운영 메모', width: 'min-w-72' },
];

const ERROR_LABELS: Record<UserSheetValidationError, string> = {
    REQUIRED_DISCORD_USER_ID: 'Discord ID를 입력해 주세요',
    INVALID_BATTLE_TAG: '배틀태그 형식을 확인해 주세요',
    DUPLICATE_BATTLE_TAG: '같은 배틀태그가 있어요',
    INVALID_DISCORD_USER_ID: 'Discord ID 자릿수를 확인해 주세요',
    DUPLICATE_DISCORD_USER_ID: '같은 Discord ID가 있어요',
};

const ERROR_DETAILS: Record<UserSheetValidationError, string> = {
    REQUIRED_DISCORD_USER_ID: '이 유저의 Discord ID를 입력하면 저장할 수 있습니다.',
    INVALID_BATTLE_TAG: '배틀태그에 #과 숫자 태그를 포함해 주세요. 예: Player#1234',
    DUPLICATE_BATTLE_TAG: '동일인이면 한 행만 남기고, 다른 사람이면 Discord ID로 구분해 주세요.',
    INVALID_DISCORD_USER_ID: 'Discord ID는 17~20자리 숫자로 입력해 주세요.',
    DUPLICATE_DISCORD_USER_ID: '동일인이면 한 행만 남기고, 다른 유저라면 올바른 Discord ID를 확인해 주세요.',
};

/**
 * @description 전체 시트 편집기의 스프레드시트 표와 행별 검증 상태를 렌더링한다.
 */
export function UserSheetEditorTable({
    disableAutoFocus,
    errors,
    focusRowId,
    onCellChange,
    onPaste,
    onRemoveRow,
    rows,
}: UserSheetEditorTableProps) {
    return (
        <div className="custom-scrollbar min-h-0 flex-1 overflow-auto">
            <table className="w-full min-w-[1490px] border-separate border-spacing-0 text-left text-xs">
                <caption className="sr-only">
                    디스코드 이름과 고유 ID, 배틀태그, 역할별 티어와 특이사항을 편집하는 유저 시트
                </caption>
                <thead className="sticky top-0 z-20 bg-slate-900">
                    <tr>
                        <th className="sticky left-0 z-30 w-12 border-b border-r border-slate-700 bg-slate-900 px-2 py-2.5 text-center font-medium text-slate-600">#</th>
                        {COLUMNS.map(column => (
                            <th key={column.field} className={`${column.width} border-b border-r border-slate-700 px-2.5 py-2.5 font-medium text-slate-400`}>
                                {column.label}
                            </th>
                        ))}
                        <th className="sticky right-0 z-30 w-64 min-w-64 whitespace-nowrap border-b border-slate-700 bg-slate-900 px-3 py-2.5 font-medium text-slate-500">
                            저장 상태
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row, rowIndex) => {
                        const error = errors.get(row.id);
                        const errorField = error === 'REQUIRED_DISCORD_USER_ID'
                            || error === 'INVALID_DISCORD_USER_ID'
                            || error === 'DUPLICATE_DISCORD_USER_ID'
                            ? 'discordUserId'
                            : 'battleTag';
                        return (
                            <tr
                                key={row.id}
                                className={`group transition-colors hover:bg-white/[0.025] ${
                                    error ? 'bg-rose-500/[0.045]' : ''
                                }`}
                            >
                                <td className="sticky left-0 z-10 border-b border-r border-slate-800 bg-slate-900/95 px-2 py-1 text-center tabular-nums text-slate-600 group-hover:text-slate-400">
                                    {rowIndex + 1}
                                </td>
                                {COLUMNS.map((column, columnIndex) => (
                                    <td
                                        key={column.field}
                                        className={`border-b border-r p-0 ${
                                            error && column.field === errorField
                                                ? 'border-rose-500/60 bg-rose-500/[0.08]'
                                                : 'border-slate-800'
                                        }`}
                                    >
                                        <input
                                            value={row[column.field] ?? ''}
                                            onChange={event => onCellChange(
                                                row.id,
                                                column.field,
                                                event.target.value,
                                            )}
                                            onPaste={event => onPaste(event, rowIndex, columnIndex)}
                                            autoFocus={!disableAutoFocus && columnIndex === 0 && (
                                                focusRowId
                                                    ? row.id === focusRowId
                                                    : rowIndex === 0
                                            )}
                                            autoComplete="off"
                                            required={column.field === 'discordUserId'}
                                            spellCheck={false}
                                            placeholder={rowIndex === 0 ? column.placeholder : ''}
                                            aria-label={`${rowIndex + 1}행 ${column.label}`}
                                            aria-invalid={column.field === errorField && Boolean(error)}
                                            aria-describedby={column.field === errorField && error
                                                ? `user-sheet-row-error-${row.id}`
                                                : undefined}
                                            className={`h-11 w-full bg-transparent px-2.5 text-slate-200 outline-none placeholder:text-slate-700 focus:bg-cyan-500/[0.06] focus:ring-2 focus:ring-inset ${
                                                error && column.field === errorField
                                                    ? 'text-rose-100 focus:ring-rose-400/80'
                                                    : 'focus:ring-cyan-400/70'
                                            } ${
                                                column.field === 'battleTag' || column.field === 'discordUserId'
                                                    ? 'font-mono'
                                                    : ''
                                            }`}
                                        />
                                    </td>
                                ))}
                                <td className="sticky right-0 z-10 w-64 min-w-64 border-b border-slate-800 bg-slate-900/95 px-2 py-1">
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                            <span
                                                id={error ? `user-sheet-row-error-${row.id}` : undefined}
                                                className={`inline-flex min-w-0 whitespace-nowrap rounded-full px-2 py-1 text-[11px] font-medium ${
                                                    error
                                                        ? 'bg-rose-500/15 text-rose-200'
                                                        : isActiveUserSheetEntry(row)
                                                            ? 'bg-emerald-500/10 text-emerald-300'
                                                            : 'text-slate-700'
                                                }`}
                                            >
                                                {error && <AlertCircle size={12} className="mr-1 shrink-0" aria-hidden="true" />}
                                                {!error && isActiveUserSheetEntry(row) && (
                                                    <CheckCircle2 size={12} className="mr-1 shrink-0" aria-hidden="true" />
                                                )}
                                                {error
                                                    ? ERROR_LABELS[error]
                                                    : isActiveUserSheetEntry(row)
                                                        ? '저장할 수 있어요'
                                                        : '입력을 시작해 주세요'}
                                            </span>
                                            {error && (
                                                <p className="mt-1 px-1 text-[10px] leading-relaxed text-rose-200/65">
                                                    {ERROR_DETAILS[error]}
                                                </p>
                                            )}
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => onRemoveRow(row.id)}
                                            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-600 transition-colors hover:bg-rose-500/10 hover:text-rose-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/70"
                                            aria-label={`${rowIndex + 1}행 삭제`}
                                            title={`${rowIndex + 1}행 삭제`}
                                        >
                                            <Trash2 size={13} aria-hidden="true" />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
