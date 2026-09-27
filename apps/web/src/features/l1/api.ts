import type { Action, L1State } from "./model";
import type { Positions } from "./save";
export const SESSION_KEY = "emotional:l1:server:v1";
export const PENDING_KEY = "emotional:l1:pending:v1";
export type Session = { id: string; token: string; version: number; rules_version: string; state: L1State; positions: Positions };
export type Receipt = { action_id: string; accepted: boolean; code: string; version: number; received_at?: string; duplicate?: boolean; action: Action };
export type Pending = { sessionId: string; action_id: string; expected_version: number; action: Action; positions: Positions };
export class RejectedAction extends Error {
  constructor(public receipt: Receipt, public session: Session) { super(receipt.code); }
}
async function request(path: string, session?: Session, body?: unknown) {
  const response = await fetch(`/api/v1${path}`, {
    method: body === undefined ? "GET" : "POST", cache: "no-store",
    headers: { "Content-Type": "application/json", ...(session ? { Authorization: `Bearer ${session.token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(12000),
  });
  const data = await response.json();
  if (!response.ok && !data.session) throw new Error(typeof data.detail === "string" ? data.detail : `HTTP ${response.status}`);
  return data;
}
export function readSession(): Session | null {
  const raw = localStorage.getItem(SESSION_KEY);
  return raw ? JSON.parse(raw) as Session : null;
}
export function storeSession(session: Session) { localStorage.setItem(SESSION_KEY, JSON.stringify(session)); }
export async function createSession(): Promise<Session> {
  const session = await request("/sessions", undefined, {});
  storeSession(session);
  return session;
}
export async function resumeSession(session: Session): Promise<Session> {
  const current = { ...await request(`/sessions/${session.id}`, session), token: session.token };
  storeSession(current);
  return current;
}
export function readPending(): Pending | null {
  const raw = localStorage.getItem(PENDING_KEY);
  return raw ? JSON.parse(raw) as Pending : null;
}
export function prepare(session: Session, action: Action, positions: Positions): Pending {
  if (readPending()) throw new Error("仍有未确认事件，请先重试同步");
  const pending = { sessionId: session.id, action_id: crypto.randomUUID(), expected_version: session.version, action, positions };
  localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
  return pending;
}
export async function submit(session: Session, pending: Pending): Promise<{ session: Session; receipt: Receipt }> {
  if (pending.sessionId !== session.id) throw new Error("待同步事件与当前会话不一致");
  const { sessionId: _, ...body } = pending;
  const result = await request(`/sessions/${session.id}/actions`, session, body);
  const current = { ...result.session, token: session.token };
  const receipt = { action_id: pending.action_id, accepted: result.accepted, code: result.code, version: result.version, duplicate: result.duplicate, action: pending.action };
  storeSession(current);
  localStorage.removeItem(PENDING_KEY);
  if (!result.accepted) throw new RejectedAction(receipt, current);
  return { session: current, receipt };
}
export async function getReceipts(session: Session): Promise<Receipt[]> { return request(`/sessions/${session.id}/events`, session); }

export function readDraft(session: Session): Positions {
  try {
    const raw = localStorage.getItem(`emotional:l1:draft:${session.id}`);
    if (!raw) return session.positions;
    const value = JSON.parse(raw);
    const draft: Positions = {};
    for (const [key, p] of Object.entries(value)) {
      const pos = p as { x: number; y: number };
      if (!["planks", "rope", "ring", "oar"].includes(key) || !pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y) || Math.abs(pos.x) > 1 || Math.abs(pos.y) > 1) return session.positions;
      draft[key] = pos;
    }
    return draft;
  } catch { return session.positions; }
}
