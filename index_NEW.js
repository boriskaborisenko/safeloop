// index_NEW.js (чистый файл под новую архитектуру SafeLoop)

import { ethers } from 'ethers';
import { config } from './config/index.js';
import { notify } from './lib/notifier.js';
import { getWalletBalances } from './lib/balances.js';
import { getCurrentBTCPrice } from './lib/price.js';
import { getMACD } from './lib/macd.js';
import {
  loadSystemState,
  createSystemState,
  updateSystemState,
  loadActiveBuys,
  insertAssetBuy,
  insertAssetSell,
  closeAssets,
  loadManualCorrections
} from './db.js';
import { keepGasPumping } from './lib/gas.js';

// === Параметры ===
const RUNTIME_ID = process.env.RUNTIME_ID || 'main';
let systemState = await loadSystemState(RUNTIME_ID);

// === Инициализация ===
if (!systemState) {
  const currentPrice = await getCurrentBTCPrice();
  const balances = await getWalletBalances();
  await createSystemState(RUNTIME_ID, currentPrice, balances);
  systemState = await loadSystemState(RUNTIME_ID);
}

// === Основной цикл ===
const safeLoop = async () => {
  console.log('🕒 Starting SafeLoop Iteration');

  try {
    await keepGasPumping();

    const balances = await getWalletBalances();
    const currentPrice = await getCurrentBTCPrice();
    const manual = await loadManualCorrections(RUNTIME_ID);

    const correctedUSDT = balances.usdt + manual.netManualFlow;

    let prices = JSON.parse(systemState.prices || '[]');
    prices.push(currentPrice);
    if (prices.length > 40) prices.shift();

    const macdResult = prices.length >= 26 ? await getMACD(prices) : null;

    const basePoint = parseFloat(systemState.current_base_point);
    const delta = (currentPrice - basePoint) / basePoint;

    let action = 'HOLD';
    let details = '';

    if (delta <= -config.threshold) {
      const stepAmountUSD = correctedUSDT * config.swapPortion;
      if (correctedUSDT >= config.minSwapUSD && stepAmountUSD >= config.minSwapUSD) {
        const buyAmountBTC = stepAmountUSD / currentPrice;
        await insertAssetBuy(RUNTIME_ID, buyAmountBTC, currentPrice, stepAmountUSD);
        action = 'BUY';
        details = `Bought ${buyAmountBTC.toFixed(6)} BTC for ${stepAmountUSD.toFixed(2)} USDT`;
      } else {
        details = 'Not enough USDT to buy';
      }

    } else if (delta >= config.threshold) {
      const activeBuys = await loadActiveBuys(RUNTIME_ID);
      const profitable = activeBuys.filter(buy => {
        const profitDelta = (currentPrice - parseFloat(buy.price_usd)) / parseFloat(buy.price_usd);
        return profitDelta >= config.threshold;
      });

      const totalBTC = profitable.reduce((sum, buy) => sum + parseFloat(buy.amount_btc), 0);
      const totalUSD = totalBTC * currentPrice;

      if (totalBTC > 0 && totalUSD >= config.minSwapUSD) {
        await insertAssetSell(RUNTIME_ID, totalBTC, currentPrice, totalUSD);
        const idsToClose = profitable.map(buy => buy.id);
        await closeAssets(idsToClose);
        action = 'SELL';
        details = `Sold ${totalBTC.toFixed(6)} BTC for ${totalUSD.toFixed(2)} USDT`;

        const remainingBuys = await loadActiveBuys(RUNTIME_ID);
        if (remainingBuys.length > 0) {
          const totalWeighted = remainingBuys.reduce((sum, buy) => sum + parseFloat(buy.amount_btc) * parseFloat(buy.price_usd), 0);
          const totalBtc = remainingBuys.reduce((sum, buy) => sum + parseFloat(buy.amount_btc), 0);
          systemState.current_base_point = (totalWeighted / totalBtc);
        } else {
          systemState.current_base_point = currentPrice;
        }
      } else {
        details = 'No profitable BTC to sell';
      }

    } else {
      details = 'Delta within threshold, holding';
    }

    const newPortfolioValue = (balances.btc * currentPrice) + balances.usdt;
    const startPortfolioValue = (parseFloat(systemState.btc_balance_start) * basePoint) + parseFloat(systemState.usdt_balance_start) + manual.netManualFlow;
    const totalProfit = newPortfolioValue - startPortfolioValue;

    await updateSystemState(RUNTIME_ID, {
      prices: JSON.stringify(prices),
      usdt_balance_now: balances.usdt,
      btc_balance_now: balances.btc,
      current_base_point: systemState.current_base_point,
      total_profit: totalProfit
    });

    await notify({
      action,
      price: currentPrice,
      usdtBalance: balances.usdt,
      btcBalance: balances.btc,
      deltaPercent: (delta * 100).toFixed(2),
      details,
      time: new Date().toISOString()
    });

  } catch (error) {
    console.error('SafeLoop Error:', error.message);
    await notify({
      action: 'ERROR',
      error: error.message,
      time: new Date().toISOString()
    });
  }
};

console.log('🚀 SafeLoop ΔUBP Engine started...');
await safeLoop();
setInterval(safeLoop, config.checkInterval);
