/**
 * Téléphone en WebGL : le modèle d'iPhone d'extraakash (Sketchfab, licence Standard, crédité dans /credits), allégé
 * par scripts/prepare-phone-model.mjs (soudure, simplification, textures WebP ≤ 1 024 px, géométrie compressée par
 * meshopt). Le décodeur meshopt est en WebAssembly, livré dans ce paquet (rien sur un CDN) : la CSP de la présentation (« / »), et
 * d'elle seule, autorise 'wasm-unsafe-eval' (lib/csp.ts). S'il est refusé (arrivée par une navigation interne, qui garde la
 * politique de la page de départ), le téléphone dessiné reste affiché. Son écran porte une vraie capture, sans
 * éclairage. Chargé à la demande par hero-phone.tsx, jamais en mouvement réduit ni sur un téléphone modeste.
 */
import {
  ACESFilmicToneMapping, Box3, DirectionalLight, Group, Mesh, MeshBasicMaterial, PerspectiveCamera, PMREMGenerator,
  Scene, SRGBColorSpace, Texture, TextureLoader, Vector3, WebGLRenderer, type Material,
} from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

/**
 * Modèle : servi par le site, chargé par le script, jamais proposé en lien. En glTF à fichiers séparés plutôt qu'en GLB :
 * les textures d'un GLB passent par des adresses blob:, que la CSP (connect-src, img-src) refuse à raison.
 */
const MODEL_URL = "/presentation/telephone-2/telephone.gltf";
/** Matériau de l'écran dans le modèle préparé. */
const SCREEN_MATERIAL = "screen";
/** Hauteur du téléphone dans la scène, en millimètres. */
const HEIGHT = 163;
/**
 * Proportions de l'écran du modèle (73,0 × 158,5 mm, soit 0,4608) : celles d'un écran d'iPhone de 393 × 852 points
 * (0,4613). Les captures (scripts/capture-showcase.mjs) sont prises à ce format, en 3x, avec la zone sûre : barre
 * d'état (heure, réseau, batterie) sous l'île du modèle, barre d'onglets et indicateur d'accueil en bas, rien de rogné.
 */
const SCREEN_ASPECT = 73.03 / 158.49;
const TAU = Math.PI * 2;
/** Distance de la caméra : le téléphone occupe environ 80 % de la hauteur du cadre, avec de la marge pour pivoter. */
const DISTANCE = 417;

/**
 * Capture recadrée comme `object-fit: cover; object-position: top`. Les coordonnées de l'écran vont de 0 à 1, le haut
 * en v = 0 (convention glTF, d'où flipY = false).
 */
function fit(texture: Texture) {
  const img = texture.image as { width: number; height: number };
  const ia = img.width / img.height;
  if (ia > SCREEN_ASPECT) { texture.repeat.set(SCREEN_ASPECT / ia, 1); texture.offset.set((1 - texture.repeat.x) / 2, 0); }
  else { texture.repeat.set(1, ia / SCREEN_ASPECT); texture.offset.set(0, 0); }
}

export type PhoneScene = {
  /** Change l'écran : le téléphone fait un tour sur lui-même et la capture change quand il est de dos. */
  setScreen(url: string): void;
  /** Avancée du défilement dans le héros (0 → 1) : le téléphone pivote vers son dos et s'élève. */
  setScroll(progress: number): void;
  /** Rendu seulement quand le téléphone est visible. */
  setActive(active: boolean): void;
  dispose(): void;
};

type Options = { screen: string; phone: boolean; onLost: () => void };

