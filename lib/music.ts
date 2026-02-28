export interface MusicScript {
  duration: number;
  chunk_seconds: number;
  embeddings: MusicEmbedding[];
  directives: MusicDirective[];
}

export interface MusicEmbedding {
  t: number;
  t_end: number;
  summary: string;
  energy: number;
  brightness: number;
  valence: number;
  tempo: number;
  onset: number;
  chroma: number[];
}

export interface MusicDirective {
  t: number;
  pose: string;
  intensity: number;
  head_bob: number;
  sway_amount: number;
  expression: string;
  eye_state: string;
  description: string;
}

export interface InterpolatedDirective {
  intensity: number;
  head_bob: number;
  sway_amount: number;
  pose: string;
  expression: string;
  eye_state: string;
  description: string;
}

export function getInterpolatedDirective(
  script: MusicScript,
  t: number
): InterpolatedDirective | null {
  const dirs = script.directives;
  if (!dirs?.length) return null;
  if (t <= dirs[0].t) return dirs[0];
  if (t >= dirs[dirs.length - 1].t) return dirs[dirs.length - 1];

  let i = 0;
  while (i < dirs.length - 1 && dirs[i + 1].t <= t) i++;

  const a = dirs[i];
  const b = dirs[Math.min(i + 1, dirs.length - 1)];
  if (a === b) return a;

  const frac = (t - a.t) / (b.t - a.t);

  return {
    intensity: a.intensity + (b.intensity - a.intensity) * frac,
    head_bob: a.head_bob + (b.head_bob - a.head_bob) * frac,
    sway_amount: a.sway_amount + (b.sway_amount - a.sway_amount) * frac,
    pose: frac < 0.5 ? a.pose : b.pose,
    expression: frac < 0.5 ? a.expression : b.expression,
    eye_state: frac < 0.5 ? a.eye_state : b.eye_state,
    description: frac < 0.5 ? a.description : b.description,
  };
}

export function getTempoAt(script: MusicScript, t: number): number {
  const embs = script.embeddings;
  if (!embs?.length) return 90;
  for (let i = embs.length - 1; i >= 0; i--) {
    if (embs[i].t <= t) return embs[i].tempo || 90;
  }
  return embs[0].tempo || 90;
}

const EXPRESSION_MAP: Record<string, Record<string, number>> = {
  calm: { happy: 0.0, sad: 0.0, relaxed: 0.5 },
  neutral: { happy: 0.0, sad: 0.0, relaxed: 0.0 },
  emotional: { happy: 0.0, sad: 0.35, relaxed: 0.0 },
  happy: { happy: 0.6, sad: 0.0, relaxed: 0.0 },
  serene: { happy: 0.15, sad: 0.0, relaxed: 0.6 },
  excited: { happy: 0.8, sad: 0.0, relaxed: 0.0 },
  dreamy: { happy: 0.1, sad: 0.0, relaxed: 0.5 },
};

export function getMusicExpressionValues(
  expression: string,
  intensity: number
): Record<string, number> {
  const expValues = EXPRESSION_MAP[expression] || EXPRESSION_MAP.neutral;
  const result: Record<string, number> = {};
  for (const [name, val] of Object.entries(expValues)) {
    result[name] = val * Math.max(intensity, 0.3);
  }
  return result;
}

export function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}
