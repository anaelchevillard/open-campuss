/**
 * Prépare le modèle du téléphone 3D de la présentation (public/presentation/telephone-<n>/) à partir du fichier
 * d'origine (« Apple iPhone 18 Pro Max Burgundy 2026 », extraakash, Sketchfab, licence Standard : non redistribué,
 * donc absent du dépôt). Étape propre à Campuss, puis gltf-transform en ligne de commande. Dans un conteneur :
 *
 *   docker run --rm -v $PWD:/w -w /w node:22-alpine sh -c '
 *     npm i --no-save @gltf-transform/core@4 @gltf-transform/extensions@4 sharp &&
 *     node scripts/prepare-phone-model.mjs source.glb a.glb && G="npx -y @gltf-transform/cli@4" &&
 *     $G dedup a.glb b.glb && $G prune b.glb b.glb && $G weld b.glb b.glb &&
 *     $G simplify b.glb c.glb --ratio 0.3 --error 0.001 &&
 *     $G resize c.glb c.glb --width 1024 --height 1024 && $G webp c.glb c.glb --quality 85 &&
 *     $G meshopt c.glb public/presentation/telephone-2/telephone.gltf --level medium'
 *
 * (meshopt écrit directement le .gltf : un `copy` après coup décompresserait la géométrie.) 3,9 Mo → 0,55 Mo au total,
 * ≈ 0,35 Mo transférés avec gzip.
 *
 * Géométrie compressée par meshopt (EXT_meshopt_compression, quantification comprise) : son décodeur WebAssembly est
 * livré avec la page (three/examples/jsm/libs/meshopt_decoder.module.js), et seule la CSP de la présentation (« / ») autorise
 * 'wasm-unsafe-eval' (lib/csp.ts). Le dossier porte un numéro de version (servi « immutable », next.config.ts) : en
 * changer à chaque nouvelle version du modèle, et MODEL_URL dans src/components/landing/phone-3d.ts avec.
 * Écran : rien n'y est dessiné (ni fond, ni barre d'état). La page y pose une capture de 393 × 852 points (proportions de
 * l'écran du modèle, 73,0 × 158,5 mm), prise avec la zone sûre de l'iPhone : barre d'état sous l'île, barre d'onglets et
 * indicateur d'accueil en bas (scripts/capture-showcase.mjs). Le modèle n'a donc pas à changer quand les captures changent.
 * Écrit en glTF à fichiers séparés (.gltf, .bin, textures .webp) : les textures intégrées à un GLB seraient lues par
 * des adresses blob:, que la CSP refuse.
 */
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import sharp from "sharp";

const [input, output] = process.argv.slice(2);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(input);
const root = doc.getRoot();
const buffer = root.listBuffers()[0];

for (const mesh of root.listMeshes()) for (const prim of mesh.listPrimitives()) {
  // Tangentes inutiles : three les déduit dans le shader quand il y a une texture de relief
  if (prim.getAttribute("TANGENT")) prim.setAttribute("TANGENT", null);
  // Couleurs de sommet (ombrage précalculé) : RVB sur 8 bits au lieu de RVBA flottant, alpha toujours à 0
  const color = prim.getAttribute("COLOR_0");
  if (color) {
    const out = new Uint8Array(color.getCount() * 3), el = [];
    for (let i = 0; i < color.getCount(); i++) { color.getElement(i, el); for (let k = 0; k < 3; k++) out[i * 3 + k] = Math.round(Math.min(1, Math.max(0, el[k])) * 255); }
    prim.setAttribute("COLOR_0", doc.createAccessor().setType("VEC3").setArray(out).setNormalized(true).setBuffer(buffer));
  }
  // Écran : coordonnées planes de 0 à 1 (haut en v = 0), sans fond d'écran ; la page y pose une capture de Campuss
  if (prim.getMaterial()?.getName() === "COLOUR_Cherry_Screen") {
    const pos = prim.getAttribute("POSITION"), min = pos.getMin([]), max = pos.getMax([]);
    const uv = new Float32Array(pos.getCount() * 2), p = [];
    for (let i = 0; i < pos.getCount(); i++) { pos.getElement(i, p); uv[i * 2] = (p[0] - min[0]) / (max[0] - min[0]); uv[i * 2 + 1] = 1 - (p[1] - min[1]) / (max[1] - min[1]); }
    prim.setAttribute("TEXCOORD_0", doc.createAccessor().setType("VEC2").setArray(uv).setBuffer(buffer));
    prim.setAttribute("COLOR_0", null);
    const material = prim.getMaterial().setName("screen").setEmissiveTexture(null);
    // Pixel blanc : garde les coordonnées de texture, que prune retire quand aucune texture ne s'en sert
    const white = await sharp({ create: { width: 1, height: 1, channels: 3, background: "#ffffff" } }).png().toBuffer();
    material.setBaseColorTexture(doc.createTexture("screen").setImage(new Uint8Array(white)).setMimeType("image/png"));
  }
}
root.getAsset().generator = "glTF-Transform";
await io.write(output, doc);
