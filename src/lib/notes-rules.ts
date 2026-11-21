export type Turn = { part: string; userId: string | null };
export const MAX_TURNS = 30;
export const MAX_NOTES_MEMBERS = 30;
export const NOTES_IDLE_DAYS = 30;

/** Le tour de rôle vient du navigateur : texte borné, et seuls les membres du groupe peuvent y figurer. */
export function cleanTurns(raw: unknown, members: Set<string>): Turn[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, MAX_TURNS).flatMap((value): Turn[] => {
    const turn = value as { part?: unknown; userId?: unknown } | null;
    const part = String(turn?.part ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
    if (!part) return [];
    return [{ part, userId: typeof turn?.userId === "string" && members.has(turn.userId) ? turn.userId : null }];
  });
}

export const notesTitle = (date: Date) => `Notes du CM du ${date.toLocaleDateString("fr-FR", { day: "numeric", month: "long", timeZone: "Europe/Paris" })}`;
