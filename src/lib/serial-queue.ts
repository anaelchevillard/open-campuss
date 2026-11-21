/** Une seule tâche à la fois, en mémoire du processus. Rien ne survit à un redémarrage : le navigateur redemandera. */
export class QueueFullError extends Error {}
export class QueueTimeoutError extends Error {}

type Waiting = { start: () => void; timer: ReturnType<typeof setTimeout> };

export function createSerialQueue({ maxPending, maxWaitMs }: { maxPending: number; maxWaitMs: number }) {
  const waiting: Waiting[] = [];
  let busy = false;

  function next() {
    const entry = waiting.shift();
    if (!entry) { busy = false; return; }
    clearTimeout(entry.timer);
    entry.start();
  }

  function run<T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    const launch = (resolve: (value: T | Promise<T>) => void) => resolve(task().finally(next));
    if (!busy) {
      busy = true;
      return new Promise<T>(launch);
    }
    if (waiting.length >= maxPending) return Promise.reject(new QueueFullError());
    return new Promise<T>((resolve, reject) => {
      const leave = (error: Error) => {
        const index = waiting.indexOf(entry);
        if (index >= 0) { waiting.splice(index, 1); clearTimeout(entry.timer); reject(error); }
      };
      const entry: Waiting = {
        start: () => { signal?.removeEventListener("abort", onAbort); launch(resolve); },
        timer: setTimeout(() => leave(new QueueTimeoutError()), maxWaitMs),
      };
      const onAbort = () => leave(new DOMException("Abandonné", "AbortError"));
      signal?.addEventListener("abort", onAbort, { once: true });
      waiting.push(entry);
    });
  }

  return {
    run,
    get busy() { return busy; },
    get pending() { return waiting.length; },
    get full() { return busy && waiting.length >= maxPending; },
  };
}
