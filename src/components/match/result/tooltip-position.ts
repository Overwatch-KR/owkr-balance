interface AnchorRect {
    left: number;
    right: number;
    top: number;
    bottom: number;
}

interface PanelSize {
    width: number;
    height: number;
}

export function getTooltipPosition(
    anchor: AnchorRect,
    panel: PanelSize,
    viewport: PanelSize,
    alignRight = false,
): { left: number; top: number } {
    const margin = 12;
    const gap = 8;
    const below = viewport.height - margin - anchor.bottom - gap;
    const above = anchor.top - gap - margin;
    const top = panel.height <= below || below >= above
        ? anchor.bottom + gap
        : anchor.top - gap - panel.height;
    return {
        left: Math.max(margin, Math.min(
            alignRight ? anchor.right - panel.width : anchor.left,
            viewport.width - panel.width - margin,
        )),
        top: Math.max(margin, Math.min(top, viewport.height - panel.height - margin)),
    };
}
