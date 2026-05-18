const fetch = (...a) => import('node-fetch').then(({ default: f }) => f(...a));
const WebSocket = require('ws');

// ─────────────────────────────────────
//  FILL THESE IN
// ─────────────────────────────────────
const DISCORD_TOKEN = "YOUR_DISCORD_TOKEN_HERE";
const OPENAI_KEY    = "YOUR_OPENAI_API_KEY_HERE";
const YOUR_USER_ID  = "YOUR_DISCORD_USER_ID_HERE";
const TRIGGER       = "!ask";
// ─────────────────────────────────────

const DISCORD_API = "https://discord.com/api/v9";
const OPENAI_API  = "https://api.openai.com/v1/chat/completions";

let ws, heartbeatInterval, sequence = null;

function connect() {
  ws = new WebSocket('wss://gateway.discord.gg/?v=10&encoding=json');

  ws.on('open', () => console.log('Connected to Discord gateway'));

  ws.on('message', async (data) => {
    const payload = JSON.parse(data);
    const { op, d, t, s } = payload;
    if (s) sequence = s;

    if (op === 10) {
      heartbeatInterval = setInterval(() => {
        ws.send(JSON.stringify({ op: 1, d: sequence }));
      }, d.heartbeat_interval);

      ws.send(JSON.stringify({
        op: 2,
        d: {
          token: DISCORD_TOKEN,
          properties: { os: 'windows', browser: 'chrome', device: 'chrome' },
          intents: (1 << 0) | (1 << 9) | (1 << 12)
        }
      }));
    }

    if (op === 0 && t === 'READY') {
      console.log(`Logged in as ${d.user.username}`);
    }

    if (op === 0 && t === 'MESSAGE_CREATE') {
      await handleMessage(d);
    }
  });

  ws.on('close', (code) => {
    console.log(`Disconnected (${code}), reconnecting in 5s...`);
    clearInterval(heartbeatInterval);
    setTimeout(connect, 5000);
  });

  ws.on('error', (err) => console.error('WS error:', err.message));
}

async function handleMessage(msg) {
  if (msg.author.id !== YOUR_USER_ID) return;
  if (!msg.content.startsWith(TRIGGER)) return;

  const question = msg.content.slice(TRIGGER.length).trim();
  if (!question) {
    await sendMessage(msg.channel_id, 'What do you need?');
    return;
  }

  // Typing indicator
  await fetch(`${DISCORD_API}/channels/${msg.channel_id}/typing`, {
    method: 'POST',
    headers: { 'Authorization': DISCORD_TOKEN }
  });

  try {
    const res = await fetch(OPENAI_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        max_tokens: 1000,
        messages: [{ role: 'user', content: question }]
      })
    });

    const data = await res.json();
    const reply = data.choices?.[0]?.message?.content || 'No response.';

    if (reply.length <= 2000) {
      await sendMessage(msg.channel_id, reply);
    } else {
      const chunks = reply.match(/.{1,2000}/gs);
      for (const chunk of chunks) await sendMessage(msg.channel_id, chunk);
    }
  } catch (e) {
    await sendMessage(msg.channel_id, `Error: ${e.message}`);
  }
}

async function sendMessage(channelId, content) {
  await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': DISCORD_TOKEN,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ content })
  });
}

connect();
