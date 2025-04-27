import { getAddress } from 'ethers';
import dotenv from 'dotenv';
dotenv.config();

//console.log(getAddress('0x6E6D8D35824FD4A8E4Ff72D6B0317e431BecAB75'),'==> return by getAdress');

export const config = {
  // === Стратегия ===

/*   checkInterval: 60 * 60 * 1000, // 1st — every minutes
  minSwapUSD: 20,    // 💰 Не свапаем, если меньше чем $20
  maxSwapUSD: 300,   // 🧯 Не свапаем больше чем $300
  threshold: 0.01,                  // Порог изменения цены
  swapPortion: 0.1,                 // Доля портфеля для свапа
  gasLimitUSD: 0.06,                // Лимит стоимости газа в $
  slippage: 0.005,                  // Проскальзывание
  drawdownLimit: 0.15,              // Лимит просадки портфеля */

  checkInterval: parseInt(process.env.CHECK_INTERVAL || '60') * 60 * 1000, // 1 час по умолчанию
  minSwapUSD: parseFloat(process.env.MIN_SWAP_USD || '20'),
  maxSwapUSD: parseFloat(process.env.MAX_SWAP_USD || '300'),
  threshold: parseFloat(process.env.THRESHOLD || '0.01'),
  swapPortion: parseFloat(process.env.SWAP_PORTION || '0.1'),
  gasLimitUSD: parseFloat(process.env.GAS_LIMIT_USD || '0.06'),
  slippage: parseFloat(process.env.SLIPPAGE || '0.005'),
  drawdownLimit: parseFloat(process.env.DRAWDOWN_LIMIT || '0.15'),

  
  // === Адреса токенов и контрактов ===
  btc: getAddress('0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c'),          // ✅ BTCB
  usdt: getAddress('0x55D398326F99059FF775485246999027B3197955'),        // ✅ USDT
  wbnb: '0xBB4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',         // ✅ WBNB (для auto-refill)

  router: getAddress('0x10ED43C718714eb63d5aA57B78B54704E256024E'),       // ✅ PancakeSwap V2 Router02

  // ВАЖНО: Оставляем как строку, чтобы избежать проблем с checksum
  v2pair: '0x3F803EC2b816Ea7F06EC76aA2B6f2532F9892d62',  
  // === Неактивные на V2
  quoter: '',
  oracle: '',


  // === Децималы токенов ===
  btcDecimals: 18,
  usdtDecimals: 18,

  // === Telegram уведомления ===
  telegramToken: '7626828622:AAFRaC4shAXqFUHJqrgj9CmALanWTYe_ELE',
  telegramChatId: '-4655305415',
};
