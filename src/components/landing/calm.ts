/**
 * Mouvement réduit, au sens de Campuss : la préférence du système OU le réglage « Aa » (classe reduce-motion sur
 * <html>). Dans ce cas, la page ne charge ni Lenis ni three, et ne fait ni parallaxe, ni rotation, ni défilement.
 */
export function isCalm() {
  if (typeof window === "undefined") return true;
  return document.documentElement.classList.contains("reduce-motion") || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Pointeur précis (souris, trackpad) : seuls ces appareils ont halo et parallaxe. */
export function hasFinePointer() {
  return typeof window !== "undefined" && window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}

/** Données économisées ou réseau lent : pas de 3D. */
export function isFrugal() {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  return Boolean(connection?.saveData) || /(^|-)2g|3g/.test(connection?.effectiveType ?? "");
}

/** Thème réellement affiché : classe forcée par les réglages, sinon le système. */
export function isDarkTheme() {
  const root = document.documentElement.classList;
  if (root.contains("dark")) return true;
  if (root.contains("light")) return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** Téléphone : écran étroit ou doigt pour seul pointeur. */
export function isPhone() {
  return window.matchMedia("(max-width: 767px), (pointer: coarse) and (hover: none)").matches;
}

/** Peu de mémoire ou peu de cœurs : au téléphone, un modèle 3D ferait ramer tout le reste de la page. */
export function isWeakPhone() {
  const nav = navigator as Navigator & { deviceMemory?: number };
  return isPhone() && ((nav.deviceMemory ?? 8) <= 4 || (nav.hardwareConcurrency || 8) <= 4);
}

/**
 * Le téléphone 3D : jamais en mouvement réduit, en économie de données, sur un téléphone modeste, ni sans WebGL 2.
 * Ni sur un rendu logiciel (pas de vraie carte graphique : machine virtuelle, accélération coupée), téléphone ou
 * ordinateur : chaque image y coûte des dizaines de millisecondes au processeur (16 s de blocage mesurées sur un
 * ordinateur sans carte graphique).
 */
export function can3d() {
  if (isCalm() || isFrugal() || isWeakPhone()) return false;
  try {
    const gl = document.createElement("canvas").getContext("webgl2", { failIfMajorPerformanceCaveat: true });
    const software = gl ? isSoftwareRenderer(gl) : true;
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    return !software;
  } catch {
    return false;
  }
}

/** Rendu sans carte graphique que failIfMajorPerformanceCaveat ne signale pas toujours (SwiftShader de Chrome, llvmpipe…). */
export function isSoftwareRenderer(gl: WebGL2RenderingContext) {
  const info = gl.getExtension("WEBGL_debug_renderer_info");
  const renderer = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? "");
  return /swiftshader|llvmpipe|softpipe|software|basic render/i.test(renderer);
}
