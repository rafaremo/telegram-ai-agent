# Telegram Chat Agent

A Cloudflare Workers-based AI chat agent that integrates with Telegram using webhooks. Built with the Cloudflare Agents SDK and OpenAI (via Vercel AI SDK).

## Features

- 🤖 AI-powered conversations using OpenAI GPT-4o Mini
- 💬 Telegram bot integration with webhook support
- 🛠️ Built-in tools:
  - Weather information
  - Current date/time
  - Math calculations
- 💾 Persistent chat history per user (using Durable Objects + SQLite)
- ⚡ Real-time responses

## Architecture

- **Cloudflare Workers**: Edge computing platform
- **Durable Objects**: Stateful chat sessions per Telegram chat
- **OpenAI**: LLM inference (GPT-4o Mini via Vercel AI SDK)
- **SQLite Storage**: Message persistence
- **Telegram Bot API**: Webhook-based message handling

## Setup Instructions

### 1. Prerequisites

- Cloudflare account (free tier works)
- OpenAI API key - [Get one here](https://platform.openai.com/api-keys)
- Telegram bot token - Get from [@BotFather](https://t.me/botfather)
- Node.js 18+

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

#### For Local Development

1. Copy the example file:
   ```bash
   cp .dev.vars.example .dev.vars
   ```

2. Edit `.dev.vars` and add your actual API keys:
   ```bash
   TELEGRAM_BOT_TOKEN=your-telegram-bot-token-here
   OPENAI_API_KEY=sk-your-openai-api-key-here
   ```

3. The `.dev.vars` file is automatically loaded by `wrangler dev` and is **NOT** committed to git (it's in `.gitignore`).

#### For Production (Cloudflare Secrets)

For production deployment, you must use Cloudflare Secrets to securely store your API keys:

```bash
# Set Telegram Bot Token as a secret
npx wrangler secret put TELEGRAM_BOT_TOKEN
# Enter your Telegram bot token when prompted

# Set OpenAI API Key as a secret
npx wrangler secret put OPENAI_API_KEY
# Enter your OpenAI API key when prompted
```

These secrets are:
- ✅ Encrypted and stored securely by Cloudflare
- ✅ Available to your worker at runtime via `env.TELEGRAM_BOT_TOKEN` and `env.OPENAI_API_KEY`
- ✅ Never exposed in code or logs
- ✅ Different per environment (production vs staging)

**To view your secrets:**
```bash
npx wrangler secret list
```

**To delete a secret:**
```bash
npx wrangler secret delete TELEGRAM_BOT_TOKEN
npx wrangler secret delete OPENAI_API_KEY
```

### 4. Deploy the Worker

```bash
npx wrangler deploy
```

This will deploy your worker to Cloudflare's edge network.

**Note**: If you haven't set the secrets yet, the deployment will succeed but the worker will fail at runtime. Make sure to set secrets before deploying!

### 5. Set Up Telegram Webhook

After deployment, you need to set up the webhook so Telegram can send updates to your worker.

**Get your worker URL**: After deployment, you'll see a URL like:
```
https://chat-agent.your-account.workers.dev
```

**Set the webhook**:

```bash
curl -X POST https://your-worker-url/telegram/set-webhook \
  -H "Content-Type: application/json" \
  -d '{"url": "https://your-worker-url/telegram/webhook"}'
```

**Verify the webhook**:

```bash
curl https://your-worker-url/telegram/webhook-info
```

### 6. Test the Bot

1. Open Telegram
2. Find your bot (username can be found via `https://your-worker-url/telegram/me`)
3. Start a conversation with `/start`
4. Send messages and get AI responses!

## Development

### Run Locally

```bash
npm run dev
```

The dev server will start on `http://localhost:8787` and will use the values from `.dev.vars`.

### Testing Webhooks Locally

For local webhook testing, you can use a tunneling service like ngrok or Cloudflare Tunnel:

```bash
# Using Cloudflare Tunnel
cloudflared tunnel --url http://localhost:8787

# Then set the webhook to the tunnel URL
curl -X POST http://localhost:8787/telegram/set-webhook \
  -H "Content-Type: application/json" \
  -d '{"url": "https://your-tunnel-url/telegram/webhook"}'
```

### Regenerate Types

After modifying `wrangler.jsonc`:

```bash
npm run cf-typegen
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Health check and endpoint listing |
| `/telegram/webhook` | POST | Receive Telegram updates (set this as webhook URL) |
| `/telegram/set-webhook` | POST | Configure Telegram webhook |
| `/telegram/delete-webhook` | POST | Remove Telegram webhook |
| `/telegram/webhook-info` | GET | Get current webhook status |
| `/telegram/me` | GET | Get bot information |
| `/agents/ChatAgent/...` | WS/HTTP | Agent WebSocket and HTTP endpoints |

## Available Commands

The bot responds to:

- `/start` - Welcome message
- `/help` - Help information
- Any text message - AI-powered response

## Tools Available

The AI agent has access to these tools:

1. **getWeather(city)** - Get weather for any city
2. **getCurrentTime()** - Get current date and time
3. **calculate(a, b, operator)** - Perform calculations

## Project Structure

```
├── src/
│   ├── index.ts          # Main worker entry point
│   └── server.ts         # ChatAgent implementation
├── wrangler.jsonc        # Worker configuration
├── .dev.vars             # Local environment variables (not committed)
├── .dev.vars.example     # Example environment variables
├── package.json          # Dependencies
└── worker-configuration.d.ts  # Generated types
```

## Dependencies

- `@cloudflare/ai-chat` - Cloudflare AI Chat SDK
- `@ai-sdk/openai` - OpenAI provider for Vercel AI SDK
- `ai` - Vercel AI SDK
- `agents` - Cloudflare Agents SDK
- `zod` - Schema validation

## Security Best Practices

1. **Never commit `.dev.vars` to git** - It contains sensitive API keys
2. **Use Cloudflare Secrets for production** - They are encrypted and secure
3. **Rotate keys regularly** - Change your API keys periodically
4. **Use different keys for different environments** - Don't use production keys in development
5. **Monitor usage** - Keep an eye on your OpenAI API usage to avoid unexpected charges

## Troubleshooting

### Webhook Not Receiving Updates

1. Check webhook info: `curl https://your-worker-url/telegram/webhook-info`
2. Verify the URL is HTTPS (required by Telegram)
3. Check worker logs in Cloudflare dashboard

### Bot Not Responding

1. Verify the bot token is correct
2. Check that secrets are set: `npx wrangler secret list`
3. Check Durable Objects are working (check Cloudflare dashboard)
4. Check worker logs for OpenAI API errors

### OpenAI API Errors

If you see errors related to OpenAI:
1. Verify your API key is valid
2. Check your OpenAI account has available credits
3. Check the worker logs for detailed error messages

### Local Development Issues

If `wrangler dev` can't find your environment variables:
1. Make sure `.dev.vars` file exists in the project root
2. Check that the file has the correct format (KEY=value, no quotes needed)
3. Restart the dev server

### Build Errors

1. Regenerate types: `npx wrangler types`
2. Clear node_modules: `rm -rf node_modules && npm install`

## Deployment Checklist

- [ ] Dependencies installed
- [ ] `.dev.vars` file created for local development
- [ ] Cloudflare secrets set for production:
  - [ ] `npx wrangler secret put TELEGRAM_BOT_TOKEN`
  - [ ] `npx wrangler secret put OPENAI_API_KEY`
- [ ] Worker deployed successfully
- [ ] Webhook configured
- [ ] Webhook verified working
- [ ] Bot responds to messages

## Resources

- [Cloudflare Agents Documentation](https://developers.cloudflare.com/agents/)
- [Cloudflare Secrets Documentation](https://developers.cloudflare.com/workers/configuration/secrets/)
- [Wrangler Environment Variables](https://developers.cloudflare.com/workers/wrangler/configuration/#environment-variables)
- [Telegram Bot API](https://core.telegram.org/bots/api)
- [Vercel AI SDK Documentation](https://sdk.vercel.ai/docs)
- [OpenAI API Documentation](https://platform.openai.com/docs)
