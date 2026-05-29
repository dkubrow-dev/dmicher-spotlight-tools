export const READINESS_STATUS = Object.freeze({
  waiting: "waiting",
  pending: "pending",
  ready: "ready",
  notReady: "notReady"
});

export const READINESS_STATUS_CONFIG = Object.freeze({
  [READINESS_STATUS.ready]: Object.freeze({
    labelKey: "Readiness.Status.Ready",
    indicator: "good"
  }),
  [READINESS_STATUS.pending]: Object.freeze({
    labelKey: "Readiness.Status.Pending",
    indicator: "doubt"
  }),
  [READINESS_STATUS.notReady]: Object.freeze({
    labelKey: "Readiness.Status.NotReady",
    indicator: "deadline"
  }),
  [READINESS_STATUS.waiting]: Object.freeze({
    labelKey: "Readiness.Status.Waiting",
    indicator: "muted"
  })
});

export function createEmptyReadinessState() {
  return {
    selected: {},
    players: {}
  };
}

export function normalizeReadinessStatus(status) {
  return Object.hasOwn(READINESS_STATUS_CONFIG, status) ? status : READINESS_STATUS.waiting;
}

export function normalizeReadinessState(rawState) {
  const state = rawState && (typeof rawState === "object") ? rawState : {};
  const selected = {};
  for (const [userId, value] of Object.entries(state.selected ?? {})) {
    selected[userId] = Boolean(value);
  }

  const players = {};
  for (const [userId, rawEntry] of Object.entries(state.players ?? {})) {
    const entry = rawEntry && (typeof rawEntry === "object") ? rawEntry : {};
    players[userId] = {
      status: normalizeReadinessStatus(entry.status),
      requestedAt: Number(entry.requestedAt) || 0,
      requestedByName: String(entry.requestedByName ?? ""),
      requestMessageId: String(entry.requestMessageId ?? "")
    };
  }

  return { selected, players };
}
