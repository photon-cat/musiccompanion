export interface ChatResponse {
  reply: string;
  actions?: AvatarAction[];
}

export interface AvatarAction {
  type: "play_animation" | "set_expression" | "play_music";
  animation?: string;
  expression?: string;
  intensity?: number;
  song?: string;
}

export interface SongInfo {
  name: string;
  script_url: string;
  audio_url?: string;
}

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  text: string;
}

export async function sendChat(message: string): Promise<ChatResponse> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });
  return res.json();
}

export async function clearChat(): Promise<void> {
  await fetch("/api/clear", { method: "POST" });
}

export async function getHistory(): Promise<{ messages: ChatMessage[] }> {
  const res = await fetch("/api/history");
  return res.json();
}

export async function getMusicScripts(): Promise<{ scripts: SongInfo[] }> {
  const res = await fetch("/api/music/scripts");
  return res.json();
}
