# Aria Demo Script — 1 Minute

## The Beat (timing)

| Time | What's on screen | What you say |
|------|-----------------|--------------|
| 0:00–0:05 | Aria's avatar on screen, she waves at camera | "This is Aria — she's an AI music companion that actually vibes with you." |
| 0:05–0:12 | Type or voice: "play Faded by Alan Walker" → Aria responds, music starts | "Ask her to play anything. She searches YouTube, pulls the audio, and starts listening WITH you." |
| 0:12–0:25 | Split or full screen: Aria dancing/swaying to the beat, expressions changing with the music. Show the energy shifting between verse and chorus. | "Before playback, we run the full track through librosa — BPM, energy, spectral features, mood — every 4 seconds. That embedding goes to Gemini which choreographs her moves in advance. She's not random — she's on beat." |
| 0:25–0:35 | Show your face on webcam, lean in or smile — Aria mirrors it. Maybe wink and she winks back. | "MediaPipe tracks your face in the browser. She mirrors your expressions, matches your energy. No special hardware — just a webcam." |
| 0:35–0:45 | Voice chat with Aria while music plays. Ask "what do you think of this drop?" or "why does this part hit so hard?" — she responds with music context. | "You can talk to her mid-song via Gemini's native audio API. She knows the full musical context — tempo, mood, where you are in the track — so she actually has something to say." |
| 0:45–0:55 | Quick montage or continued interaction showing her trigger an expression change or animation mid-conversation via tool call | "Under the hood, Gemini drives everything — function calling for avatar control, embeddings for music understanding, live audio for voice. All real-time." |
| 0:55–1:00 | Aria does a final dance move or wave goodbye | "Aria. Your AI listening buddy. Built with Gemini." |

## Key moments to nail

1. **The wave** (0:00) — immediate "oh this is alive" moment
2. **Music sync** (0:15) — show a clear beat drop where Aria shifts from chill to energetic. This is the money shot.
3. **Face mirror** (0:28) — do something obvious (big smile or wink) so the tracking is undeniable
4. **Voice mid-song** (0:38) — talking TO her WHILE music plays shows this isn't just a visualizer

## Recording tips

- Have the song pre-loaded so there's no buffering dead time
- Keep your face well-lit for clean tracking
- Use a song with a clear dynamic shift (Faded is perfect — quiet verse → big chorus)
- Record screen + webcam overlay so judges see both you and Aria
- Don't over-explain the tech — let the demo speak, save deep dives for Q&A

## What NOT to waste time on

- No slides, no architecture diagrams — this is a demo video
- Don't explain librosa features by name — "analyzes the music" is enough for the video
- Don't show code — show the product

## Q&A prep (for the live 3-min pitch + 2-min Q&A)

Judges will probably ask:
- **"How does the music analysis work?"** → librosa extracts features every 4s, Gemini generates choreography from the embedding timeline
- **"What Gemini models?"** → 2.5 Flash for chat + directives, native audio latest for voice
- **"Is the dancing pre-scripted or real-time?"** → Both. Pre-processed choreography for known songs, real-time function calling for conversational reactions
- **"What's the face tracking doing?"** → MediaPipe in-browser, feeds expression data back so Aria can mirror and respond to your mood
- **"What's the long-term vision?"** → Every music app has a play button. None of them have a friend sitting next to you. Aria is the companion layer for music.
