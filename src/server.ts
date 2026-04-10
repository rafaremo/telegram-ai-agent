import { AIChatAgent } from '@cloudflare/ai-chat';
import { createOpenAI } from '@ai-sdk/openai';
import { streamText, convertToModelMessages, pruneMessages, generateText } from 'ai';
import { z } from 'zod';

// Telegram types
export interface TelegramUpdate {
	update_id: number;
	message?: TelegramMessage;
	edited_message?: TelegramMessage;
	callback_query?: TelegramCallbackQuery;
}

export interface TelegramMessage {
	message_id: number;
	from?: TelegramUser;
	date: number;
	chat: TelegramChat;
	text?: string;
	photo?: TelegramPhotoSize[];
	document?: TelegramDocument;
}

export interface TelegramUser {
	id: number;
	is_bot: boolean;
	first_name: string;
	last_name?: string;
	username?: string;
	language_code?: string;
}

export interface TelegramChat {
	id: number;
	type: string;
	title?: string;
	username?: string;
	first_name?: string;
	last_name?: string;
}

export interface TelegramPhotoSize {
	file_id: string;
	file_unique_id: string;
	width: number;
	height: number;
	file_size?: number;
}

export interface TelegramDocument {
	file_id: string;
	file_unique_id: string;
	file_name?: string;
	mime_type?: string;
	file_size?: number;
}

export interface TelegramCallbackQuery {
	id: string;
	from: TelegramUser;
	message?: TelegramMessage;
	inline_message_id?: string;
	chat_instance?: string;
	data?: string;
}

export class ChatAgent extends AIChatAgent<Env> {
	// Store the last response for Telegram
	private lastResponse: string = '';

	async onChatMessage() {
		const openai = createOpenAI({ apiKey: this.env.OPENAI_API_KEY });
		const model = openai('gpt-5.4-mini');

		const result = streamText({
			model,
			system:
				'You are a helpful and friendly AI assistant running on Telegram. You can help users with:\n' +
				'- Answering questions and providing information\n' +
				'- Checking the weather for any city\n' +
				'- Performing calculations\n' +
				'- Getting the current date and time\n\n' +
				'Keep your responses concise and friendly, suitable for a chat interface.',
			messages: pruneMessages({
				messages: await convertToModelMessages(this.messages),
				toolCalls: 'before-last-2-messages',
			}),
			tools: {
				// Server-side tool: get weather
				getWeather: {
					description: 'Get the current weather for a city',
					inputSchema: z.object({
						city: z.string().describe('City name'),
					}),
					execute: async ({ city }: { city: string }) => {
						const conditions = ['sunny', 'cloudy', 'rainy', 'partly cloudy', 'clear'];
						const temp = Math.floor(Math.random() * 35) + 5;
						return {
							city,
							temperature: temp,
							condition: conditions[Math.floor(Math.random() * conditions.length)],
							unit: 'celsius',
						};
					},
				},

				// Server-side tool: get current time
				getCurrentTime: {
					description: 'Get the current date and time',
					inputSchema: z.object({}),
					execute: async () => {
						const now = new Date();
						return {
							date: now.toLocaleDateString(),
							time: now.toLocaleTimeString(),
							timestamp: now.toISOString(),
						};
					},
				},

				// Approval tool: requires user confirmation for large calculations
				calculate: {
					description: 'Perform a math calculation with two numbers. ' + 'Requires user approval for large numbers.',
					inputSchema: z.object({
						a: z.number().describe('First number'),
						b: z.number().describe('Second number'),
						operator: z.enum(['+', '-', '*', '/', '%', '^']).describe('Arithmetic operator'),
					}),
					experimental_needsApproval: async ({ a, b }: { a: number; b: number }) => Math.abs(a) > 1000 || Math.abs(b) > 1000,
					execute: async ({ a, b, operator }: { a: number; b: number; operator: string }) => {
						const ops: Record<string, (x: number, y: number) => number> = {
							'+': (x, y) => x + y,
							'-': (x, y) => x - y,
							'*': (x, y) => x * y,
							'/': (x, y) => x / y,
							'%': (x, y) => x % y,
							'^': (x, y) => Math.pow(x, y),
						};
						if (operator === '/' && b === 0) {
							return { error: 'Division by zero is not allowed' };
						}
						return {
							expression: `${a} ${operator} ${b}`,
							result: ops[operator](a, b),
						};
					},
				},
			},
		});

		// For Telegram, we need to capture the full response text
		// We'll collect the stream into a string
		const reader = result.toUIMessageStreamResponse().body?.getReader();
		if (reader) {
			const decoder = new TextDecoder();
			let fullText = '';

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				fullText += decoder.decode(value, { stream: true });
			}

			this.lastResponse = fullText;
		}

