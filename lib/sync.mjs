/** Discards superseded reads even if a transport ignores AbortSignal. */
export function latestRequest() {
  let generation = 0;
  let controller;
  return {
    begin() {
      controller?.abort();
      controller = new AbortController();
      const current = ++generation;
      return { signal: controller.signal, current: () => generation === current };
    },
    cancel() {
      generation++;
      controller?.abort();
    },
  };
}

/** No care data or tokens are persisted in browser storage. */
export function selectionStore(storage) {
  return {
    read(userId) {
      try {
        return storage.getItem(`care-circle:${userId}`);
      } catch {
        return null;
      }
    },
    write(userId, circleId) {
      try {
        storage.setItem(`care-circle:${userId}`, circleId);
      } catch {
        /* Storage can be disabled. */
      }
    },
  };
}
