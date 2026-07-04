// Consult-call signalling domain — pure port of iOS AXDomain/Calls.swift plus the
// consultSignals/{calleeId} doc shape written by the deployed startConsultCall Function.
// Parsing is pure so the Firestore listener stays a thin shell over tested logic.

/** An incoming consult call, derived from a consultSignals doc or a push payload. */
export interface IncomingCall {
  /** Authorisation request this call belongs to. */
  requestID: string;
  /** LiveKit room the answered call joins (mintCallToken targets this request). */
  room: string;
  callerName: string;
  patientName?: string;
}

const str = (v: unknown): string | undefined =>
  typeof v === "string" && v.length > 0 ? v : undefined;

/**
 * Parse a consultSignals/{calleeId} doc (or a push `data` payload) into an incoming call.
 * Returns null for malformed, non-call, or expired payloads so a stray or stale doc can't
 * raise a phantom ring. The signal doc carries no `kind` field — only the push payload
 * does — so `kind` is checked only when present. A missing expiry counts as expired:
 * the ring window is the signal's whole reason to exist.
 */
export function incomingCallFromSignal(data: Record<string, unknown>, nowMs: number): IncomingCall | null {
  if ("kind" in data && data.kind !== "call") return null;
  const requestID = str(data.requestId);
  if (!requestID) return null;
  const expires = data.expiresAtMillis;
  if (typeof expires !== "number" || !(expires > nowMs)) return null;
  return {
    requestID,
    room: str(data.room) ?? `req-${requestID}`,
    callerName: str(data.callerName) ?? "Incoming call",
    patientName: str(data.patientName),
  };
}

/** CallKit-parity caller line: caller, plus the patient when known. */
export function callDisplayName(callerName: string, patientName?: string): string {
  return patientName ? `${callerName} · ${patientName}` : callerName;
}

/** LiveKit Cloud endpoint — same server the iOS app connects to (LiveCallConfig.url).
 * Not a secret: room access is gated entirely by the minted per-request JWTs. */
export const LIVEKIT_URL = "wss://aestheticx-5jlv6pgk.livekit.cloud";
