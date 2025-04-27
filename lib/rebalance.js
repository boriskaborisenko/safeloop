// lib/rebalance.js
import { getMACD } from './macd.js';
import { executeSwap } from './swap.js';
import logger from './logger.js';

export const rebalanceIfNeeded = async ({ price, state, config, wallet }) => {
  const total = state.balances.usdt + state.balances.btc * price;

  if (!state.startValue) state.startValue = total;
  if (!state.basePrice) {
    state.basePrice = price;
    return false;
  }

  const drawdown = (state.startValue - total) / state.startValue;
  if (drawdown >= config.drawdownLimit) {
    //logger.warn(`Drawdown limit hit: ${drawdown.toFixed(4)}`);
    const safeToFixed = (val, digits = 4) => typeof val === 'number' ? val.toFixed(digits) : 'N/A';
    logger.warn(`Drawdown limit hit: ${safeToFixed(drawdown)}`);
    return false;
  }

  const now = Date.now();
  if (now - state.lastSwap < config.checkInterval) return false;

  const delta = (price - state.basePrice) / state.basePrice;
  const usdtRatio = state.balances.usdt / total;
  if (usdtRatio < 0.05 || 1 - usdtRatio < 0.05) return false;

  let swapTrigger = config.threshold;

  if (state.prices.length >= 26) {
    const { macd, signal } = await getMACD(state.prices);
    if ((macd > signal && delta > 0) || (macd < signal && delta < 0)) {
      swapTrigger = 0.015;
    }
  }

  if (Math.abs(delta) < swapTrigger) return false;

  const didSwap = await executeSwap(wallet, delta, state.balances, price);
  if (didSwap) {
    state.basePrice = price;
    state.lastSwap = now;
  }

  return didSwap;
};
