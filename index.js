const fetch = (...a) => import('node-fetch').then(({ default: f }) => f(...a));

const DISCORD_TOKEN    = process.env.DISCORD_TOKEN;
const GROQ_KEY         = process.env.GROQ_KEY;
const YOUR_USER_ID     = "1386371827269501101";
const TRIGGER          = "!ask";
const ALLOWED_CHANNELS = ["1499039243060641812", "1490504963154247830"];
const POLL_INTERVAL    = 3000; // check every 3 seconds

const DISCORD_API = "https://discord.com/api/v9";
const GROQ_API    = "https://api.groq.com/openai/v1/chat/completions";

// Track last message ID per channel so we don't reply twice
const lastMessageId = {};

async function getMessages(channelId) {
  const params = lastMessageId[channelId] ? `?after=${lastMessageId[channelId]}&limit=5` : `?limit=1`;
  const res = await fetch(`${DISCORD_API}/channels/${channelId}/messages${params}`, {
    headers: { 'Authorization': DISCORD_TOKEN }
  });
  if (!res.ok) {
    console.error(`Failed to get messages: ${res.status}`);
    return [];
  }
  return await res.json();
}

async function sendMessage(channelId, content) {
  const res = await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
    method: 'POST',
    headers: { 'Authorization': DISCORD_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ content })
  });
  const data = await res.json();
  if (!res.ok) console.error('Send error:', JSON.stringify(data));
  else console.log(`✅ Replied!`);
}

async function askGroq(question) {
  const res = await fetch(GROQ_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_KEY}` },
    body: JSON.stringify({
      model: 'llama3-8b-8192',
      max_tokens: 1000,
      messages: [{ role: 'user', content: question }]
    })
  });
  const data = await res.json();
  return data.choices?.[0]?.message?.content || data.error?.message || 'No response.';
}

async function pollChannel(channelId) {
  try {
    const messages = await getMessages(channelId);
    if (!messages.length) return;

    // Update last message ID
    const newest = messages[0];
    if (!lastMessageId[channelId]) {
      lastMessageId[channelId] = newest.id;
      return; // skip first poll, just set baseline
    }

    // Process messages (newest first, reverse to process oldest first)
    for (const msg of messages.reverse()) {
      if (msg.id <= lastMessageId[channelId]) continue;
      lastMessageId[channelId] = msg.id;

      if (msg.author?.id !== YOUR_USER_ID) continue;
      if (!msg.content?.startsWith(TRIGGER)) continue;

      console.log(`Trigger: ${msg.content}`);
      const question = msg.content.slice(TRIGGER.length).trim();
      if (!question) { await sendMessage(channelId, 'What do you need?'); continue; }

      const reply = await askGroq(question);
      console.log(`Reply: ${reply.substring(0, 80)}`);

      if (reply.length <= 2000) {
        await sendMessage(channelId, reply);
      } else {
        const chunks = reply.match(/.{1,2000}/gs);
        for (const chunk of chunks) await sendMessage(channelId, chunk);
      }
    }
  } catch (e) {
    console.error(`Poll error: ${e.message}`);
  }
}

async function start() {
  console.log('Starting AI self-bot (polling mode)...');
  console.log(`Watching ${ALLOWED_CHANNELS.length} channels`);

  // Initialize last message IDs
  for (const ch of ALLOWED_CHANNELS) {
    const msgs = await getMessages(ch);
    if (msgs.length) lastMessageId[ch] = msgs[0].id;
    console.log(`Channel ${ch} initialized`);
  }

  console.log('Ready! Type !ask in your channels.');

  setInterval(async () => {
    for (const ch of ALLOWED_CHANNELS) {
      await pollChannel(ch);
    }
  }, POLL_INTERVAL);
}

start();
