"use strict";

function createDiscordReporter(config, env) {
  if (!config?.enabled) return null;
  const token = env[config.token_env || "DISCORD_BOT_TOKEN"];
  const channelId = env[config.channel_env || "KESTREL_DISCORD_CHANNEL_ID"];
  if (!token || !channelId) return null;

  let threadId = null;

  async function api(method, endpoint, body) {
    const response = await fetch(`https://discord.com/api/v10${endpoint}`, {
      method,
      headers: {
        Authorization: `Bot ${token}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Discord ${response.status}: ${text.slice(0, 300)}`);
    }
    return response.status === 204 ? null : response.json();
  }

  async function send(content) {
    const target = threadId || channelId;
    return api("POST", `/channels/${target}/messages`, { content });
  }

  return {
    name: "discord",
    async started(payload) {
      const message = await send(payload.content);
      if (config.create_threads && message?.id && payload.threadName) {
        const thread = await api("POST", `/channels/${channelId}/messages/${message.id}/threads`, {
          name: payload.threadName.slice(0, 100),
          auto_archive_duration: 1440,
        });
        threadId = thread?.id || null;
      }
    },
    async finished(payload) {
      await send(payload.content);
    },
    async alert(payload) {
      await send(payload.content);
    },
  };
}

module.exports = { createDiscordReporter };
