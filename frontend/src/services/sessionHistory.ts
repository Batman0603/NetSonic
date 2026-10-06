import type { TrafficSnapshot, TrafficTimePoint } from "./traffic";

const STORAGE_KEY = "netsonic.traffic.sessions.v1";
const MAX_SESSIONS = 8;
const MAX_SAMPLES_PER_SESSION = 1200;

export interface TrafficHistorySession {
  /** A browser-local recording of bounded, aggregated traffic samples. */
  id: string;
  name: string;
  interfaceName: string;
  startedAt: string;
  endedAt: string;
  samples: TrafficTimePoint[];
}

/** Read saved sessions; malformed or unavailable storage yields no history. */
export function loadTrafficSessions(): TrafficHistorySession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const sessions = JSON.parse(raw) as TrafficHistorySession[];
    return Array.isArray(sessions) ? sessions : [];
  } catch {
    return [];
  }
}

/** Save newest first and retain at most the configured session limit. */
export function saveTrafficSession(session: TrafficHistorySession): void {
  const sessions = [session, ...loadTrafficSessions()]
    .slice(0, MAX_SESSIONS);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
}

/** Copy the latest sample while bounding peer/protocol detail for storage. */
export function createHistorySample(
  snapshot: TrafficSnapshot,
): TrafficTimePoint | null {
  const point = snapshot.timeseries.at(-1);
  if (!point) return null;
  return {
    ...point,
    protocols: (point.protocols ?? []).slice(0, 8),
    peers: (point.peers ?? []).slice(0, 5),
    peer_protocols: (point.peer_protocols ?? []).slice(0, 8),
  };
}

export { MAX_SAMPLES_PER_SESSION };
