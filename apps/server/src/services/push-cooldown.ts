import { sendPushToUser, type PushPayload } from "./push-notify.js";

const PUSH_COOLDOWN_MS = 30_000;
const MAX_ENTRIES = 10_000;

type PendingBatch = {
  count: number;
  title: string;
  url: string;
  lastBody: string;
};

type PushScopeStore = {
  lastSentAt: Map<string, number>;
  pending: Map<string, PendingBatch>;
  timers: Map<string, ReturnType<typeof setTimeout>>;
};

const channelPushStore: PushScopeStore = {
  lastSentAt: new Map(),
  pending: new Map(),
  timers: new Map(),
};

const dmPushStore: PushScopeStore = {
  lastSentAt: new Map(),
  pending: new Map(),
  timers: new Map(),
};

function scopeKey(userId: string, scopeId: string): string {
  return `${userId}:${scopeId}`;
}

function flushBatch(key: string, userId: string, store: PushScopeStore): void {
  store.timers.delete(key);
  const batch = store.pending.get(key);
  store.pending.delete(key);
  if (!batch || batch.count === 0) return;

  store.lastSentAt.set(key, Date.now());

  const body =
    batch.count === 1
      ? batch.lastBody
      : `${batch.count} new messages — latest: ${batch.lastBody}`;

  void sendPushToUser(userId, {
    title: batch.title,
    body,
    url: batch.url,
  });
}

function scheduleFlush(
  key: string,
  userId: string,
  delayMs: number,
  store: PushScopeStore
): void {
  const existing = store.timers.get(key);
  if (existing) clearTimeout(existing);
  store.timers.set(
    key,
    setTimeout(() => flushBatch(key, userId, store), Math.max(delayMs, 0))
  );
}

function queueScopedPushNotification(
  userId: string,
  scopeId: string,
  payload: PushPayload,
  store: PushScopeStore
): void {
  const key = scopeKey(userId, scopeId);
  const now = Date.now();
  const last = store.lastSentAt.get(key) ?? 0;
  const elapsed = now - last;

  if (elapsed >= PUSH_COOLDOWN_MS) {
    store.lastSentAt.set(key, now);
    store.pending.delete(key);
    const timer = store.timers.get(key);
    if (timer) {
      clearTimeout(timer);
      store.timers.delete(key);
    }
    void sendPushToUser(userId, payload);
    return;
  }

  const batch = store.pending.get(key) ?? {
    count: 0,
    title: payload.title,
    url: payload.url ?? "/app",
    lastBody: payload.body,
  };
  batch.count += 1;
  batch.title = payload.title;
  batch.url = payload.url ?? batch.url;
  batch.lastBody = payload.body;
  store.pending.set(key, batch);

  scheduleFlush(key, userId, PUSH_COOLDOWN_MS - elapsed, store);
}

function pruneStore(store: PushScopeStore): void {
  if (store.lastSentAt.size <= MAX_ENTRIES) return;
  const cutoff = Date.now() - PUSH_COOLDOWN_MS * 2;
  for (const [key, ts] of store.lastSentAt) {
    if (ts < cutoff) {
      store.lastSentAt.delete(key);
      store.pending.delete(key);
      const timer = store.timers.get(key);
      if (timer) clearTimeout(timer);
      store.timers.delete(key);
    }
  }
}

/** Queue a channel Web Push, batching bursts within the cooldown window. */
export function queueChannelPushNotification(
  userId: string,
  channelId: string,
  payload: PushPayload
): void {
  queueScopedPushNotification(userId, channelId, payload, channelPushStore);
}

/** Queue a DM Web Push, batching bursts within the cooldown window. */
export function queueDmPushNotification(
  userId: string,
  dmId: string,
  payload: PushPayload
): void {
  queueScopedPushNotification(userId, dmId, payload, dmPushStore);
}

/** Clear stale cooldown entries so maps do not grow without bound. */
export function prunePushCooldownMap(): void {
  pruneStore(channelPushStore);
  pruneStore(dmPushStore);
}
