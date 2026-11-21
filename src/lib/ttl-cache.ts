/** Cache mémoire borné : les entrées vivent peu, et les plus anciennement lues partent quand il est plein. */
export class TtlCache<V> {
  private entries = new Map<string, { value: V; expires: number }>();
  private loading = new Map<string, Promise<V>>();

  constructor(private maxSize: number, private ttlMs: number, private now: () => number = Date.now) {}

  get size() { return this.entries.size; }

  get(key: string): V | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expires <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }
    // Une Map garde l'ordre d'insertion : réinsérer place l'entrée en dernière position à évincer
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key: string, value: V) {
    this.entries.delete(key);
    this.entries.set(key, { value, expires: this.now() + this.ttlMs });
    while (this.entries.size > this.maxSize) this.entries.delete(this.entries.keys().next().value as string);
  }

  /** Oublie aussi le chargement en cours : sa réponse, lue avant le changement, ne doit pas être gardée. */
  delete(key: string) {
    this.entries.delete(key);
    this.loading.delete(key);
  }

  clear() {
    this.entries.clear();
    this.loading.clear();
  }

  /** Plusieurs requêtes simultanées pour une même clé ne font qu'un seul chargement. Un échec n'est pas gardé. */
  async getOrLoad(key: string, load: () => Promise<V>): Promise<V> {
    const hit = this.get(key);
    if (hit !== undefined) return hit;
    const pending = this.loading.get(key);
    if (pending) return pending;
    const promise: Promise<V> = Promise.resolve().then(load).then((value) => {
      if (this.loading.get(key) === promise) this.set(key, value);
      return value;
    }).finally(() => {
      if (this.loading.get(key) === promise) this.loading.delete(key);
    });
    this.loading.set(key, promise);
    return promise;
  }
}
