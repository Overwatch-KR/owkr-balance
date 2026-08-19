import { useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
].join(',');

interface UseDialogFocusOptions {
    closeOnEscape?: boolean;
    onClose: () => void;
}

/**
 * @description 모달 내부에 키보드 포커스를 유지하고 닫힌 뒤 기존 위치로 복원한다.
 */
export function useDialogFocus({
    closeOnEscape = true,
    onClose,
}: UseDialogFocusOptions) {
    const dialogRef = useRef<HTMLElement>(null);
    const onCloseRef = useRef(onClose);
    const closeOnEscapeRef = useRef(closeOnEscape);

    useEffect(() => {
        onCloseRef.current = onClose;
    }, [onClose]);
    useEffect(() => {
        closeOnEscapeRef.current = closeOnEscape;
    }, [closeOnEscape]);

    useEffect(() => {
        const dialog = dialogRef.current;
        const previousFocus = document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;
        if (!dialog) return undefined;

        const focusableElements = () => Array.from(
            dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
        ).filter(element => !element.hidden && element.getAttribute('aria-hidden') !== 'true');

        const frame = window.requestAnimationFrame(() => {
            (focusableElements()[0] ?? dialog).focus();
        });
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape' && closeOnEscapeRef.current) {
                event.preventDefault();
                onCloseRef.current();
                return;
            }
            if (event.key !== 'Tab') return;

            const focusable = focusableElements();
            if (focusable.length === 0) {
                event.preventDefault();
                dialog.focus();
                return;
            }
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => {
            window.cancelAnimationFrame(frame);
            document.removeEventListener('keydown', handleKeyDown);
            previousFocus?.focus();
        };
    }, []);

    return dialogRef;
}
