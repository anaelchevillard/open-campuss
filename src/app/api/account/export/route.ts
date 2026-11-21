import { eq, or } from "drizzle-orm";
import { currentUser } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { accountForExport, type ExportSection } from "@/lib/export-coverage";
import { friendsOf } from "@/lib/friends";
import { demoApiRefusal } from "@/lib/demo";
import { json } from "@/lib/http";

const photoUrl = (id: string | null) => (id ? `/revision-files/${id}?inline=1` : null);

/**
 * Droit d'accès et à la portabilité (RGPD, art. 15 et 20) : tout ce qui concerne le compte, sauf les secrets.
 * La liste des tables couvertes vit dans export-coverage.ts, et chaque colonne est nommée ici : une colonne ajoutée n'y entre pas d'elle-même.
 */
export async function GET() {
  const demo = demoApiRefusal();
  if (demo) return demo;
  const user = await currentUser();
  if (!user) return json({ error: "Accès refusé" }, 403);
  const me = user.id;
  const own = await db.select({ id: schema.documents.id, title: schema.documents.title, description: schema.documents.description, category: schema.documents.category, published: schema.documents.published, createdAt: schema.documents.createdAt, updatedAt: schema.documents.updatedAt, rightsBasis: schema.documents.rightsBasis, content: schema.documents.bodyMarkdown }).from(schema.documents).where(eq(schema.documents.createdBy, me));
  const sections: Record<ExportSection, unknown> = {
    account: accountForExport(user),
    documents: own,
    coauthored: await db.select({ document: schema.docAuthors.documentId, title: schema.documents.title }).from(schema.docAuthors).innerJoin(schema.documents, eq(schema.docAuthors.documentId, schema.documents.id)).where(eq(schema.docAuthors.userId, me)),
    documentFiles: await db.select({ document: schema.docFiles.documentId, filename: schema.docFiles.filename, size: schema.docFiles.size, url: schema.docFiles.id, createdAt: schema.docFiles.createdAt }).from(schema.docFiles).innerJoin(schema.documents, eq(schema.docFiles.documentId, schema.documents.id)).where(eq(schema.documents.createdBy, me)).then((files) => files.map((file) => ({ ...file, url: `/files/${file.url}` }))),
    uploadsInProgress: await db.select({ document: schema.uploads.documentId, filename: schema.uploads.filename, purpose: schema.uploads.purpose, createdAt: schema.uploads.createdAt }).from(schema.uploads).where(eq(schema.uploads.createdBy, me)),
    corrections: await db.select({ document: schema.revisions.documentId, summary: schema.revisions.summary, status: schema.revisions.status, note: schema.revisions.note, content: schema.revisions.bodyMarkdown, createdAt: schema.revisions.createdAt }).from(schema.revisions).where(eq(schema.revisions.authorId, me)),
    thanksGiven: await db.select({ document: schema.thanks.documentId, at: schema.thanks.at }).from(schema.thanks).where(eq(schema.thanks.userId, me)),
    ratingsGiven: await db.select({ document: schema.documentRatings.documentId, stars: schema.documentRatings.stars, updatedAt: schema.documentRatings.updatedAt }).from(schema.documentRatings).where(eq(schema.documentRatings.userId, me)),
    revised: await db.select({ document: schema.revised.documentId, at: schema.revised.at }).from(schema.revised).where(eq(schema.revised.userId, me)),
    badges: await db.select({ badge: schema.userBadges.badge, earnedAt: schema.userBadges.earnedAt }).from(schema.userBadges).where(eq(schema.userBadges.userId, me)),
    trophies: await db.select({ season: schema.seasonTrophies.season, label: schema.seasonTrophies.label }).from(schema.seasonTrophies).where(eq(schema.seasonTrophies.userId, me)),
    // Le jeton de suivi donne accès au signalement : il reste en dehors
    reports: await db.select({ kind: schema.reports.kind, document: schema.reports.documentId, name: schema.reports.name, email: schema.reports.email, message: schema.reports.message, status: schema.reports.status, response: schema.reports.response, createdAt: schema.reports.createdAt, closedAt: schema.reports.closedAt }).from(schema.reports).where(or(eq(schema.reports.reporterId, me), eq(schema.reports.email, user.email))),
    // Événements produits liés au compte (seulement avec l'accord à la mesure d'audience, 13 mois)
    productEvents: await db.select({ at: schema.productEvents.at, name: schema.productEvents.name }).from(schema.productEvents).where(eq(schema.productEvents.userId, me)),
    pageViews: await db.select({ at: schema.pageViews.at, path: schema.pageViews.path, device: schema.pageViews.device, browser: schema.pageViews.browser, referrer: schema.pageViews.referrer }).from(schema.pageViews).where(eq(schema.pageViews.userId, me)),
    attestations: await db.select({ at: schema.attestations.at, kind: schema.attestations.kind, text: schema.attestations.text, document: schema.attestations.documentId, documentTitle: schema.attestations.documentTitle, termsVersion: schema.attestations.termsVersion, ip: schema.attestations.ip }).from(schema.attestations).where(eq(schema.attestations.userId, me)),
    attestationAcceptances: await db.select({ kind: schema.attestationAcceptances.kind, category: schema.attestationAcceptances.category, version: schema.attestationAcceptances.version, at: schema.attestationAcceptances.at }).from(schema.attestationAcceptances).where(eq(schema.attestationAcceptances.userId, me)),
    activity: await db.select({ at: schema.auditLog.at, action: schema.auditLog.action, ip: schema.auditLog.ip }).from(schema.auditLog).where(eq(schema.auditLog.actor, user.email)),
    // Jamais l'empreinte de session, ni l'identifiant ou la clé d'une clé d'accès
    sessions: await db.select({ userAgent: schema.sessions.userAgent, ip: schema.sessions.ip, lastSeenAt: schema.sessions.lastSeenAt, createdAt: schema.sessions.createdAt, expiresAt: schema.sessions.expiresAt }).from(schema.sessions).where(eq(schema.sessions.userId, me)),
    passkeys: await db.select({ name: schema.passkeys.name, transports: schema.passkeys.transports, createdAt: schema.passkeys.createdAt, lastUsedAt: schema.passkeys.lastUsedAt }).from(schema.passkeys).where(eq(schema.passkeys.userId, me)),
    flashcards: await db.select({ document: schema.flashcards.documentId, front: schema.flashcards.front, back: schema.flashcards.back, dueAt: schema.flashcards.dueAt, intervalDays: schema.flashcards.intervalDays, ease: schema.flashcards.ease, reps: schema.flashcards.reps, stability: schema.flashcards.stability, difficulty: schema.flashcards.difficulty, state: schema.flashcards.state, lapses: schema.flashcards.lapses, suspendedAt: schema.flashcards.suspendedAt, createdAt: schema.flashcards.createdAt }).from(schema.flashcards).where(eq(schema.flashcards.userId, me)),
    favorites: await db.select({ document: schema.favorites.documentId, at: schema.favorites.at }).from(schema.favorites).where(eq(schema.favorites.userId, me)),
    readingProgress: await db.select({ document: schema.readingProgress.documentId, percent: schema.readingProgress.percent, updatedAt: schema.readingProgress.updatedAt }).from(schema.readingProgress).where(eq(schema.readingProgress.userId, me)),
    revisionSpaces: await db.select({ id: schema.revisionSpaces.id, document: schema.revisionSpaces.documentId, createdAt: schema.revisionSpaces.createdAt, updatedAt: schema.revisionSpaces.updatedAt }).from(schema.revisionSpaces).where(eq(schema.revisionSpaces.ownerId, me)),
    revisionMembers: {
      invitationsReceived: await db.select({ space: schema.revisionMembers.spaceId, document: schema.revisionSpaces.documentId, status: schema.revisionMembers.status, createdAt: schema.revisionMembers.createdAt }).from(schema.revisionMembers).innerJoin(schema.revisionSpaces, eq(schema.revisionMembers.spaceId, schema.revisionSpaces.id)).where(eq(schema.revisionMembers.userId, me)),
      invitedToMySpaces: await db.select({ space: schema.revisionMembers.spaceId, name: schema.users.name, status: schema.revisionMembers.status, createdAt: schema.revisionMembers.createdAt }).from(schema.revisionMembers).innerJoin(schema.revisionSpaces, eq(schema.revisionMembers.spaceId, schema.revisionSpaces.id)).innerJoin(schema.users, eq(schema.revisionMembers.userId, schema.users.id)).where(eq(schema.revisionSpaces.ownerId, me)),
    },
    cardImages: await db.select({ size: schema.cardImages.size, createdAt: schema.cardImages.createdAt, id: schema.cardImages.id }).from(schema.cardImages).where(eq(schema.cardImages.ownerId, me)).then((images) => images.map(({ id, ...image }) => ({ ...image, url: `/card-images/${id}?inline=1` }))),
    revisionPhotos: await db.select({ id: schema.revisionFiles.id, space: schema.revisionFiles.spaceId, size: schema.revisionFiles.size, createdAt: schema.revisionFiles.createdAt }).from(schema.revisionFiles).innerJoin(schema.revisionSpaces, eq(schema.revisionFiles.spaceId, schema.revisionSpaces.id)).where(eq(schema.revisionSpaces.ownerId, me)).then((files) => files.map(({ id, ...file }) => ({ ...file, url: photoUrl(id) }))),
    annotations: await db.select({ document: schema.revisionSpaces.documentId, space: schema.annotations.spaceId, kind: schema.annotations.kind, color: schema.annotations.color, quote: schema.annotations.quote, note: schema.annotations.note, photo: schema.annotations.photoId, createdAt: schema.annotations.createdAt, updatedAt: schema.annotations.updatedAt }).from(schema.annotations).innerJoin(schema.revisionSpaces, eq(schema.annotations.spaceId, schema.revisionSpaces.id)).where(eq(schema.annotations.authorId, me)).then((rows) => rows.map((row) => ({ ...row, photo: photoUrl(row.photo) }))),
    friends: await friendsOf(me).then((list) => list.map((friend) => friend.name)),
    // Sans le nom de l'autre : une demande restée sans suite ne doit rien révéler de lui
    friendRequests: await db.select({ requester: schema.friendships.requesterId, status: schema.friendships.status, createdAt: schema.friendships.createdAt }).from(schema.friendships).where(or(eq(schema.friendships.requesterId, me), eq(schema.friendships.addresseeId, me))).then((rows) => rows.map(({ requester, ...row }) => ({ ...row, direction: requester === me ? "envoyée" : "reçue" }))),
    quizAttempts: await db.select({ document: schema.quizAttempts.documentId, score: schema.quizAttempts.score, total: schema.quizAttempts.total, at: schema.quizAttempts.at }).from(schema.quizAttempts).where(eq(schema.quizAttempts.userId, me)),
    exams: await db.select({ subject: schema.exams.subjectId, title: schema.exams.title, at: schema.exams.at, place: schema.exams.place, kind: schema.exams.kind }).from(schema.exams).where(eq(schema.exams.createdBy, me)),
    questions: await db.select({ document: schema.qaPosts.documentId, body: schema.qaPosts.body, hidden: schema.qaPosts.hidden, accepted: schema.qaPosts.accepted, at: schema.qaPosts.createdAt }).from(schema.qaPosts).where(eq(schema.qaPosts.authorId, me)),
    blogPosts: await db.select({ title: schema.blogPosts.title, content: schema.blogPosts.bodyMarkdown, published: schema.blogPosts.published, publishedAt: schema.blogPosts.publishedAt, createdAt: schema.blogPosts.createdAt }).from(schema.blogPosts).where(eq(schema.blogPosts.authorId, me)),
    subjectsTaught: await db.select({ subject: schema.subjects.name }).from(schema.subjectTeachers).innerJoin(schema.subjects, eq(schema.subjectTeachers.subjectId, schema.subjects.id)).where(eq(schema.subjectTeachers.userId, me)),
    notifications: await db.select({ kind: schema.notifications.kind, title: schema.notifications.title, body: schema.notifications.body, href: schema.notifications.href, readAt: schema.notifications.readAt, sentAt: schema.notifications.pushedAt, openedAt: schema.notifications.clickedAt, createdAt: schema.notifications.createdAt }).from(schema.notifications).where(eq(schema.notifications.userId, me)),
    // Sans les clés de chiffrement de l'appareil, qui ne servent qu'à lui écrire
    pushSubscriptions: await db.select({ endpoint: schema.pushSubscriptions.endpoint, createdAt: schema.pushSubscriptions.createdAt }).from(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.userId, me)),
    notificationSettings: await db.select({ weeklyMail: schema.notificationState.weeklyMail, notificationMail: schema.notificationState.notificationMail, weeklyMailAt: schema.notificationState.weeklyMailAt, lastReminderDay: schema.notificationState.lastReminderDay, lastVisitAt: schema.notificationState.lastVisitAt }).from(schema.notificationState).where(eq(schema.notificationState.userId, me)),
    // Le sujet seulement : le corps d'un mail en attente peut contenir un lien de connexion
    courseRequests: await db.select({ subject: schema.subjects.name, text: schema.courseRequests.text, createdAt: schema.courseRequests.createdAt }).from(schema.courseRequests).innerJoin(schema.subjects, eq(schema.courseRequests.subjectId, schema.subjects.id)).where(eq(schema.courseRequests.authorId, me)),
    courseRequestVotes: await db.select({ text: schema.courseRequests.text, at: schema.courseRequestVotes.at }).from(schema.courseRequestVotes).innerJoin(schema.courseRequests, eq(schema.courseRequestVotes.requestId, schema.courseRequests.id)).where(eq(schema.courseRequestVotes.userId, me)),
    // Sans l'état Yjs : le texte figure déjà dans « documents »
    collabNotes: await db.select({ document: schema.collabNotes.documentId, open: schema.collabNotes.open, turns: schema.collabNotes.turns, createdAt: schema.collabNotes.createdAt, closedAt: schema.collabNotes.closedAt }).from(schema.collabNotes).where(eq(schema.collabNotes.startedBy, me)),
    // Métadonnées seulement : les jetons restent dans leur table, jamais lue ici
    connectedFolders: {
      folders: await db.select({ provider: schema.connectedFolders.provider, name: schema.connectedFolders.folderName, lastCheckedAt: schema.connectedFolders.lastCheckedAt, createdAt: schema.connectedFolders.createdAt }).from(schema.connectedFolders).where(eq(schema.connectedFolders.userId, me)),
      items: await db.select({ provider: schema.connectedFolders.provider, title: schema.connectedItems.title, status: schema.connectedItems.status, document: schema.connectedItems.documentId, foundAt: schema.connectedItems.foundAt }).from(schema.connectedItems).innerJoin(schema.connectedFolders, eq(schema.connectedItems.folderId, schema.connectedFolders.id)).where(eq(schema.connectedFolders.userId, me)),
    },
    pendingMails: await db.select({ subject: schema.outbox.subject, createdAt: schema.outbox.createdAt }).from(schema.outbox).where(eq(schema.outbox.recipient, user.email)),
    studyDays: await db.select({ day: schema.studyDays.day, cards: schema.studyDays.cards, xp: schema.studyDays.xp, questions: schema.studyDays.questions, correct: schema.studyDays.correct, seconds: schema.studyDays.seconds }).from(schema.studyDays).where(eq(schema.studyDays.userId, me)),
    habits: await db.select({ dailyGoal: schema.userHabits.dailyGoal, seasonDismissed: schema.userHabits.seasonDismissed, inviteCode: schema.userHabits.inviteCode, bestStreak: schema.userHabits.bestStreak, vacationUntil: schema.userHabits.vacationUntil, reminderHour: schema.userHabits.reminderHour }).from(schema.userHabits).where(eq(schema.userHabits.userId, me)),
    profile: await db.select({ nameStyle: schema.userProfiles.nameStyle, badgeShown: schema.userProfiles.badgeShown, banner: schema.userProfiles.banner, profileColors: schema.userProfiles.profileColors, avatarFrame: schema.userProfiles.avatarFrame, avatarEffect: schema.userProfiles.avatarEffect, status: schema.userProfiles.status, showcase: schema.userProfiles.showcase, privacy: schema.userProfiles.privacy, socials: schema.userProfiles.socials, updatedAt: schema.userProfiles.updatedAt }).from(schema.userProfiles).where(eq(schema.userProfiles.userId, me)),
    // Seulement les comptes que la personne a bloqués : être bloqué par quelqu'un ne se révèle pas
    // Les abonnements de la personne ; qui la suit ne se révèle pas
    profileFollows: await db.select({ followed: schema.profileFollows.followedId, at: schema.profileFollows.at }).from(schema.profileFollows).where(eq(schema.profileFollows.followerId, me)),
    subjectFollows: await db.select({ subject: schema.subjectFollows.subjectId, at: schema.subjectFollows.at }).from(schema.subjectFollows).where(eq(schema.subjectFollows.userId, me)),
    // Documents dont la personne est auteur ou co-auteur, avec son rôle et la date d'ajout
    documentAuthors: await db.select({ document: schema.documentAuthors.documentId, title: schema.documents.title, role: schema.documentAuthors.role, addedAt: schema.documentAuthors.addedAt }).from(schema.documentAuthors).innerJoin(schema.documents, eq(schema.documentAuthors.documentId, schema.documents.id)).where(eq(schema.documentAuthors.userId, me)),
    // Lectures accordées à des amis ou reçues d'eux
    documentShares: await db.select({ document: schema.documentShares.documentId, sharedWith: schema.documentShares.userId, sharedBy: schema.documentShares.sharedBy, at: schema.documentShares.at }).from(schema.documentShares).where(or(eq(schema.documentShares.userId, me), eq(schema.documentShares.sharedBy, me))),
    blocks: await db.select({ blocked: schema.userBlocks.blockedId, at: schema.userBlocks.at }).from(schema.userBlocks).where(eq(schema.userBlocks.blockerId, me)),
    reviewThread: await db.select({ document: schema.documentReviews.documentId, kind: schema.documentReviews.kind, reasonCode: schema.documentReviews.reasonCode, body: schema.documentReviews.body, createdAt: schema.documentReviews.createdAt }).from(schema.documentReviews).where(eq(schema.documentReviews.authorId, me)),
    unlocks: await db.select({ item: schema.userUnlocks.item, source: schema.userUnlocks.source, at: schema.userUnlocks.at }).from(schema.userUnlocks).where(eq(schema.userUnlocks.userId, me)),
    // Demandes de retrait de ses cours publiés, avec la réponse de l'administration (sans le nom de qui a décidé)
    withdrawalRequests: await db.select({ document: schema.withdrawalRequests.documentId, reason: schema.withdrawalRequests.reason, status: schema.withdrawalRequests.status, response: schema.withdrawalRequests.response, createdAt: schema.withdrawalRequests.createdAt, decidedAt: schema.withdrawalRequests.decidedAt }).from(schema.withdrawalRequests).where(eq(schema.withdrawalRequests.requesterId, me)),
    mfaResetRequests: await db.select({ reason: schema.mfaResetRequests.reason, status: schema.mfaResetRequests.status, createdAt: schema.mfaResetRequests.createdAt, closedAt: schema.mfaResetRequests.closedAt }).from(schema.mfaResetRequests).where(eq(schema.mfaResetRequests.userId, me)),
    profileReports: await db.select({ target: schema.profileReports.targetId, field: schema.profileReports.field, reason: schema.profileReports.reason, status: schema.profileReports.status, createdAt: schema.profileReports.createdAt }).from(schema.profileReports).where(eq(schema.profileReports.reporterId, me)),
    // Notes internes de l'équipe sur la personne (sans le nom de leur auteur) et aperçus « voir comme » de son compte
    adminNotes: await db.select({ body: schema.adminNotes.body, pinned: schema.adminNotes.pinned, createdAt: schema.adminNotes.createdAt, updatedAt: schema.adminNotes.updatedAt }).from(schema.adminNotes).where(eq(schema.adminNotes.userId, me)),
    viewedByAdmins: await db.select({ reason: schema.impersonations.reason, startedAt: schema.impersonations.startedAt, endedAt: schema.impersonations.endedAt, paths: schema.impersonations.paths }).from(schema.impersonations).where(eq(schema.impersonations.targetId, me)),
    dismissedAnnouncements: await db.select({ announcement: schema.announcementDismissals.announcementId, at: schema.announcementDismissals.at }).from(schema.announcementDismissals).where(eq(schema.announcementDismissals.userId, me)),
    examSeriesMutes: await db.select({ exam: schema.examSeriesMutes.examId, at: schema.examSeriesMutes.at }).from(schema.examSeriesMutes).where(eq(schema.examSeriesMutes.userId, me)),
    memoPacks: await db.select({ id: schema.memoPacks.id, title: schema.memoPacks.title, document: schema.memoPacks.documentId, friends: schema.memoPacks.friends, public: schema.memoPacks.public, copies: schema.memoPacks.copies, removedAt: schema.memoPacks.removedAt, createdAt: schema.memoPacks.createdAt }).from(schema.memoPacks).where(eq(schema.memoPacks.ownerId, me)),
    memoPackCopies: await db.select({ pack: schema.memoPackCopies.packId, at: schema.memoPackCopies.at }).from(schema.memoPackCopies).where(eq(schema.memoPackCopies.userId, me)),
    memoPackReports: await db.select({ pack: schema.memoPackReports.packId, reason: schema.memoPackReports.reason, status: schema.memoPackReports.status, createdAt: schema.memoPackReports.createdAt }).from(schema.memoPackReports).where(eq(schema.memoPackReports.reporterId, me)),
    cardReviews: await db.select({ card: schema.cardReviews.cardId, grade: schema.cardReviews.grade, ms: schema.cardReviews.ms, at: schema.cardReviews.at }).from(schema.cardReviews).where(eq(schema.cardReviews.userId, me)),
    dailyQuests: await db.select({ day: schema.dailyQuests.day, quest: schema.dailyQuests.quest, progress: schema.dailyQuests.progress, target: schema.dailyQuests.target, doneAt: schema.dailyQuests.doneAt }).from(schema.dailyQuests).where(eq(schema.dailyQuests.userId, me)),
    // Sans le jeton : il permet encore de devenir ami tant qu'il n'a pas expiré
    friendInvites: await db.select({ usesLeft: schema.friendInvites.usesLeft, expiresAt: schema.friendInvites.expiresAt, createdAt: schema.friendInvites.createdAt }).from(schema.friendInvites).where(eq(schema.friendInvites.userId, me)),
    // Les réactions données seulement : celles reçues appartiennent à leurs auteurs
    friendReactions: await db.select({ event: schema.friendReactions.eventKey, kind: schema.friendReactions.kind, at: schema.friendReactions.at }).from(schema.friendReactions).where(eq(schema.friendReactions.actorId, me)),
    creditAdjustments: await db.select({ delta: schema.creditAdjustments.delta, reason: schema.creditAdjustments.reason, createdAt: schema.creditAdjustments.createdAt }).from(schema.creditAdjustments).where(eq(schema.creditAdjustments.userId, me)),
    // Sans l'identité de l'autre : un lien de défi peut avoir été joué par quelqu'un qui n'est pas un ami
    quizDuels: await db.select({ document: schema.quizDuels.documentId, challenger: schema.quizDuels.challengerId, score: schema.quizDuels.challengerScore, total: schema.quizDuels.challengerTotal, createdAt: schema.quizDuels.createdAt }).from(schema.quizDuels).where(or(eq(schema.quizDuels.challengerId, me), eq(schema.quizDuels.invitedId, me))).then((rows) => rows.map(({ challenger, ...row }) => ({ ...row, direction: challenger === me ? "lancé" : "reçu" }))),
    quizDuelScores: await db.select({ score: schema.quizDuelScores.score, total: schema.quizDuelScores.total, at: schema.quizDuelScores.at }).from(schema.quizDuelScores).where(eq(schema.quizDuelScores.userId, me)),
    shareLinks: await db.select({ document: schema.shareLinks.documentId, revokedAt: schema.shareLinks.revokedAt, createdAt: schema.shareLinks.createdAt }).from(schema.shareLinks).where(eq(schema.shareLinks.createdBy, me)),
    // Un nombre seulement côté parrain : aucun filleul n'est nommé. Côté filleul, le simple fait d'avoir été parrainé.
    referrals: {
      activated: await db.select({ creditedAt: schema.referrals.creditedAt }).from(schema.referrals).where(eq(schema.referrals.referrerId, me)).then((rows) => rows.filter((row) => row.creditedAt).length),
      invitedByALink: await db.select({ id: schema.referrals.id }).from(schema.referrals).where(eq(schema.referrals.refereeId, me)).then((rows) => rows.length > 0),
    },
    studyGroups: await db.select({ name: schema.studyGroups.name, createdAt: schema.studyGroups.createdAt }).from(schema.studyGroups).where(eq(schema.studyGroups.ownerId, me)),
    studyGroupMembers: await db.select({ group: schema.studyGroups.name, status: schema.studyGroupMembers.status, createdAt: schema.studyGroupMembers.createdAt }).from(schema.studyGroupMembers).innerJoin(schema.studyGroups, eq(schema.studyGroupMembers.groupId, schema.studyGroups.id)).where(eq(schema.studyGroupMembers.userId, me)),
    studyGroupSessions: await db.select({ group: schema.studyGroupSessions.groupId, startsAt: schema.studyGroupSessions.startsAt, endsAt: schema.studyGroupSessions.endsAt }).from(schema.studyGroupSessions).where(eq(schema.studyGroupSessions.startedBy, me)),
    studyGroupMeetings: await db.select({ group: schema.studyGroupMeetings.groupId, at: schema.studyGroupMeetings.at, subject: schema.studyGroupMeetings.subjectId, createdAt: schema.studyGroupMeetings.createdAt }).from(schema.studyGroupMeetings).where(eq(schema.studyGroupMeetings.createdBy, me)),
  };
  const body = { exportedAt: new Date().toISOString(), ...sections };
  return new Response(JSON.stringify(body, null, 2), { headers: {
    "Content-Type": "application/json; charset=utf-8", "Content-Disposition": 'attachment; filename="campuss-mes-donnees.json"', "Cache-Control": "no-store",
  } });
}
