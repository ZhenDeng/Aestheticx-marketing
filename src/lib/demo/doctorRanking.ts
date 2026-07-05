// Ranking + default for the authorisation-request doctor picker, computed from the
// nurse's own request history (already hydrated into DemoState.requests). Pure and
// data-source-agnostic: the doctor list comes from listDoctors (live) or DEMO_ACCOUNTS
// (demo), the stats from the nurse's requests either way.
import type { AuthorisationRequest } from "./types";

export interface DoctorRef {
  doctorId: string;
  doctorName: string;
}

export interface DoctorStat {
  count: number;
  lastAt: number; // epoch ms of the most recent request to this doctor
}

/** Per-doctor request count + latest timestamp, over the given nurse's requests only. */
export function doctorRequestStats(
  requests: AuthorisationRequest[],
  nurseID: string,
): Map<string, DoctorStat> {
  const stats = new Map<string, DoctorStat>();
  for (const r of requests) {
    if (r.nurse.id !== nurseID) continue;
    const prev = stats.get(r.doctorID);
    stats.set(r.doctorID, {
      count: (prev?.count ?? 0) + 1,
      lastAt: Math.max(prev?.lastAt ?? 0, r.createdAt),
    });
  }
  return stats;
}

// Most-requested first: count desc, then most-recent request desc, then name asc.
// Doctors the nurse has never requested (count 0) sort to the bottom, alphabetically.
export function rankDoctors<T extends DoctorRef>(doctors: T[], stats: Map<string, DoctorStat>): T[] {
  return [...doctors].sort((a, b) => {
    const sa = stats.get(a.doctorId);
    const sb = stats.get(b.doctorId);
    const ca = sa?.count ?? 0;
    const cb = sb?.count ?? 0;
    if (ca !== cb) return cb - ca;
    const la = sa?.lastAt ?? 0;
    const lb = sb?.lastAt ?? 0;
    if (la !== lb) return lb - la;
    return a.doctorName.localeCompare(b.doctorName);
  });
}

/** The last-requested doctor still present in the list (the remembered default), else null. */
export function mostRecentlyRequestedDoctor(
  stats: Map<string, DoctorStat>,
  availableIDs: string[],
): string | null {
  const available = new Set(availableIDs);
  let bestID: string | null = null;
  let bestAt = -1;
  for (const [doctorID, stat] of stats) {
    if (available.has(doctorID) && stat.lastAt > bestAt) {
      bestAt = stat.lastAt;
      bestID = doctorID;
    }
  }
  return bestID;
}
