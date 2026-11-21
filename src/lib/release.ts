import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";

let cached: string | null = null;

/**
 * Version en ligne : GIT_SHA (posé au build de l'image, voir le Dockerfile), sinon l'identifiant de build de Next,
 * sinon « dev ». Sert à dater les erreurs et à rouvrir une erreur résolue qui revient dans une nouvelle version.
 */
export function currentRelease() {
  if (cached !== null) return cached;
  const sha = (process.env.GIT_SHA ?? process.env.SOURCE_COMMIT ?? "").trim().slice(0, 12);
  let build = "";
  if (!sha) {
    try {
      build = readFileSync(join(process.cwd(), ".next", "BUILD_ID"), "utf8").trim().slice(0, 40);
    } catch {
      build = "";
    }
  }
  cached = sha || (build ? `build-${build}`.slice(0, 40) : "dev");
  return cached;
}
