const fetch = (...a) => import('node-fetch').then(({ default: f }) => f(...a));
const WebSocket = require('ws');

// ─────────────────────────────────────
//  FILL THESE IN
// ─────────────────────────────────────
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const GROQ_KEY      = process.env.GROQ_KEY;
const YOUR_USER_ID  = "1386371827269501101";
const TRIGGER       = "!ask";
const ALLOWED_CHANNELS = ["1499039243060641812", "1490504963154247830"];
// ─────────────────────────────────────

const DISCORD_API = "https://discord.com/api/v9";
const GROQ_API    = "https://api.groq.com/openai/v1/chat/completions";

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
          properties: { os: 'windows', browser: 'Discord Client', device: '' },
          compress: false,
          large_threshold: 250
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
  if (!msg.author) return;
  if (msg.author.id !== YOUR_USER_ID) return;
  if (!ALLOWED_CHANNELS.includes(msg.channel_id)) return;
  if (!msg.content.startsWith(TRIGGER)) return;

  console.log(`Trigger: ${msg.content}`);

  const question = msg.content.slice(TRIGGER.length).trim();
  if (!question) {
    await sendMessage(msg.channel_id, 'What do you need?');
    return;
  }

  await fetch(`${DISCORD_API}/channels/${msg.channel_id}/typing`, {
    method: 'POST',
    headers: { 'Authorization': DISCORD_TOKEN }
  });

  try {
    const res = await fetch(GROQ_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_KEY}`
      },
      body: JSON.stringify({
        model: 'llama3-8b-8192',
        max_tokens: 1000,
        messages: [{ role: 'user', content: question }]
      })
    });

    const data = await res.json();
    console.log('Groq response:', JSON.stringify(data));
    const reply = data.choices?.[0]?.message?.content || 'No response.';

    if (reply.length <= 2000) {
      await sendMessage(msg.channel_id, reply);
    } else {
      const chunks = reply.match(/.{1,2000}/gs);
      for (const chunk of chunks) await sendMessage(msg.channel_id, chunk);
    }
  } catch (e) {
    console.error('Groq error:', e.message);
    await sendMessage(msg.channel_id, `Error: ${e.message}`);
  }
}

async function sendMessage(channelId, content) {
  const res = await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': DISCORD_TOKEN,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ content })
  });
  const data = await res.json();
  if (!res.ok) console.error('Send error:', JSON.stringify(data));
}

connect();
