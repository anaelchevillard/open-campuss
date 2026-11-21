/** Pour l'aperçu de l'éditeur : une image inerte (un SVG en <img> n'exécute rien et ne charge rien). */
export const svgDataUrl = (source: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source.slice(0, 400_000))}`;
