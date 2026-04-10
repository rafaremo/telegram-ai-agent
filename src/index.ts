import { routeAgentRequest } from "agents";
import {
	ChatAgent,
	TelegramUpdate,
	sendTelegramMessage,
	setTelegramWebhook,
	deleteTelegramWebhook,
	getTelegramWebhookInfo,
	getTelegramMe,
} from "./server";

export { ChatAgent } from "./server";

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);
		const path = url.pathname;

		// Telegram webhook endpoint
		if (path === "/telegram/webhook" && request.method === "POST") {
			return handleTelegramWebhook(request, env, ctx);
		}

		// Webhook management endpoints
		if (path === "/telegram/set-webhook" && request.method === "POST") {
			return handleSetWebhook(request, env);
		}

		if (path === "/telegram/delete-webhook" && request.method === "POST") {
			return handleDeleteWebhook(env);
		}

		if (path === "/telegram/webhook-info" && request.method === "GET") {
			return handleGetWebhookInfo(env);
		}

		if (path === "/telegram/me" && request.method === "GET") {
			return handleGetMe(env);
		}

		// Try routing to agent (for other agent endpoints like /agents/ChatAgent/...)
		const agentResponse = await routeAgentRequest(request, env);
		if (agentResponse) {
			return agentResponse;
		}

		// Default response
		return new Response(
			JSON.stringify({
				status: "ok",
				message: "Telegram Chat Agent is running",
				endpoints: {
					webhook: "/telegram/webhook (POST) - Receive Telegram updates",
					setWebhook: "/telegram/set-webhook (POST) - Set webhook URL",
					deleteWebhook: "/telegram/delete-webhook (POST) - Delete webhook",
					webhookInfo: "/telegram/webhook-info (GET) - Get webhook info",
					botInfo: "/telegram/me (GET) - Get bot info",
				},
			}),
			{
				status: 200,
				headers: { "Content-Type": "application/json" },
			}
		);
	},
} satisfies ExportedHandler<Env>;

async function handleTelegramWebhook(
	request: Request,
	env: Env,
	ctx: ExecutionContext
): Promise<Response> {
	try {
		// Parse the Telegram update
		const update: TelegramUpdate = await request.json();

		// Process the update asynchronously
		ctx.waitUntil(processTelegramUpdate(update, env));

		// Return success immediately to Telegram
		return new Response(JSON.stringify({ ok: true }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	} catch (error) {
		console.error("Error processing Telegram webhook:", error);
		return new Response(JSON.stringify({ ok: false, error: "Failed to process update" }), {
			status: 200, // Return 200 to prevent Telegram from retrying
			headers: { "Content-Type": "application/json" },
		});
	}
}

async function processTelegramUpdate(update: TelegramUpdate, env: Env): Promise<void> {
	const botToken = env.TELEGRAM_BOT_TOKEN;

	// Handle text messages
	if (update.message?.text) {
		const chatId = update.message.chat.id;
		const messageText = update.message.text;
		const messageId = update.message.message_id;

		console.log(`Received message from chat ${chatId}: ${messageText}`);

		try {
			// Get or create the agent for this chat
			const agentId = `telegram-chat-${chatId}`;
			const id = env.ChatAgent.idFromName(agentId);
			const agent = env.ChatAgent.get(id);

			// Process the message through the agent
			const response = await agent.processMessage(messageText);

			// Send the response back to Telegram
			await sendTelegramMessage(botToken, chatId, response, {
				reply_to_message_id: messageId,
			});
		} catch (error) {
			console.error("Error processing message:", error);
			const errorMessage = error instanceof Error ? error.message : String(error);
			console.error("Error details:", errorMessage);
			await sendTelegramMessage(
				botToken,
				chatId,
				`Sorry, I encountered an error: ${errorMessage.slice(0, 100)}`,
				{ reply_to_message_id: messageId }
			);
		}
	}

	// Handle other message types (photos, documents, etc.)
	if (update.message?.photo || update.message?.document) {
		const chatId = update.message.chat.id;
		await sendTelegramMessage(
			env.TELEGRAM_BOT_TOKEN,
			chatId,
			"I can currently only process text messages. Support for media is coming soon!",
			{ reply_to_message_id: update.message.message_id }
		);
	}

	// Handle /start and /help commands
	if (update.message?.text?.startsWith("/")) {
		const chatId = update.message.chat.id;
		const command = update.message.text.split(" ")[0];
		const messageId = update.message.message_id;

		if (command === "/start") {
			await sendTelegramMessage(
				botToken,
				chatId,
				"👋 Hello! I'm your AI assistant. I can help you with:\n\n" +
				"• Answering questions\n" +
				"• Checking the weather (try: \"What's the weather in Paris?\")\n" +
				"• Performing calculations\n" +
				"• Getting the current time\n\n" +
				"Just send me a message and I'll do my best to help!",
				{ reply_to_message_id: messageId }
			);
		} else if (command === "/help") {
			await sendTelegramMessage(
				botToken,
				chatId,
				"🤖 <b>Available Commands:</b>\n\n" +
				"/start - Start the bot\n" +
				"/help - Show this help message\n\n" +
				"<b>What I can do:</b>\n" +
				"• Answer your questions\n" +
				"• Check the weather for any city\n" +
				"• Perform calculations\n" +
				"• Tell you the current date and time\n\n" +
				"Just send me a message to get started!",
				{ reply_to_message_id: messageId }
			);
		}
	}
}

async function handleSetWebhook(request: Request, env: Env): Promise<Response> {
	try {
		const body = await request.json<{ url?: string; secret_token?: string }>();
		const webhookUrl = body?.url;
		const secretToken = body?.secret_token;

		if (!webhookUrl) {
			return new Response(
				JSON.stringify({ ok: false, error: "Missing webhook URL" }),
				{
					status: 400,
					headers: { "Content-Type": "application/json" },
				}
			);
		}

		const success = await setTelegramWebhook(
			env.TELEGRAM_BOT_TOKEN,
			webhookUrl,
			secretToken
		);

		return new Response(
			JSON.stringify({
				ok: success,
				message: success ? "Webhook set successfully" : "Failed to set webhook",
			}),
			{
				status: success ? 200 : 500,
				headers: { "Content-Type": "application/json" },
			}
		);
	} catch (error) {
		return new Response(
			JSON.stringify({ ok: false, error: "Invalid request body" }),
			{
				status: 400,
				headers: { "Content-Type": "application/json" },
			}
		);
	}
}

async function handleDeleteWebhook(env: Env): Promise<Response> {
	const success = await deleteTelegramWebhook(env.TELEGRAM_BOT_TOKEN);

	return new Response(
		JSON.stringify({
			ok: success,
			message: success ? "Webhook deleted successfully" : "Failed to delete webhook",
		}),
		{
			status: success ? 200 : 500,
			headers: { "Content-Type": "application/json" },
		}
	);
}

async function handleGetWebhookInfo(env: Env): Promise<Response> {
	const info = await getTelegramWebhookInfo(env.TELEGRAM_BOT_TOKEN);

	return new Response(JSON.stringify(info), {
		status: 200,
		headers: { "Content-Type": "application/json" },
	});
}

async function handleGetMe(env: Env): Promise<Response> {
	const me = await getTelegramMe(env.TELEGRAM_BOT_TOKEN);

	return new Response(JSON.stringify(me), {
		status: 200,
		headers: { "Content-Type": "application/json" },
	});
}
