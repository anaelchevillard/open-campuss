import "server-only";
import { degrees, PDFDocument, rgb, StandardFonts } from "pdf-lib";

const winAnsi = (text: string) => text.normalize("NFC").replace(/[^\x20-\x7e -ÿ]/g, "?");

/** Nom du lecteur sur chaque page : dissuade la rediffusion. Un PDF illisible ou protégé renvoie null. */
export async function watermarkPdf(bytes: Uint8Array, reader: string) {
  try {
    const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const date = new Date().toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" });
    const text = winAnsi(`Copie personnelle de ${reader}, ${date}. Ne pas diffuser.`);
    for (const page of pdf.getPages()) {
      const { width, height } = page.getSize();
      page.drawText(text, { x: 24, y: 14, size: 8, font, color: rgb(0.45, 0.05, 0.15), opacity: 0.75 });
      page.drawText(winAnsi(reader), { x: width * 0.18, y: height * 0.35, size: Math.min(46, width / 12), font, color: rgb(0.63, 0.05, 0.18), opacity: 0.07, rotate: degrees(35) });
    }
    return await pdf.save();
  } catch (error) {
    console.warn("filigrane impossible :", (error as Error).message);
    return null;
  }
}
