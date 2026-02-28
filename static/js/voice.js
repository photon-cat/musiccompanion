const VOICES = [
  { name: 'Leda',          style: 'Youthful' },
  { name: 'Aoede',         style: 'Breezy' },
  { name: 'Achernar',      style: 'Soft' },
  { name: 'Enceladus',     style: 'Breathy' },
  { name: 'Vindemiatrix',  style: 'Gentle' },
  { name: 'Zephyr',        style: 'Bright' },
  { name: 'Autonoe',       style: 'Bright' },
  { name: 'Despina',       style: 'Smooth' },
  { name: 'Sulafat',       style: 'Warm' },
  { name: 'Achird',        style: 'Friendly' },
  { name: 'Sadachbia',     style: 'Lively' },
  { name: 'Laomedeia',     style: 'Upbeat' },
  { name: 'Puck',          style: 'Upbeat' },
  { name: 'Kore',          style: 'Firm' },
  { name: 'Fenrir',        style: 'Excitable' },
  { name: 'Charon',        style: 'Informative' },
  { name: 'Orus',          style: 'Firm' },
  { name: 'Callirrhoe',    style: 'Easy-going' },
  { name: 'Iapetus',       style: 'Clear' },
  { name: 'Umbriel',       style: 'Easy-going' },
  { name: 'Algieba',       style: 'Smooth' },
  { name: 'Erinome',       style: 'Clear' },
  { name: 'Algenib',       style: 'Gravelly' },
  { name: 'Rasalgethi',    style: 'Informative' },
  { name: 'Alnilam',       style: 'Firm' },
  { name: 'Schedar',       style: 'Even' },
  { name: 'Gacrux',        style: 'Mature' },
  { name: 'Pulcherrima',   style: 'Forward' },
  { name: 'Zubenelgenubi', style: 'Casual' },
  { name: 'Sadaltager',    style: 'Knowledgeable' },
];

const voiceSelect = document.getElementById('voice-select');
const micBtn = document.getElementById('mic-btn');
const voiceStatus = document.getElementById('voice-status');

// Populate voice dropdown
VOICES.forEach(v => {
  const opt = document.createElement('option');
  opt.value = v.name;
  opt.textContent = `${v.name} - ${v.style}`;
  voiceSelect.appendChild(opt);
});
const savedVoice = localStorage.getItem('gemini_voice') || 'Leda';
voiceSelect.value = savedVoice;

// ---- Voice WebSocket ----
let voiceWs = null;
let audioCtx = null;
let mediaStream = null;
let workletNode = null;
let micActive = false;
let voiceConnected = false;

const PLAYBACK_RATE = 24000;
const CAPTURE_RATE = 16000;

function setVoiceStatus(msg) { voiceStatus.textContent = msg; }

function connectVoice() {
  setVoiceStatus('Connecting voice...');
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  voiceWs = new WebSocket(`${proto}//${location.host}/ws/voice`);

  voiceWs.onopen = () => {
    setVoiceStatus('Setting up voice...');
    voiceWs.send(JSON.stringify({ type: 'set_voice', voice: voiceSelect.value }));
  };

  voiceWs.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type === 'ready') {
      voiceConnected = true;
      setVoiceStatus(`Voice: ${voiceSelect.value}`);
    } else if (msg.type === 'audio') {
      micBtn.classList.add('speaking');
      queueAudio(msg.data);
      if (window.triggerTalkingAnimation) window.triggerTalkingAnimation();
    } else if (msg.type === 'turn_complete') {
      resetPlayback();
      setTimeout(() => micBtn.classList.remove('speaking'), 300);
    } else if (msg.type === 'error') {
      setVoiceStatus('Voice error: ' + msg.message);
    }
  };

  voiceWs.onclose = () => {
    voiceConnected = false;
    if (!document.hidden) {
      setVoiceStatus('Voice disconnected - reconnecting...');
      setTimeout(() => connectVoice(), 3000);
    }
  };

  voiceWs.onerror = () => setVoiceStatus('Voice connection error');
}

voiceSelect.addEventListener('change', () => {
  localStorage.setItem('gemini_voice', voiceSelect.value);
  if (voiceConnected) {
    stopMic();
    if (voiceWs) { voiceWs.close(); voiceWs = null; }
    voiceConnected = false;
    setTimeout(() => connectVoice(), 500);
  }
});

