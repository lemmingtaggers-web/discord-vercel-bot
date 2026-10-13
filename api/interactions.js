import nacl from "tweetnacl";

export const config = {
  api: {
    bodyParser: false
  }
};

const FLAGS = {
  EPHEMERAL: 64,
  ADMINISTRATOR: 8n
};

async function readRawBody(req) {
  const chunks = [];

  for await (const chunk of req) {
    chunks.push(
      Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    );
  }

  return Buffer.concat(chunks).toString("utf8");
}

function respond(res, body, status = 200) {
  return res.status(status).json(body);
}

function reply(content, ephemeral = false) {
  return {
    type: 4,
    data: {
      content,
      allowed_mentions: { parse: [] },
      ...(ephemeral ? { flags: FLAGS.EPHEMERAL } : {})
    }
  };
}

function embedReply(embed) {
  return {
    type: 4,
    data: {
      embeds: [embed],
      allowed_mentions: { parse: [] }
    }
  };
}

function getOption(interaction, name) {
  return interaction.data?.options?.find(
    option => option.name === name
  )?.value;
}

function parseColor(value) {
  if (!value) return 0x5865F2;

  const normalized = value.replace(/^#/, "");

  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return null;
  }

  return Number.parseInt(normalized, 16);
}

function isAdministrator(interaction) {
  const permissions = interaction.member?.permissions;

  if (!permissions) return false;

  try {
    return (
      (BigInt(permissions) & FLAGS.ADMINISTRATOR) !== 0n
    );
  } catch {
    return false;
  }
}

async function sendChannelEmbed(channelId, embed) {
  const token = process.env.DISCORD_BOT_TOKEN;

  if (!token) {
    throw new Error("Missing DISCORD_BOT_TOKEN");
  }

  const response = await fetch(
    `https://discord.com/api/v10/channels/${channelId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bot ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        embeds: [embed],
        allowed_mentions: { parse: [] }
      })
    }
  );

  if (!response.ok) {
    const details = await response.text();
    console.error("Discord API:", response.status, details);
    throw new Error("Discord rejected the channel message");
  }

  return response.json();
}

async function handleCommand(interaction) {
  const command = interaction.data?.name;

  if (command === "ping") {
    return reply("The bot is responding.");
  }

  if (command === "say") {
    const message = getOption(interaction, "message");

    if (typeof message !== "string" || !message.trim()) {
      return reply("Please provide a message.", true);
    }

    return reply(message.slice(0, 2000));
  }

  if (command === "embed") {
    const title = getOption(interaction, "title");
    const description = getOption(interaction, "description");
    const colorInput = getOption(interaction, "color");
    const fieldName = getOption(interaction, "field_name");
    const fieldValue = getOption(interaction, "field_value");

    const color = parseColor(colorInput);

    if (color === null) {
      return reply(
        "Invalid color. Use a hex color like #5865F2.",
        true
      );
    }

    if (Boolean(fieldName) !== Boolean(fieldValue)) {
      return reply(
        "Provide both field_name and field_value, or neither.",
        true
      );
    }

    const embed = {
      title: title.slice(0, 256),
      description: description.slice(0, 4000),
      color
    };

    if (fieldName && fieldValue) {
      embed.fields = [{
        name: fieldName.slice(0, 256),
        value: fieldValue.slice(0, 1024),
        inline: false
      }];
    }

    return embedReply(embed);
  }

  if (command === "announce") {
    if (!isAdministrator(interaction)) {
      return reply(
        "Only server administrators can use this command.",
        true
      );
    }

    const channelId = getOption(interaction, "channel");
    const title = getOption(interaction, "title");
    const description = getOption(interaction, "description");
    const color = parseColor(getOption(interaction, "color"));

    if (color === null) {
      return reply("Invalid hex color.", true);
    }

    try {
      await sendChannelEmbed(channelId, {
        title: title.slice(0, 256),
        description: description.slice(0, 4000),
        color
      });

      return reply(
        `Announcement sent to <#${channelId}>.`,
        true
      );
    } catch (error) {
      console.error("Announcement failed:", error);

      return reply(
        "Couldn't send the announcement. Check the bot's channel permissions and Vercel logs.",
        true
      );
    }
  }

  return reply("Unknown command.", true);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return respond(res, { error: "Method not allowed" }, 405);
  }

  const publicKey = process.env.DISCORD_PUBLIC_KEY;

  if (!publicKey || !/^[0-9a-fA-F]{64}$/.test(publicKey)) {
    return respond(res, { error: "Server public key not configured" }, 500);
  }

  const signature = req.headers["x-signature-ed25519"];
  const timestamp = req.headers["x-signature-timestamp"];

  if (
    typeof signature !== "string" ||
    !/^[0-9a-fA-F]{128}$/.test(signature) ||
    typeof timestamp !== "string" ||
    !/^\d{1,20}$/.test(timestamp)
  ) {
    return respond(res, { error: "Invalid signature headers" }, 401);
  }

  const timestampNumber = Number(timestamp);

  if (
    !Number.isSafeInteger(timestampNumber) ||
    Math.abs(Date.now() / 1000 - timestampNumber) > 300
  ) {
    return respond(res, { error: "Expired request" }, 401);
  }

  let rawBody;
  let interaction;

  try {
    rawBody = await readRawBody(req);

    const valid = nacl.sign.detached.verify(
      Buffer.from(timestamp + rawBody, "utf8"),
      Buffer.from(signature, "hex"),
      Buffer.from(publicKey, "hex")
    );

    if (!valid) {
      return respond(res, { error: "Invalid signature" }, 401);
    }

    interaction = JSON.parse(rawBody);
  } catch (error) {
    console.error("Request parsing failed:", error);
    return respond(res, { error: "Invalid request body" }, 400);
  }

  // Discord sends PING when verifying the endpoint.
  if (interaction.type === 1) {
    return respond(res, { type: 1 });
  }

  if (interaction.type !== 2) {
    return respond(res, { error: "Unsupported interaction" }, 400);
  }

  try {
    const result = await handleCommand(interaction);
    return respond(res, result);
  } catch (error) {
    console.error("Command failed:", error);

    return respond(res, reply("An internal error occurred.", true));
  }
}
