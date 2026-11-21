/** Événements de la page de cours : le panneau Notes s'ouvre de partout et annonce son nombre de notes. */
export const OPEN_NOTES = "campuss:open-notes";
export const NOTES_COUNT = "campuss:notes-count";
export const MEMO_GENERATE = "campuss:memo-generate";
export const openNotesPanel = () => dispatchEvent(new Event(OPEN_NOTES));
/** « Marquer comme lu » (detail : true lu, false non lu) : le suivi de lecture cesse de réécrire la position. */
export const MARKED_READ = "campuss:marked-read";
/** Ouvre le formulaire « Écrire une fiche » du cours. */
export const MEMO_WRITE = "campuss:memo-write";
export const writeMemoCard = () => { document.getElementById("fiches-memo")?.scrollIntoView({ behavior: "smooth", block: "start" }); dispatchEvent(new Event(MEMO_WRITE)); };
/** Ouvre le lecteur « Écouter le cours ». */
export const OPEN_PODCAST = "campuss:podcast-open";
export const openPodcast = () => dispatchEvent(new Event(OPEN_PODCAST));
