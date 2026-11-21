import type { MailBlock, MailCategory, MailLink, QueuedMail } from "./content";
import { HOME } from "@/lib/home";

/**
 * Gabarit maison, sans dépendance : tableaux, styles en ligne, 600 px, conditionnels Outlook, mode sombre.
 * Chaque chaîne est échappée ici et nulle part ailleurs ; chaque lien est un chemin du site, vérifié puis préfixé.
 */

export type MailContext = { baseUrl: string; siteName: string };
export type RenderedMail = { html: string; text: string };

const C = {
  page: "#f6f4f4", card: "#ffffff", border: "#e7e2e4", text: "#1f1619", muted: "#6c6266", brand: "#a10e2f", tint: "#f3f0f1",
};
const SANS = "'Source Sans 3','Helvetica Neue',Helvetica,Arial,sans-serif";
const HEADING = "'Source Sans 3','Helvetica Neue',Helvetica,Arial,sans-serif";
const MONO = "'SF Mono',Menlo,Consolas,'Courier New',monospace";

const ENTITIES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => ENTITIES[c]);
const lines = (value: string) => escapeHtml(value).replace(/\r?\n/g, "<br>");

/** Un lien de mail ne mène qu'au site : un chemin absolu, sans « // », sans espace ni antislash. */
export function siteUrl(baseUrl: string, path: string) {
  if (!/^\/(?!\/)[^\s\\]*$/.test(path)) throw new Error(`lien de mail refusé : ${JSON.stringify(path)}`);
  return `${baseUrl.replace(/\/$/, "")}${path}`;
}

const REASONS: Record<MailCategory, string> = {
  transactional: "Tu reçois ce mail parce qu’il concerne ton compte {site}.",
  notification: "Tu reçois ce mail parce que les notifications par mail sont activées sur ton compte {site}.",
  weekly: "Tu reçois ce résumé une fois par semaine, le dimanche, et seulement s’il y a quelque chose à dire.",
  admin: "Tu reçois ce mail parce que tu fais partie de l’équipe de {site}.",
};

const anchor = (url: string, label: string, style = "") =>
  `<a href="${escapeHtml(url)}" class="link" style="color:${C.brand};text-decoration:underline;${style}">${escapeHtml(label)}</a>`;

function linkHtml(ctx: MailContext, link: MailLink | undefined) {
  return link ? ` ${anchor(siteUrl(ctx.baseUrl, link.path), link.label)}` : "";
}

function buttonHtml(url: string, label: string) {
  const href = escapeHtml(url);
  const width = Math.max(200, Math.min(480, label.length * 9 + 64));
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" class="btn" style="margin:28px 0 12px"><tr><td align="left">
<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${href}" style="height:48px;v-text-anchor:middle;width:${width}px;" arcsize="17%" stroke="f" fillcolor="${C.brand}"><w:anchorlock/><center style="color:#ffffff;font-family:Arial,sans-serif;font-size:17px;font-weight:bold;">${escapeHtml(label)}</center></v:roundrect><![endif]-->
<!--[if !mso]><!--><a href="${href}" class="btn-a" style="display:inline-block;background-color:${C.brand};color:#ffffff;font-family:${SANS};font-size:17px;font-weight:600;line-height:48px;text-decoration:none;padding:0 28px;border-radius:8px;-webkit-text-size-adjust:none;mso-hide:all">${escapeHtml(label)}</a><!--<![endif]-->
</td></tr></table>
<p class="muted" style="margin:0 0 16px;font-family:${SANS};font-size:14px;line-height:1.5;color:${C.muted}">Le bouton ne s’ouvre pas ? Copie ce lien dans ton navigateur :<br>${anchor(url, url, "word-break:break-all")}</p>`;
}

const P = `margin:0 0 16px;font-family:${SANS};font-size:17px;line-height:1.6;color:${C.text}`;

function blockHtml(ctx: MailContext, block: MailBlock): string {
  switch (block.type) {
    case "p": return `<p class="fg" style="${P}">${lines(block.text)}${linkHtml(ctx, block.link)}</p>`;
    case "heading": return `<h2 class="fg rule" style="margin:28px 0 10px;padding-top:20px;border-top:1px solid ${C.border};font-family:${HEADING};font-size:19px;line-height:1.3;font-weight:600;color:${C.text}">${escapeHtml(block.text)}</h2>`;
    case "note": return `<p class="muted" style="margin:0 0 16px;font-family:${SANS};font-size:15px;line-height:1.55;color:${C.muted}">${lines(block.text)}${linkHtml(ctx, block.link)}</p>`;
    case "quote": return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px"><tr><td class="quote fg" style="border-left:3px solid ${C.brand};background-color:${C.tint};padding:12px 16px;font-family:${SANS};font-size:16px;line-height:1.55;color:${C.text}">${lines(block.text)}</td></tr></table>`;
    case "code": return `${block.label ? `<p class="muted" style="margin:8px 0 8px;font-family:${SANS};font-size:15px;color:${C.muted}">${escapeHtml(block.label)}</p>` : ""}<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px"><tr><td class="code fg" style="background-color:${C.tint};border:1px solid ${C.border};border-radius:8px;padding:14px 24px;font-family:${MONO};font-size:28px;font-weight:600;letter-spacing:6px;color:${C.text}">${escapeHtml(block.code)}</td></tr></table>`;
    case "button": return buttonHtml(siteUrl(ctx.baseUrl, block.path), block.label);
    case "facts": return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px">${block.items.map((item) => `<tr><td class="muted rule" valign="top" style="width:30%;padding:8px 12px 8px 0;border-bottom:1px solid ${C.border};font-family:${SANS};font-size:15px;color:${C.muted}">${escapeHtml(item.label)}</td><td class="fg rule" style="padding:8px 0;border-bottom:1px solid ${C.border};font-family:${SANS};font-size:16px;line-height:1.5;color:${C.text}">${lines(item.value)}</td></tr>`).join("")}</table>`;
    case "list": return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px">${block.items.map((item) => `<tr><td class="brand" valign="top" style="width:20px;padding:6px 0;font-family:${SANS};font-size:17px;line-height:1.6;color:${C.brand}">•</td><td class="fg" style="padding:6px 0;font-family:${SANS};font-size:17px;line-height:1.6;color:${C.text}">${lines(item.text)}${linkHtml(ctx, item.link)}</td></tr>`).join("")}</table>`;
  }
}

