export type AnnotationRow = {
  id: string; kind: string; color: string | null; start: number; end: number; quote: string; prefix: string; suffix: string;
  note: string | null; photo: string | null; parentId: string | null; authorId: string; authorName: string; authorAvatar: string | null; createdAt: string;
};
