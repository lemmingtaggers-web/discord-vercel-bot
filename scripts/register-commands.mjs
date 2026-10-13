const {
  DISCORD_BOT_TOKEN,
  DISCORD_APP_ID,
  DISCORD_GUILD_ID
} = process.env;

if (!DISCORD_BOT_TOKEN || !DISCORD_APP_ID || !DISCORD_GUILD_ID) {
  console.error(
    "Missing DISCORD_BOT_TOKEN, DISCORD_APP_ID, or DISCORD_GUILD_ID."
  );
  process.exit(1);
}

const commands = [
  {
    name: "ping",
    description: "Check if the bot is responding."
  },
  {
    name: "say",
    description: "Send a message in this channel.",
    options: [
      {
        type: 3,
        name: "message",
        description: "The message to send.",
        required: true,
        max_length: 2000
      }
    ]
  },
  {
    name: "embed",
    description: "Create a colored embed.",
    options: [
      {
        type: 3,
        name: "title",
        description: "Embed title.",
        required: true,
        max_length: 256
      },
      {
        type: 3,
        name: "description",
        description: "Embed description.",
        required: true,
        max_length: 4000
      },
      {
        type: 3,
        name: "color",
        description: "Hex color, such as #5865F2.",
        required: false,
        max_length: 7
      },
      {
        type: 3,
        name: "field_name",
        description: "Optional field name.",
        required: false,
        max_length: 256
      },
      {
        type: 3,
        name: "field_value",
        description: "Optional field value.",
        required: false,
        max_length: 1024
      }
    ]
  },
  {
    name: "announce",
    description: "Send an embed announcement to a channel.",
    default_member_permissions: "8",
    options: [
      {
        type: 7,
        name: "channel",
        description: "Channel where the announcement will be posted.",
        required: true,
        channel_types: [0, 5]
      },
      {
        type: 3,
        name: "title",
        description: "Announcement title.",
        required: true,
        max_length: 256
      },
      {
        type: 3,
        name: "description",
        description: "Announcement description.",
        required: true,
        max_length: 4000
      },
      {
        type: 3,
        name: "color",
        description: "Hex color, such as #FF8800.",
        required: false,
        max_length: 7
      }
    ]
  }
];

const endpoint =
  `https://discord.com/api/v10/applications/${DISCORD_APP_ID}` +
  `/guilds/${DISCORD_GUILD_ID}/commands`;

try {
  const response = await fetch(endpoint, {
    method: "PUT",
    headers: {
      Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(commands)
  });

  const result = await response.json();

  if (!response.ok) {
    console.error("Failed to register commands:", result);
    process.exit(1);
  }

  console.log("Successfully registered Discord commands:");

  for (const command of result) {
    console.log(`/${command.name}`);
  }
} catch (error) {
  console.error("Request failed:", error.message);
  process.exit(1);
}
