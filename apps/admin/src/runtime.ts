export const liveTarget = import.meta.env.DEV ? String(import.meta.env.ADMIN_LIVE_TARGET || '') : '';
export const liveNotice = liveTarget ? 'Local UI · Production data' : '';
