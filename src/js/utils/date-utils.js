export const DATE_PUNCH_OFFSETS = ['0', '1d', '2d', '4d', '10d', '1w', '2w', '3w', '1m', '2m'];
export const DASHBOARD_PUNCH_OFFSETS = ['0d', '1d', '2d', '4d', '1w', '2w', '3w', '1m'];

export function calculateOffsetDate(offsetStr) {
    const now = new Date();

    // Explicitly handle "0" or "0d" for Today
    if (offsetStr === '0' || offsetStr === '0d') {
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    }

    const match = offsetStr.match(/^(\d+)([dwm])$/);
    if (!match) return; // Fallback handles invalid properly

    const val = parseInt(match[1], 10);
    const unit = match[2];

    if (unit === 'd') {
        now.setDate(now.getDate() + val);
    } else if (unit === 'w') {
        now.setDate(now.getDate() + (val * 7));
    } else if (unit === 'm') {
        const expectedMonth = (now.getMonth() + val) % 12;
        now.setMonth(now.getMonth() + val);
        if (now.getMonth() !== expectedMonth) {
            // we rolled over because the day of month didn't exist in the target month (e.g. Jan 31 + 1m -> Mar 3 or 2)
            now.setDate(0); // go to last day of the actual target month
        }
    }

    // Format to YYYY-MM-DD
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}