// ---- Mic ----
micBtn.addEventListener('click', async () => {
  if (micActive) {
    stopMic();
  } else {
    await startMic();
  }
});

async function startMic() {
  if (!voiceConnected) { setVoiceStatus('Voice not connected yet'); return; }
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: { sampleRate: CAPTURE_RATE, channelCount: 1, echoCancellation: true, noiseSuppression: true }
    });

    audioCtx = new AudioContext({ sampleRate: CAPTURE_RATE });

    const workletCode = `
      class PCMProcessor extends AudioWorkletProcessor {
        process(inputs) {
          const input = inputs[0];
          if (input.length > 0) {
            const samples = input[0];
            const pcm16 = new Int16Array(samples.length);
            for (let i = 0; i < samples.length; i++) {
              const s = Math.max(-1, Math.min(1, samples[i]));
              pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
            }
            this.port.postMessage(pcm16.buffer, [pcm16.buffer]);
          }
          return true;
        }
      }
      registerProcessor('pcm-processor', PCMProcessor);
    `;
    const blob = new Blob([workletCode], { type: 'application/javascript' });
    const workletUrl = URL.createObjectURL(blob);
    await audioCtx.audioWorklet.addModule(workletUrl);
    URL.revokeObjectURL(workletUrl);

    const source = audioCtx.createMediaStreamSource(mediaStream);
    workletNode = new AudioWorkletNode(audioCtx, 'pcm-processor');

    let sendBuffer = new Int16Array(0);
    const CHUNK_SAMPLES = 2048;

    workletNode.port.onmessage = (e) => {
      if (!voiceWs || voiceWs.readyState !== WebSocket.OPEN) return;
      const newData = new Int16Array(e.data);
      const merged = new Int16Array(sendBuffer.length + newData.length);
      merged.set(sendBuffer);
      merged.set(newData, sendBuffer.length);
      sendBuffer = merged;

      while (sendBuffer.length >= CHUNK_SAMPLES) {
        const chunk = sendBuffer.slice(0, CHUNK_SAMPLES);
        sendBuffer = sendBuffer.slice(CHUNK_SAMPLES);
        const b64 = arrayBufferToBase64(chunk.buffer);
        voiceWs.send(JSON.stringify({ type: 'audio', data: b64 }));
      }
    };

    source.connect(workletNode);
    workletNode.connect(audioCtx.destination);

    micActive = true;
    micBtn.classList.add('active');
    setVoiceStatus(`Mic on - ${voiceSelect.value}`);

  } catch (err) {
    setVoiceStatus('Mic error: ' + err.message);
  }
}

function stopMic() {
  micActive = false;
  micBtn.classList.remove('active', 'speaking');
  if (voiceConnected) setVoiceStatus(`Voice: ${voiceSelect.value}`);

  if (workletNode) { workletNode.disconnect(); workletNode = null; }
  if (mediaStream) { mediaStream.getTracks().forEach(t => t.stop()); mediaStream = null; }
  if (audioCtx) { audioCtx.close(); audioCtx = null; }
}

// ---- Audio Playback (gapless) ----
let playbackCtx = null;
let nextPlayTime = 0;

function queueAudio(b64data) {
  const bytes = base64ToArrayBuffer(b64data);
  const pcm16 = new Int16Array(bytes);
  const float32 = new Float32Array(pcm16.length);
  for (let i = 0; i < pcm16.length; i++) {
    float32[i] = pcm16[i] / 32768;
  }

  if (!playbackCtx) {
    playbackCtx = new AudioContext({ sampleRate: PLAYBACK_RATE });
  }

  const now = playbackCtx.currentTime;
  if (nextPlayTime < now) nextPlayTime = now + 0.05;

  const buffer = playbackCtx.createBuffer(1, float32.length, PLAYBACK_RATE);
  buffer.getChannelData(0).set(float32);

  const source = playbackCtx.createBufferSource();
  source.buffer = buffer;
  source.connect(playbackCtx.destination);
  source.start(nextPlayTime);
  nextPlayTime += buffer.duration;
}

function resetPlayback() { nextPlayTime = 0; }

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToArrayBuffer(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

// Export for chat module
export function isVoiceConnected() { return voiceConnected; }
export function getVoiceWs() { return voiceWs; }

// Init
connectVoice();
