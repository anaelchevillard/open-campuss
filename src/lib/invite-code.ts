export const isInviteCode = (value: unknown): value is string => typeof value === "string" && /^[\w-]{8,32}$/.test(value);