function blockText(ctx: MailContext, block: MailBlock): string {
  const link = (l?: MailLink) => (l ? ` ${l.label} : ${siteUrl(ctx.baseUrl, l.path)}` : "");
  switch (block.type) {
    case "p": case "note": return `${block.text}${link(block.link)}`.trim();
    case "heading": return `${block.text}\n${"-".repeat(Math.min(60, block.text.length))}`;
    case "quote": return block.text.split(/\r?\n/).map((line) => `> ${line}`).join("\n");
    case "code": return `${block.label ? `${block.label}\n` : ""}    ${block.code}`;
    case "button": return `${block.label} :\n${siteUrl(ctx.baseUrl, block.path)}`;
    case "facts": return block.items.map((item) => `${item.label} : ${item.value}`).join("\n");
    case "list": return block.items.map((item) => `- ${item.text}${link(item.link)}`).join("\n");
  }
}

function footer(ctx: MailContext, mail: QueuedMail) {
  const reason = (mail.reason ?? REASONS[mail.category]).replaceAll("{site}", ctx.siteName);
  const unsubscribe = mail.unsubscribePath ? siteUrl(ctx.baseUrl, mail.unsubscribePath) : null;
  const settings = siteUrl(ctx.baseUrl, "/parametres/notifications");
  const contact = siteUrl(ctx.baseUrl, "/contact");
  const reply = mail.formal ? "Pour nous répondre, passez par la" : "Pour répondre, passe par la";
  const unread = "Cette adresse d’envoi n’est pas lue.";
  const host = new URL(ctx.baseUrl).host;
  const mention = `${ctx.siteName}, initiative étudiante indépendante.`;
  const small = `margin:0 0 8px;font-family:${SANS};font-size:13px;line-height:1.55;color:${C.muted}`;
  const html = [
    `<p class="muted" style="${small}">${escapeHtml(reason)}</p>`,
    unsubscribe ? `<p class="muted" style="${small}">${anchor(unsubscribe, "Se désabonner en un clic", "color:" + C.muted)} · ${anchor(settings, "Réglages des notifications", "color:" + C.muted)}</p>` : "",
    mail.contact ? `<p class="muted" style="${small}">${reply} ${anchor(contact, "page de contact", "color:" + C.muted)}. ${unread}</p>` : "",
    `<p class="muted" style="${small}">${escapeHtml(mention)} ${anchor(ctx.baseUrl, host, "color:" + C.muted)}</p>`,
  ].join("");
  const text = [
    reason,
    unsubscribe ? `Se désabonner en un clic : ${unsubscribe}\nRéglages des notifications : ${settings}` : "",
    mail.contact ? `${reply} page de contact : ${contact}\n${unread}` : "",
    `${mention} ${ctx.baseUrl}`,
  ].filter(Boolean).join("\n");
  return { html, text };
}

const DARK = `.bg{background-color:#151213!important}.card{background-color:#1e1a1c!important;border-color:#322c2f!important}.fg{color:#f4f1f2!important}.muted,.muted a{color:#a99fa3!important}.brand{color:#f6a9b9!important}.link{color:#f08aa0!important}.btn-a{background-color:#b8153a!important;color:#ffffff!important}.code,.quote{background-color:#2a2527!important}.code,.rule{border-color:#322c2f!important}.logo-light{display:none!important}.logo-dark{display:block!important;max-height:none!important;overflow:visible!important}`;
// Outlook.com et l'application Outlook préfixent leurs propres sélecteurs en mode sombre
const OUTLOOK_DARK = DARK.split("}").filter(Boolean).map((rule) => rule.split("{")[0].split(",").map((s) => `[data-ogsc] ${s}`).join(",") + `{${rule.split("{")[1]}}`).join("");

