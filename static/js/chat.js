import { isVoiceConnected, getVoiceWs } from './voice.js';

const sendBtn = document.getElementById('send-btn');
const msgInput = document.getElementById('msg');
const chat = document.getElementById('chat');

// ---- Chat (text fallback + display) ----
function addMessage(role, text) {
  // Remove welcome screen if present
  const welcome = chat.querySelector('.welcome');
  if (welcome) welcome.remove();

  const div = document.createElement('div');
  div.className = `msg ${role}`;
  const roleLabel = document.createElement('div');
  roleLabel.className = 'role';
  roleLabel.textContent = role === 'user' ? 'You' : role === 'system' ? '' : 'Aria';
  if (roleLabel.textContent) div.appendChild(roleLabel);
  div.appendChild(document.createTextNode(text));
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
  return div;
}

function addSongList(songs) {
  const container = document.createElement('div');
  container.className = 'msg assistant';
  const roleLabel = document.createElement('div');
  roleLabel.className = 'role';
  roleLabel.textContent = 'Aria';
  container.appendChild(roleLabel);
  container.appendChild(document.createTextNode('Here are the songs I can play:'));

  const list = document.createElement('div');
  list.className = 'song-list';

  songs.forEach(song => {
    if (!song.audio_url) return;
    const item = document.createElement('div');
    item.className = 'song-item';
    item.innerHTML = `<span class="play-icon">&#9654;</span><span class="song-name">${song.name}</span>`;
    item.addEventListener('click', () => {
      addMessage('system', `Playing ${song.name}...`);
      window.startMusicSession(song.script_url, song.audio_url, song.name);
    });
    list.appendChild(item);
  });

  container.appendChild(list);
  chat.appendChild(container);
  chat.scrollTop = chat.scrollHeight;
}

// Available songs cache
let availableSongs = [];

async function loadSongs() {
  try {
    const res = await fetch('/api/music/scripts');
    const data = await res.json();
    availableSongs = data.scripts || [];
  } catch (e) {
    console.warn('Could not load song list:', e);
  }
}

async function send() {
  const text = msgInput.value.trim();
  if (!text) return;
  msgInput.value = '';
  sendBtn.disabled = true;
  addMessage('user', text);

  // Send via voice WS (text mode) if connected
  const voiceWs = getVoiceWs();
  if (isVoiceConnected() && voiceWs && voiceWs.readyState === WebSocket.OPEN) {
    voiceWs.send(JSON.stringify({ type: 'text', text }));
    sendBtn.disabled = false;
    msgInput.focus();
    return;
  }

  // Text chat via REST API (with tool calling)
  const typing = addMessage('assistant', 'typing...');
  typing.classList.add('typing');
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({message: text})
    });
    const data = await res.json();
    typing.remove();
    if (data.reply) {
      addMessage('assistant', data.reply);
      if (window.triggerTalkingAnimation) window.triggerTalkingAnimation();
    }
    if (data.actions && data.actions.length > 0) {
      executeActions(data.actions);
    }
  } catch (e) {
    typing.remove();
    addMessage('assistant', 'Error: ' + e.message);
  }
  sendBtn.disabled = false;
  msgInput.focus();
}

function executeActions(actions) {
  for (const action of actions) {
    console.log('[action]', action);
    if (action.type === 'play_animation') {
      if (window.switchAnim) window.switchAnim(action.animation);
    } else if (action.type === 'set_expression') {
      if (window.setAvatarExpression) window.setAvatarExpression(action.expression, action.intensity || 0.6);
    } else if (action.type === 'play_music') {
      const songName = (action.song || '').toLowerCase();
      const song = availableSongs.find(s => s.name.toLowerCase().includes(songName));
      if (song && song.audio_url) {
        addMessage('system', `Playing ${song.name}...`);
        window.startMusicSession(song.script_url, song.audio_url, song.name);
      }
    }
  }
}

async function clearChat() {
  await fetch('/api/clear', {method: 'POST'});
  chat.innerHTML = '';
  showWelcome();
}

function showWelcome() {
  const welcome = document.createElement('div');
  welcome.className = 'welcome';
  welcome.innerHTML = `
    <h2 class="welcome-greeting">Hey there</h2>
    <p class="welcome-subtitle">What would you like to do?</p>
    <div class="welcome-suggestions">
      <button onclick="document.getElementById('msg').value='Play some music';document.getElementById('msg').focus()">Play some music</button>
      <button onclick="document.getElementById('msg').value='Tell me about yourself';document.getElementById('msg').focus()">Who are you?</button>
      <button onclick="document.getElementById('msg').value='Show me a dance';document.getElementById('msg').focus()">Show me a dance</button>
    </div>
  `;
  chat.appendChild(welcome);
}

async function loadHistory() {
  const res = await fetch('/api/history');
  const data = await res.json();
  chat.innerHTML = '';
  if (data.messages && data.messages.length > 0) {
    data.messages.forEach(m => addMessage(m.role, m.text));
  } else {
    showWelcome();
  }
}

// Wire up events
window.send = send;
window.clearChat = clearChat;

msgInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    send();
  }
});

// Init
loadHistory();
loadSongs();
msgInput.focus();
