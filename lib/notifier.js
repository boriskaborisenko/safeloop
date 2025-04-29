// lib/notifier.js
//import fetch from 'node-fetch';
//import { config } from '../config/index.js';

import axios from 'axios';

const TELEGRAM_TOKEN = process.env.TG_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TG_CHAT_ID;

if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) {
  console.error('⚠️ Telegram config missing in environment variables!');
}

export const notify = async (payload) => {
  try {
    let message = '';

    if (payload.action === 'ERROR') {
      message = [
        `🚨 *SafeLoop ERROR!*`,
        `*Error:* ${payload.error}`,
        `*Time:* ${payload.time}`
      ].join('\n');
    } else {
      message = [
        `🧠 *SafeLoop Report*`,
        `*Action:* ${payload.action}`,
        `*Price:* $${payload.price.toFixed(2)}`,
        `*USDT:* ${payload.usdtBalance.toFixed(2)}`,
        `*BTC:* ${payload.btcBalance.toFixed(6)}`,
        `*Delta:* ${payload.deltaPercent}%`,
        `*Details:* ${payload.details}`,
        `*Time:* ${payload.time}`
      ].join('\n');
    }

    await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      chat_id: TELEGRAM_CHAT_ID,
      text: message,
      parse_mode: 'Markdown'
    });
  } catch (err) {
    console.error('⚠️ Failed to send Telegram notification:', err.message);
  }
};


/* export const notify = async (msg) => {
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
}; */