function logo(ctx: MailContext) {
  const img = (variant: "light" | "dark") => `<img src="${escapeHtml(siteUrl(ctx.baseUrl, `/mail/logo-${variant}@2x.png`))}" width="144" height="30" alt="${escapeHtml(ctx.siteName)}" class="logo-${variant}" style="display:${variant === "light" ? "block" : "none"};width:144px;height:30px;border:0;outline:none;text-decoration:none;font-family:${HEADING};font-size:22px;font-weight:600;color:${C.brand}${variant === "dark" ? ";max-height:0;overflow:hidden;mso-hide:all" : ""}">`;
  // Le logo ouvre l'accueil, comme dans l'application ; sans session, /accueil mène à la connexion
  return `<a href="${escapeHtml(siteUrl(ctx.baseUrl, HOME))}" style="text-decoration:none">${img("light")}<!--[if !mso]><!-->${img("dark")}<!--<![endif]--></a>`;
}

/** « {site} » dans un texte du catalogue devient le nom du site, avant tout échappement. */
const withSiteName = (mail: QueuedMail, siteName: string): QueuedMail =>
  JSON.parse(JSON.stringify(mail).replaceAll("{site}", JSON.stringify(siteName).slice(1, -1))) as QueuedMail;

export function renderMail(queued: QueuedMail, ctx: MailContext): RenderedMail {
  const mail = withSiteName(queued, ctx.siteName);
  const end = footer(ctx, mail);
  const preheader = mail.preheader ?? mail.blocks.find((b): b is Extract<MailBlock, { type: "p" }> => b.type === "p")?.text.replace(/\s+/g, " ").slice(0, 140) ?? "";
  const font = (name: string, file: string) => `@font-face{font-family:${name};src:url(${siteUrl(ctx.baseUrl, `/mail/fonts/${file}`)}) format("woff2");font-weight:200 900;font-style:normal;font-display:swap}`;
  const body = [
    mail.greeting ? `<p class="fg" style="${P}">${escapeHtml(mail.greeting)}</p>` : "",
    ...mail.blocks.map((block) => blockHtml(ctx, block)),
  ].join("\n");
  const html = `<!DOCTYPE html>
<html lang="fr" dir="ltr" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="x-apple-disable-message-reformatting">
<meta name="format-detection" content="telephone=no,date=no,address=no,email=no,url=no">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(mail.subject)}</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:AllowPNG/><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><style>table,td,p,a,h1{font-family:Arial,sans-serif!important}</style><![endif]-->
<style>
${font('"Source Sans 3"', "source-sans-3.woff2")}
:root{color-scheme:light dark;supported-color-schemes:light dark}
body{margin:0;padding:0;width:100%!important;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}
table,td{border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt}
img{border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic}
a[x-apple-data-detectors],#MessageViewBody a{color:inherit!important;text-decoration:none!important;font-size:inherit!important;font-family:inherit!important;font-weight:inherit!important;line-height:inherit!important}
@media (max-width:620px){.container{width:100%!important}.px{padding-left:24px!important;padding-right:24px!important}.btn,.btn td,.btn-a{display:block!important;width:100%!important;text-align:center!important;box-sizing:border-box}}
@media (prefers-color-scheme:dark){${DARK}}
${OUTLOOK_DARK}
</style>
</head>
<body class="bg" style="margin:0;padding:0;background-color:${C.page};word-spacing:normal">
<div style="display:none;max-height:0;max-width:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${C.page};opacity:0">${escapeHtml(preheader)}${"&#847;&zwnj;&nbsp;".repeat(60)}</div>
<div role="article" aria-roledescription="email" aria-label="${escapeHtml(mail.subject)}" lang="fr" dir="ltr">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="bg" bgcolor="${C.page}" style="background-color:${C.page}">
<tr><td align="center" style="padding:32px 12px">
<!--[if mso]><table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px">
<tr><td class="px" style="padding:0 8px 24px">${logo(ctx)}</td></tr>
<tr><td class="card px" bgcolor="${C.card}" style="background-color:${C.card};border:1px solid ${C.border};border-radius:12px;padding:40px 48px 28px">
<h1 class="fg" style="margin:0 0 20px;font-family:${HEADING};font-size:26px;line-height:1.25;font-weight:600;color:${C.text}">${escapeHtml(mail.title)}</h1>
${body}
</td></tr>
<tr><td class="px" style="padding:24px 8px 0">${end.html}</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</div>
</body>
</html>
`;
  const text = [
    mail.title,
    mail.greeting ?? "",
    ...mail.blocks.map((block) => blockText(ctx, block)),
    `--\n${end.text}`,
  ].filter(Boolean).join("\n\n") + "\n";
  return { html, text };
}
