import { type AnyPgTable, getTableConfig, PgTable } from "drizzle-orm/pg-core";

/**
 * Ce que contient l'export RGPD : table (nom SQL) -> rubrique du fichier. La route doit produire chaque rubrique,
 * et un test échoue dès qu'une table liée à users.id n'apparaît ni ici ni dans EXCLUDED_TABLES.
 */
export const EXPORTED_TABLES = {
  users: "account",
  documents: "documents",
  doc_authors: "coauthored",
  doc_files: "documentFiles",
  uploads: "uploadsInProgress",
  revisions: "corrections",
  thanks: "thanksGiven",
  document_ratings: "ratingsGiven",
  revised: "revised",
  user_badges: "badges",
  season_trophies: "trophies",
  reports: "reports",
  page_views: "pageViews",
  attestations: "attestations",
  attestation_acceptances: "attestationAcceptances",
  audit_log: "activity",
  sessions: "sessions",
  passkeys: "passkeys",
  flashcards: "flashcards",
  favorites: "favorites",
  reading_progress: "readingProgress",
  revision_spaces: "revisionSpaces",
  revision_members: "revisionMembers",
  revision_files: "revisionPhotos",
  card_images: "cardImages",
  annotations: "annotations",
  friendships: "friendRequests",
  quiz_attempts: "quizAttempts",
  exams: "exams",
  qa_posts: "questions",
  blog_posts: "blogPosts",
  subject_teachers: "subjectsTaught",
  notifications: "notifications",
  outbox: "pendingMails",
  push_subscriptions: "pushSubscriptions",
  notification_state: "notificationSettings",
  study_days: "studyDays",
  user_habits: "habits",
  quiz_duels: "quizDuels",
  quiz_duel_scores: "quizDuelScores",
  share_links: "shareLinks",
  referrals: "referrals",
  study_groups: "studyGroups",
  study_group_members: "studyGroupMembers",
  study_group_sessions: "studyGroupSessions",
  study_group_meetings: "studyGroupMeetings",
  course_requests: "courseRequests",
  course_request_votes: "courseRequestVotes",
  collab_notes: "collabNotes",
  connected_folders: "connectedFolders",
  user_profiles: "profile",
  user_blocks: "blocks",
  document_reviews: "reviewThread",
  user_unlocks: "unlocks",
  profile_reports: "profileReports",
  mfa_reset_requests: "mfaResetRequests",
  credit_adjustments: "creditAdjustments",
  admin_notes: "adminNotes",
  impersonations: "viewedByAdmins",
  announcement_dismissals: "dismissedAnnouncements",
  card_reviews: "cardReviews",
  daily_quests: "dailyQuests",
  exam_series_mutes: "examSeriesMutes",
  memo_packs: "memoPacks",
  memo_pack_copies: "memoPackCopies",
  memo_pack_reports: "memoPackReports",
  friend_invites: "friendInvites",
  friend_reactions: "friendReactions",
  profile_follows: "profileFollows",
  subject_follows: "subjectFollows",
  document_authors: "documentAuthors",
  document_shares: "documentShares",
  withdrawal_requests: "withdrawalRequests",
  product_events: "productEvents",
} as const;

export type ExportSection = (typeof EXPORTED_TABLES)[keyof typeof EXPORTED_TABLES] | "friends";

export const EXCLUDED_TABLES: Record<string, string> = {
  tokens: "Empreintes de liens à usage unique, secrètes et effacées à expiration ; rien à restituer à la personne.",
  recovery_codes: "Empreintes de codes de secours : un secret d'authentification, jamais exporté.",
  webauthn_challenges: "Défi technique de quelques minutes pendant une connexion, sans contenu personnel.",
  connected_tokens: "Jetons OAuth chiffrés vers Google ou Notion : un secret d'accès, jamais exporté. Les métadonnées du dossier relié figurent dans « connectedFolders ».",
  site_settings: "Réglages du site modifiés par un administrateur : la colonne updated_by ne sert qu'au journal, le réglage n'est pas une donnée de la personne.",
  invitations: "Invitations créées par un administrateur : created_by désigne l'auteur de l'invitation, pas une donnée de la personne invitée (son compte figure dans « account »).",
  banned_identities: "Empreintes HMAC d'adresses bannies : created_by désigne l'administrateur ; l'empreinte ne se rattache à aucun compte existant.",
  announcements: "Annonces publiées par un administrateur : created_by ne sert qu'au journal, l'annonce n'est pas une donnée de la personne.",
  known_devices: "Empreinte technique servant à repérer un nouvel appareil : les appareils eux-mêmes figurent dans « sessions ».",
};

/** Colonnes du compte qui ne quittent jamais le serveur. */
export const SECRET_ACCOUNT_FIELDS = ["passwordHash", "totpSecret", "totpLastCounter"] as const;

export function accountForExport(user: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(user).filter(([field]) => !(SECRET_ACCOUNT_FIELDS as readonly string[]).includes(field)));
}

/** Les tables du schéma dont une colonne référence la colonne `id` de `target`. */
export function tablesReferencing(tables: Record<string, unknown>, target: AnyPgTable) {
  const targetName = getTableConfig(target).name;
  const found = Object.values(tables).filter((table): table is AnyPgTable => table instanceof PgTable).filter((table) =>
    getTableConfig(table).foreignKeys.some((fk) => {
      const reference = fk.reference();
      return getTableConfig(reference.foreignTable).name === targetName && reference.foreignColumns.some((column) => column.name === "id");
    }));
  return found.map((table) => getTableConfig(table).name).sort();
}
