import dotenv from 'dotenv';
dotenv.config();

import { ethers } from 'ethers';
import knex from './supabase.js';
import { config } from './config/index.js';
import logger from './lib/logger.js';
import { notify } from './lib/notifier.js';
import { getPoolPrice } from './lib/price.js';
import { updateBalances } from './lib/balances.js';
import { keepGasPumping } from './lib/gas.js';
import { executeSwap } from './lib/swap.js';
import * as db from './db.js';

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

const RUNTIME_ID = process.env.RUNTIME_ID || 'main';

// === Инициализация состояния ===
let systemState = await db.loadSystemState(RUNTIME_ID);

if (!systemState) {
  const price = await getPoolPrice(provider);
  const balances = await updateBalances(wallet);
  await db.createSystemState(RUNTIME_ID, price, balances);
  systemState = await db.loadSystemState(RUNTIME_ID);
}

// === Функция расчёта профита ===
const calculateProfit = (startBTC, startUSDT, currentBTC, currentUSDT, basePrice, netManualFlow) => {
  const startValue = (startBTC * basePrice) + startUSDT + netManualFlow;
  const currentValue = (currentBTC * basePrice) + currentUSDT;
  return currentValue - startValue;
};

// === Основной цикл ===
const safeLoop = async () => {
  logger.info('🕒 New SafeLoop Iteration');

  try {
    await keepGasPumping(wallet, provider);

    const balances = await updateBalances(wallet);
    const price = await getPoolPrice(provider);

    const manual = await db.loadManualCorrections(RUNTIME_ID);

    let prices = JSON.parse(systemState.prices || '[]');
    prices.push(price);
    if (prices.length > 40) prices.shift();

    const delta = (price - parseFloat(systemState.current_base_point)) / parseFloat(systemState.current_base_point);

    let action = 'HOLD';
    let details = '';

    if (delta <= -config.threshold) {
      // ПОКУПКА BTC
      const stepAmountUSD = balances.usdt * config.swapPortion;
      if (balances.usdt >= config.minSwapUSD && stepAmountUSD >= config.minSwapUSD) {
        const success = await executeSwap(wallet, 'BUY', stepAmountUSD, price);
        if (success) {
          await db.insertAssetBuy(RUNTIME_ID, success.amountBTC, price, success.amountUSD);
          action = 'BUY';
          details = `Bought ${success.amountBTC.toFixed(6)} BTC for ${success.amountUSD.toFixed(2)} USDT`;
        } else {
          details = 'BUY failed';
        }
      } else {
        details = 'Not enough USDT for buy';
      }

    } else if (delta >= config.threshold) {
      // ПРОДАЖА BTC
      const activeBuys = await db.loadActiveBuys(RUNTIME_ID);
      const profitable = activeBuys.filter(buy => {
        const profitDelta = (price - parseFloat(buy.price_usd)) / parseFloat(buy.price_usd);
        return profitDelta >= config.threshold;
      });

      const totalBTC = profitable.reduce((sum, buy) => sum + parseFloat(buy.amount_btc), 0);

      if (totalBTC > 0) {
        const success = await executeSwap(wallet, 'SELL', totalBTC, price);
        if (success) {
          const idsToClose = profitable.map(buy => buy.id);
          await db.closeAssets(idsToClose);
          await db.insertAssetSell(RUNTIME_ID, totalBTC, price, success.amountUSD);

          const remainingBuys = await db.loadActiveBuys(RUNTIME_ID);
          if (remainingBuys.length > 0) {
            const weightedSum = remainingBuys.reduce((sum, buy) => sum + parseFloat(buy.amount_btc) * parseFloat(buy.price_usd), 0);
            const totalAmount = remainingBuys.reduce((sum, buy) => sum + parseFloat(buy.amount_btc), 0);
            systemState.current_base_point = weightedSum / totalAmount;
          } else {
            systemState.current_base_point = price;
          }

          action = 'SELL';
          details = `Sold ${totalBTC.toFixed(6)} BTC for ${success.amountUSD.toFixed(2)} USDT`;
        } else {
          details = 'SELL failed';
        }
      } else {
        details = 'No profitable BTC to sell';
      }
    } else {
      // НИ ПОКУПКА, НИ ПРОДАЖА
      details = 'Delta within threshold, holding';
    }

    const totalProfit = calculateProfit(
      parseFloat(systemState.btc_balance_start),
      parseFloat(systemState.usdt_balance_start),
      balances.btc,
      balances.usdt,
      parseFloat(systemState.current_base_point),
      manual.netManualFlow
    );

    await db.updateSystemState(RUNTIME_ID, {
      prices: JSON.stringify(prices),
      usdt_balance_now: balances.usdt,
      btc_balance_now: balances.btc,
      current_base_point: systemState.current_base_point,
      total_profit: totalProfit
    });

    await notify({
      action,
      price: price,
      usdtBalance: balances.usdt,
      btcBalance: balances.btc,
      deltaPercent: (delta * 100).toFixed(2),
      details,
      time: new Date().toISOString()
    });

  } catch (error) {
    logger.error('SafeLoop ERROR:', error.message);
    await notify({
      action: 'ERROR',
      error: error.message,
      time: new Date().toISOString()
    });
  }
};

logger.info('🚀 SafeLoop ΔUBP started...');
await safeLoop();
setInterval(safeLoop, config.checkInterval);
