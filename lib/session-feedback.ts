// Per-session / per-program feedback captured by the coach in the plan view.
// Stored in localStorage so it persists across reloads without DB changes.

export type PreAnswers = {
  feel: string;            // "How do you feel today?"
  sore: string;            // "Are you sore? If so, where?"
  submitted_at: string;    // ISO
};

export type PostAnswers = {
  intensity: string;       // 1-10
  hardest: string;
  comments: string;
  submitted_at: string;    // ISO
};

export type SessionFeedback = {
  pre?: PreAnswers;
  post?: PostAnswers;                         // single completion (session or whole program)
  per_day?: Record<string, PostAnswers>;      // multi-day: keyed by day uid
};

function storageKey(id: string) { return `session_feedback_${id}`; }

export function readFeedback(id: string): SessionFeedback {
  if (typeof window === "undefined" || !id) return {};
  try {
    const raw = localStorage.getItem(storageKey(id));
    return raw ? (JSON.parse(raw) as SessionFeedback) : {};
  } catch { return {}; }
}

function writeFeedback(id: string, fb: SessionFeedback): void {
  if (typeof window === "undefined" || !id) return;
  try { localStorage.setItem(storageKey(id), JSON.stringify(fb)); } catch {}
}

export function savePre(id: string, ans: Omit<PreAnswers, "submitted_at">): void {
  const fb = readFeedback(id);
  fb.pre = { ...ans, submitted_at: new Date().toISOString() };
  writeFeedback(id, fb);
}

export function savePost(id: string, ans: Omit<PostAnswers, "submitted_at">): void {
  const fb = readFeedback(id);
  fb.post = { ...ans, submitted_at: new Date().toISOString() };
  writeFeedback(id, fb);
}

export function savePerDay(id: string, dayUid: string, ans: Omit<PostAnswers, "submitted_at">): void {
  const fb = readFeedback(id);
  fb.per_day = fb.per_day ?? {};
  fb.per_day[dayUid] = { ...ans, submitted_at: new Date().toISOString() };
  writeFeedback(id, fb);
}
