import "server-only";
import type { Organization } from "./organization-text";
import { isDemo } from "./demo";
import { quotaBytes } from "./storage-quota";

// Lu à l'exécution, jamais figé au build : l'image ne contient aucun secret.
const read = (name: string, fallback = "") => (process.env[name] ?? fallback).trim();
// Démonstration : ce qui sort du serveur (mails, IA, push, services connectés) n'existe pas, quelle que soit la configuration
const outside = (name: string, fallback = "") => (isDemo() ? "" : read(name, fallback));

export const env = {
  /** Instance de démonstration : voir lib/demo.ts. */
  get demoMode() { return isDemo(); },
  get siteName() { return read("SITE_NAME", "Campuss"); },
  // Établissement desservi (présentation, pages d'information, /llms.txt) : vide par défaut, voir lib/organization-text.ts
  get organization(): Organization {
    return { name: read("ORGANIZATION_NAME"), short: read("ORGANIZATION_SHORT"), city: read("ORGANIZATION_CITY"), university: read("UNIVERSITY_NAME") };
  },
  get baseUrl() { return read("BASE_URL", "https://campuss.fr").replace(/\/$/, ""); },
  get databaseUrl() { return read("DATABASE_URL"); },
  get secretKey() {
    const key = read("SECRET_KEY");
    if (key.length < 32) throw new Error("SECRET_KEY doit contenir au moins 32 caractères");
    return key;
  },
  get adminEmail() { return read("ADMIN_EMAIL").toLowerCase(); },
  get adminName() { return read("ADMIN_NAME", "Administrateur"); },
  get adminPasswordFile() { return read("ADMIN_PASSWORD_FILE", "/secrets/admin-initial-password.txt"); },
  get s3Endpoint() { return read("S3_ENDPOINT", "http://minio:9000"); },
  get s3Region() { return read("S3_REGION", "us-east-1"); },
  get s3Bucket() { return read("S3_BUCKET", "campus"); },
  get s3AccessKey() { return read("S3_ACCESS_KEY"); },
  get s3SecretKey() { return read("S3_SECRET_KEY"); },
  get smtpHost() { return read("SMTP_HOST"); },
  get smtpPort() { return Number(read("SMTP_PORT", "465")); },
  get smtpUser() { return read("SMTP_USER"); },
  get smtpPassword() { return read("SMTP_PASSWORD"); },
  get smtpFrom() { return read("SMTP_FROM"); },
  // Réservé aux tests avec un serveur SMTP local
  get smtpInsecure() { return read("SMTP_INSECURE") === "true"; },
  get smtpEnabled() { return !isDemo() && Boolean(read("SMTP_HOST") && read("SMTP_FROM") && (read("SMTP_PASSWORD") || read("SMTP_INSECURE") === "true")); },
  // Adresses étudiantes acceptées sans relecture, une fois la boîte mail prouvée
  get autoApproveDomains() { return read("AUTO_APPROVE_DOMAINS").toLowerCase().split(",").map((d) => d.trim()).filter(Boolean); },
  // Domaines dont les adresses suivent prenom_nom@… : le nom du compte en est tiré à l'inscription
  get namedEmailDomains() { return read("NAMED_EMAIL_DOMAINS").toLowerCase().split(",").map((d) => d.trim()).filter(Boolean); },
  // Captcha Cloudflare Turnstile à l'inscription : actif seulement avec les deux clés
  get turnstileSiteKey() { return read("TURNSTILE_SITE_KEY"); },
  get turnstileSecretKey() { return read("TURNSTILE_SECRET_KEY"); },
  get turnstileEnabled() { return Boolean(read("TURNSTILE_SITE_KEY") && read("TURNSTILE_SECRET_KEY")); },
  get clamavHost() { return read("CLAMAV_HOST"); },
  get clamavPort() { return Number(read("CLAMAV_PORT", "3310")); },
  get reportHideThreshold() { return Number(read("REPORT_HIDE_THRESHOLD", "3")); },
  /** Fenêtre de regroupement des mails non urgents (lib/mail/digest.ts), en secondes : 600 par défaut, 0 à 3600. */
  get mailBatchMs() { const s = Number(read("MAIL_BATCH_SECONDS", "600")); return (Number.isFinite(s) ? Math.min(3600, Math.max(0, s)) : 600) * 1000; },
  // À activer seulement une fois Traefik limité aux adresses de Cloudflare (voir le README)
  get trustedIpHeader() { return read("TRUSTED_IP_HEADER").toLowerCase() === "cf-connecting-ip" ? "cf-connecting-ip" : ""; },
  get contentOrigin() { return read("CONTENT_ORIGIN").replace(/\/$/, ""); },
  get legalPublisher() { return read("LEGAL_PUBLISHER"); },
  // Toute API compatible OpenAI. Par défaut Gemini, dont l'offre gratuite accepte les images.
  get aiBaseUrl() { return read("AI_BASE_URL", "https://generativelanguage.googleapis.com/v1beta/openai").replace(/\/$/, ""); },
  get aiApiKey() { return outside("AI_API_KEY"); },
  get aiModel() { return read("AI_MODEL", "gemini-2.5-flash"); },
  // Modèle des petites tâches (classement d'un dépôt) ; à défaut, AI_MODEL
  get aiModelLight() { return read("AI_MODEL_LIGHT") || read("AI_MODEL", "gemini-2.5-flash"); },
  // Plafond quotidien de jetons (entrée + sortie), tous usages confondus ; au-delà, l'IA se met en pause jusqu'à minuit
  get aiDailyTokenBudget() { const n = Number(read("AI_DAILY_TOKEN_BUDGET", "2000000")); return Number.isFinite(n) && n > 0 ? Math.floor(n) : 2_000_000; },
  // Push web : les deux clés ensemble, sinon la fonction n'existe pas pour personne
  get vapidPublicKey() { return read("VAPID_PUBLIC_KEY"); },
  get vapidPrivateKey() { return read("VAPID_PRIVATE_KEY"); },
  get pushEnabled() { return !isDemo() && Boolean(read("VAPID_PUBLIC_KEY") && read("VAPID_PRIVATE_KEY")); },
  get notionToken() { return outside("NOTION_TOKEN"); },
  // Dossier connecté : invisible sans ces clés
  get notionOauthClientId() { return outside("NOTION_OAUTH_CLIENT_ID"); },
  get notionOauthClientSecret() { return outside("NOTION_OAUTH_CLIENT_SECRET"); },
  get googleOauthClientId() { return outside("GOOGLE_OAUTH_CLIENT_ID"); },
  get googleOauthClientSecret() { return outside("GOOGLE_OAUTH_CLIENT_SECRET"); },
  get tmpDir() { return read("CAMPUS_TMP", "/tmp"); },
  // État des sauvegardes, écrit par le script de sauvegarde de l'hôte ; lu seulement par la page Système
  get backupStatusFile() { return read("BACKUP_STATUS_FILE"); },
  get storageQuotaBytes() { return quotaBytes(read("STORAGE_QUOTA_MB")); },
};

export const MAX_FILE_BYTES = 200 * 1024 * 1024;
export const MAX_ZIP_EXTRACTED_BYTES = 1024 ** 3;
export const MAX_STUDENT_FILE_BYTES = 50 * 1024 * 1024;
export const PART_BYTES = 8 * 1024 * 1024;
export const SESSION_DAYS = 30;
export const VIEW_TOKEN_SECONDS = 12 * 3600;