export async function createPhoneScene(canvas: HTMLCanvasElement, { screen, phone, onLost }: Options): Promise<PhoneScene> {
  // Avant tout contexte WebGL : sans WebAssembly (CSP), on s'arrête là et le repli reste
  await MeshoptDecoder.ready;
  // Densité plafonnée : 2 au plus, 1,5 au téléphone
  const dpr = Math.min(window.devicePixelRatio || 1, phone ? 1.5 : 2);
  const renderer = new WebGLRenderer({ canvas, alpha: true, antialias: dpr < 2, powerPreference: phone ? "default" : "high-performance" });
  renderer.setPixelRatio(dpr);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  const scene = new Scene();
  const camera = new PerspectiveCamera(28, 1, 10, 1500);
  camera.position.set(0, 0, DISTANCE);
  const pmrem = new PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const env = pmrem.fromScene(room, 0.04).texture;
  scene.environment = env;
  const key = new DirectionalLight(0xffffff, 1.4); key.position.set(-120, 160, 220);
  const rim = new DirectionalLight(0xff4d79, 3); rim.position.set(180, 40, -160);
  const fill = new DirectionalLight(0xffd7e0, 0.5); fill.position.set(160, -120, 120);
  scene.add(key, rim, fill);

  // Écrans : chargés une fois, gardés
  const loader = new TextureLoader();
  const textures = new Map<string, Promise<Texture>>();
  const load = (url: string) => {
    let t = textures.get(url);
    if (!t) {
      t = loader.loadAsync(url).then((tex) => {
        tex.colorSpace = SRGBColorSpace;
        tex.flipY = false;
        tex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
        fit(tex);
        return tex;
      });
      textures.set(url, t);
    }
    return t;
  };

  let gltf: Awaited<ReturnType<GLTFLoader["loadAsync"]>>, first: Texture;
  try {
    [gltf, first] = await Promise.all([new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(MODEL_URL), load(screen)]);
  } catch (error) {
    // Rien de visible n'a été dessiné : on rend le contexte WebGL tout de suite
    textures.forEach((t) => t.then((tex) => tex.dispose()).catch(() => undefined));
    env.dispose(); pmrem.dispose(); room.dispose();
    renderer.dispose();
    throw error;
  }
  const model = gltf.scene;
  // Écran : la capture, sans lumière ni reflet, un rien en retrait pour que l'île reste devant
  const screenMat = new MeshBasicMaterial({ map: first, toneMapped: false, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
  model.traverse((o) => {
    if (!(o instanceof Mesh) || (o.material as Material).name !== SCREEN_MATERIAL) return;
    (o.material as Material).dispose();
    o.material = screenMat;
  });
  // Centré sur son milieu et mis à l'échelle (le modèle est en mètres)
  const box = new Box3().setFromObject(model);
  const scale = HEIGHT / box.getSize(new Vector3()).y;
  model.scale.setScalar(scale);
  model.position.copy(box.getCenter(new Vector3()).multiplyScalar(-scale));
  const phoneGroup = new Group();
  phoneGroup.add(model);
  scene.add(phoneGroup);

  // État du mouvement : pose de repos, glisser (avec inertie), tour de changement d'écran, défilement
  let yawDrag = 0, pitchDrag = 0, velocity = 0, spin = 0, spinTarget = 0, scroll = 0, scrollSmooth = 0, hoverX = 0, hoverY = 0;
  let dragging: { x: number; y: number; id: number } | null = null;
  let pending: Texture | null = null;
  let active = false, raf = 0, last = performance.now(), time = 0;
  // Position du cadre : lue à l'entrée du pointeur, au début du geste et au redimensionnement, jamais à chaque mouvement
  let rect = canvas.getBoundingClientRect();

  const resize = () => {
    const { clientWidth: w, clientHeight: h } = canvas;
    if (!w || !h) return;
    rect = canvas.getBoundingClientRect();
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Le téléphone garde la même hauteur à l'écran, quelle que soit la forme du cadre
    camera.position.z = Math.max(DISTANCE, (DISTANCE * 0.5) / camera.aspect);
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();

  const tick = (now: number) => {
    raf = active ? requestAnimationFrame(tick) : 0;
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now; time += dt;
    if (!dragging) {
      yawDrag += velocity; velocity *= 0.93;
      if (Math.abs(velocity) < 0.002) yawDrag += (Math.round(yawDrag / TAU) * TAU - yawDrag) * 0.06;
      pitchDrag *= 0.9;
    }
    spin += (spinTarget - spin) * Math.min(1, dt * 4.5);
    if (pending && spinTarget - spin < Math.PI * 0.95) { screenMat.map = pending; screenMat.needsUpdate = true; pending = null; }
    scrollSmooth += (scroll - scrollSmooth) * Math.min(1, dt * 6);
    phoneGroup.rotation.y = -0.38 + Math.sin(time * 0.55) * 0.12 + hoverX * 0.18 + yawDrag + spin + scrollSmooth * Math.PI * 1.1;
    phoneGroup.rotation.x = 0.06 + Math.sin(time * 0.8) * 0.03 - hoverY * 0.12 + pitchDrag - scrollSmooth * 0.25;
    phoneGroup.rotation.z = Math.sin(time * 0.45) * 0.02;
    phoneGroup.position.y = Math.sin(time * 0.9) * 2 + scrollSmooth * 18;
    renderer.render(scene, camera);
  };

  const onDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    rect = canvas.getBoundingClientRect();
    dragging = { x: e.clientX, y: e.clientY, id: e.pointerId };
    velocity = 0;
    canvas.setPointerCapture(e.pointerId);
    canvas.dataset.dragging = "";
  };
  const onEnter = () => { rect = canvas.getBoundingClientRect(); };
  const onMove = (e: PointerEvent) => {
    if (e.pointerType === "mouse") { hoverX = (e.clientX - rect.left) / rect.width - 0.5; hoverY = (e.clientY - rect.top) / rect.height - 0.5; }
    if (!dragging || e.pointerId !== dragging.id) return;
    const dx = (e.clientX - dragging.x) * 0.012, dy = (e.clientY - dragging.y) * 0.008;
    dragging.x = e.clientX; dragging.y = e.clientY;
    yawDrag += dx; velocity = dx;
    if (e.pointerType === "mouse") pitchDrag = Math.max(-0.5, Math.min(0.5, pitchDrag + dy));
  };
  const onUp = (e: PointerEvent) => {
    if (!dragging || e.pointerId !== dragging.id) return;
    dragging = null;
    delete canvas.dataset.dragging;
  };
  const onLeave = () => { hoverX = 0; hoverY = 0; };
  const onContextLost = (e: Event) => { e.preventDefault(); onLost(); };
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointerenter", onEnter);
  canvas.addEventListener("pointermove", onMove, { passive: true });
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);
  canvas.addEventListener("pointerleave", onLeave);
  canvas.addEventListener("webglcontextlost", onContextLost);

  return {
    setScreen(url) {
      spinTarget += TAU;
      pending = null;
      load(url).then((tex) => { pending = tex; }).catch(() => undefined);
    },
    setScroll(progress) { scroll = Math.max(0, Math.min(1, progress)); },
    setActive(next) {
      if (next === active) return;
      active = next;
      if (active && !raf) { last = performance.now(); raf = requestAnimationFrame(tick); }
    },
    dispose() {
      active = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointerenter", onEnter);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      model.traverse((o) => {
        if (!(o instanceof Mesh)) return;
        o.geometry.dispose();
        for (const m of ([] as Material[]).concat(o.material)) {
          for (const v of Object.values(m)) if (v instanceof Texture) v.dispose();
          m.dispose();
        }
      });
      textures.forEach((t) => t.then((tex) => tex.dispose()).catch(() => undefined));
      env.dispose(); pmrem.dispose(); room.dispose();
      renderer.dispose();
    },
  };
}
