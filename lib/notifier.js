// lib/notifier.js
import fetch from 'node-fetch';
import { config } from '../config/index.js';

export const notify = async (msg) => {
  if (!config.telegramToken || !config.telegramChatId) return;

  try {
    await fetch(`https://api.telegram.org/bot${config.telegramToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: config.telegramChatId,
        text: msg,
        parse_mode: 'Markdown'
      }),
    });
  } catch (err) {
    console.error('Telegram notify error:', err.message);
  }
};