		return result.toUIMessageStreamResponse();
	}

	// Method to get the last response (for Telegram integration)
	getLastResponse(): string {
		return this.lastResponse;
	}

	// Method to process a message and return the response (non-streaming, for Telegram)
	async processMessage(message: string): Promise<string> {
		const openai = createOpenAI({ apiKey: this.env.OPENAI_API_KEY });
		const model = openai('gpt-4o-mini');

		const result = await generateText({
			model,
			system:
				'You are a helpful and friendly AI assistant running on Telegram. You can help users with:\n' +
				'- Answering questions and providing information\n' +
				'- Checking the weather for any city\n' +
				'- Performing calculations\n' +
				'- Getting the current date and time\n\n' +
				'Keep your responses concise (under 4000 characters) and friendly, suitable for a chat interface.',
			messages: pruneMessages({
				messages: await convertToModelMessages(this.messages),
				toolCalls: 'before-last-2-messages',
			}),
			tools: {
				getWeather: {
					description: 'Get the current weather for a city',
					inputSchema: z.object({
						city: z.string().describe('City name'),
					}),
					execute: async ({ city }: { city: string }) => {
						const conditions = ['sunny ☀️', 'cloudy ☁️', 'rainy 🌧️', 'partly cloudy ⛅', 'clear ✨'];
						const temp = Math.floor(Math.random() * 35) + 5;
						return {
							city,
							temperature: temp,
							condition: conditions[Math.floor(Math.random() * conditions.length)],
							unit: 'celsius',
						};
					},
				},

				getCurrentTime: {
					description: 'Get the current date and time',
					inputSchema: z.object({}),
					execute: async () => {
						const now = new Date();
						return {
							date: now.toLocaleDateString(),
							time: now.toLocaleTimeString(),
							timestamp: now.toISOString(),
						};
					},
				},

				calculate: {
					description: 'Perform a math calculation',
					inputSchema: z.object({
						a: z.number().describe('First number'),
						b: z.number().describe('Second number'),
						operator: z.enum(['+', '-', '*', '/', '%', '^']).describe('Arithmetic operator'),
					}),
					execute: async ({ a, b, operator }: { a: number; b: number; operator: string }) => {
						const ops: Record<string, (x: number, y: number) => number> = {
							'+': (x, y) => x + y,
							'-': (x, y) => x - y,
							'*': (x, y) => x * y,
							'/': (x, y) => x / y,
							'%': (x, y) => x % y,
							'^': (x, y) => Math.pow(x, y),
						};
						if (operator === '/' && b === 0) {
							return { error: 'Division by zero is not allowed' };
						}
						return {
							expression: `${a} ${operator} ${b}`,
							result: ops[operator](a, b),
						};
					},
				},
			},
		});

		return result.text;
	}
}

// Telegram API helper functions
export async function sendTelegramMessage(
	botToken: string,
	chatId: number,
	text: string,
	options?: { reply_to_message_id?: number; parse_mode?: string },
): Promise<Response> {
	// Telegram has a 4096 character limit for messages
	const truncatedText = text.length > 4000 ? text.substring(0, 4000) + '...' : text;

	const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
	const body = {
		chat_id: chatId,
		text: truncatedText,
		parse_mode: options?.parse_mode || 'HTML',
		...(options?.reply_to_message_id && { reply_to_message_id: options.reply_to_message_id }),
	};

	return fetch(url, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
		},
		body: JSON.stringify(body),
	});
}

export async function setTelegramWebhook(botToken: string, webhookUrl: string, secretToken?: string): Promise<boolean> {
	const url = `https://api.telegram.org/bot${botToken}/setWebhook`;
	const body: Record<string, string> = {
		url: webhookUrl,
		allowed_updates: JSON.stringify(['message', 'edited_message', 'callback_query']),
	};

	if (secretToken) {
		body.secret_token = secretToken;
	}

	const response = await fetch(url, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
		},
		body: JSON.stringify(body),
	});

	const data = (await response.json()) as { ok: boolean };
	return data.ok === true;
}

export async function deleteTelegramWebhook(botToken: string): Promise<boolean> {
	const url = `https://api.telegram.org/bot${botToken}/deleteWebhook`;
	const response = await fetch(url, {
		method: 'POST',
	});

	const data = (await response.json()) as { ok: boolean };
	return data.ok === true;
}

export async function getTelegramWebhookInfo(botToken: string): Promise<unknown> {
	const url = `https://api.telegram.org/bot${botToken}/getWebhookInfo`;
	const response = await fetch(url);
	return response.json();
}

export async function getTelegramMe(botToken: string): Promise<unknown> {
	const url = `https://api.telegram.org/bot${botToken}/getMe`;
	const response = await fetch(url);
	return response.json();
}
