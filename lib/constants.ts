export const MODELS = {
  urusa: { url: "/models/urusa.glb", label: "Urusa" },
  riko: { url: "/models/model.vrm", label: "Riko" },
} as const;

export type ModelName = keyof typeof MODELS;

export const VRMA_ANIMS: Record<string, { url: string; loop: boolean }> = {
  idle_loop: { url: "/vrma/idle_loop.vrma", loop: true },
  VRMA_01: { url: "/vrma/VRMA_01.vrma", loop: false },
  VRMA_02: { url: "/vrma/VRMA_02.vrma", loop: false },
  VRMA_03: { url: "/vrma/VRMA_03.vrma", loop: false },
  VRMA_04: { url: "/vrma/VRMA_04.vrma", loop: false },
  VRMA_05: { url: "/vrma/VRMA_05.vrma", loop: false },
  VRMA_06: { url: "/vrma/VRMA_06.vrma", loop: false },
  VRMA_07: { url: "/vrma/VRMA_07.vrma", loop: false },
  appearing: { url: "/vrma/appearing-7KKFBBJ2.vrma", loop: false },
  waiting: { url: "/vrma/waiting-I3CZ3FBD.vrma", loop: true },
  liked: { url: "/vrma/liked-JMZZ3B47.vrma", loop: false },
};

export const ANIM_LABELS: { key: string; label: string }[] = [
  { key: "idle_loop", label: "Idle" },
  { key: "VRMA_01", label: "Show" },
  { key: "VRMA_02", label: "Greet" },
  { key: "VRMA_03", label: "Peace" },
  { key: "VRMA_04", label: "Shoot" },
  { key: "VRMA_05", label: "Spin" },
  { key: "VRMA_06", label: "Pose" },
  { key: "VRMA_07", label: "Squat" },
  { key: "appearing", label: "Appear" },
  { key: "waiting", label: "Wait" },
  { key: "liked", label: "Liked" },
];

export const VOICES = [
  { name: "Leda", style: "Youthful" },
  { name: "Aoede", style: "Breezy" },
  { name: "Achernar", style: "Soft" },
  { name: "Enceladus", style: "Breathy" },
  { name: "Vindemiatrix", style: "Gentle" },
  { name: "Zephyr", style: "Bright" },
  { name: "Autonoe", style: "Bright" },
  { name: "Despina", style: "Smooth" },
  { name: "Sulafat", style: "Warm" },
  { name: "Achird", style: "Friendly" },
  { name: "Sadachbia", style: "Lively" },
  { name: "Laomedeia", style: "Upbeat" },
  { name: "Puck", style: "Upbeat" },
  { name: "Kore", style: "Firm" },
  { name: "Fenrir", style: "Excitable" },
  { name: "Charon", style: "Informative" },
  { name: "Orus", style: "Firm" },
  { name: "Callirrhoe", style: "Easy-going" },
  { name: "Iapetus", style: "Clear" },
  { name: "Umbriel", style: "Easy-going" },
  { name: "Algieba", style: "Smooth" },
  { name: "Erinome", style: "Clear" },
  { name: "Algenib", style: "Gravelly" },
  { name: "Rasalgethi", style: "Informative" },
  { name: "Alnilam", style: "Firm" },
  { name: "Schedar", style: "Even" },
  { name: "Gacrux", style: "Mature" },
  { name: "Pulcherrima", style: "Forward" },
  { name: "Zubenelgenubi", style: "Casual" },
  { name: "Sadaltager", style: "Knowledgeable" },
] as const;

export const PLAYBACK_RATE = 24000;
export const CAPTURE_RATE = 16000;
