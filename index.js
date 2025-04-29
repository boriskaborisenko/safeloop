import dotenv from 'dotenv';
dotenv.config();

import { ethers } from 'ethers';
import { config } from './config/index.js';
import logger from './lib/logger.js';
import { notify } from './lib/notifier.js';
import { getPoolPrice } from './lib/price.js';
import { getMACD } from './lib/macd.js';
import { updateBalances } from './lib/balances.js';
import { keepGasPumping } from './lib/gas.js';
import { executeSwap } from './lib/swap.js';
import * as db from './db.js';

const fixedTo = (val, digits = 2) => {
  return (typeof val === 'number' && !isNaN(val)) ? parseFloat(val.toFixed(digits)) : 'NaN';
};

const provider = new ethers.JsonRpcProvider('https://bsc-dataseed.binance.org/');
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

const RUNTIME_ID = 'main';

let initialState = await db.getRuntimeState(RUNTIME_ID);

if (!initialState) {
  await db.ensureRuntimeState(RUNTIME_ID, {
    base_price: null,
    start_value: null,
    last_swap: null,
    prices: JSON.stringify([])
  });
  initialState = await db.getRuntimeState(RUNTIME_ID); // <<< ВОТ ЭТО ОБЯЗАТЕЛЬНО
}

let state = initialState ? {
  basePrice: parseFloat(initialState.base_price),
  startValue: parseFloat(initialState.start_value),
  lastSwap: new Date(initialState.last_swap).getTime(),
  balances: { usdt: 0, btc: 0 },
  prices: (typeof initialState.prices === 'string' && initialState.prices.startsWith('['))
    ? JSON.parse(initialState.prices)
    : []
} : {
  basePrice: null,
  startValue: null,
  lastSwap: 0,
  balances: { usdt: 0, btc: 0 },
  prices: []
};

if (!state.prices || state.prices.length < 10) {
  const fallback = await knex('loop_state_log')
    .orderBy('id', 'desc')
    .limit(40)
    .select('current_price');

  const restored = fallback.map(r => parseFloat(r.current_price)).reverse();

  if (restored.length > 0) {
    state.prices = restored;
    console.warn(`⚠️ Prices restored from state_log: ${restored.length} values`);
  } else {
    console.warn('⚠️ No fallback prices available in state_log');
  }
}

const getPortfolioValue = (btc, usdt, price) => usdt + btc * price;

const safeLoop = async () => {
  logger.info(`\n=== 🕒 ${new Date().toISOString()} — NEW CYCLE ===`);
  let logChunks = [];

  try {
    await keepGasPumping(wallet, provider);

    const price = await getPoolPrice(provider);
    state.prices.push(price);
    if (state.prices.length > 26) state.prices.shift();

    await updateBalances(wallet, state);
    const { btc, usdt } = state.balances;
    const total = getPortfolioValue(btc, usdt, price);

    const now = Date.now();
    const drawdown = state.startValue ? ((state.startValue - total) / state.startValue) : 0;
    const delta = state.basePrice ? ((price - state.basePrice) / state.basePrice) : 0;
    const deltaPercent = fixedTo((delta * 100), 3);
    const triggerDefault = config.threshold;
    let swapTrigger = triggerDefault;

    let macd = null, signal = null;
    let macdMsg = '';
    if (state.prices.length >= 26) {
      const macdData = await getMACD(state.prices);
      macd = macdData.macd;
      signal = macdData.signal;
      macdMsg = `MACD: ${fixedTo(macd, 6)} | Signal: ${fixedTo(signal, 6)}`;
      if ((macd > signal && delta > 0) || (macd < signal && delta < 0)) {
        swapTrigger = 0.015;
        macdMsg += ` → MACD Boost triggered! New trigger: ${fixedTo((swapTrigger * 100), 2)}%`;
      }
    }

    let rawAmount;
    let selectedAssets = [];

    if (delta > 0) {
      const holdingAssets = await db.getHoldingAssets();
      const profitableAssets = holdingAssets.filter(asset => parseFloat(asset.buy_price) < price);

      let accumulatedBTC = 0;
      for (const asset of profitableAssets) {
        if (accumulatedBTC >= btc * config.swapPortion) break;
        const available = parseFloat(asset.amount_btc);
        accumulatedBTC += available;
        selectedAssets.push({ id: asset.id, amount: available });
      }

      rawAmount = Math.min(accumulatedBTC, btc * config.swapPortion);

      if (rawAmount === 0) {
        logger.info('❌ No profitable BTCB to sell at current price.');
      }
    } else {
      rawAmount = usdt * config.swapPortion;
    }

    const amountUSD = delta > 0 ? rawAmount * price : rawAmount;

    const report = [
      `📡 Market Check`,
      `Price: $${fixedTo(price, 2)}`,
      `BTCB: ${fixedTo(btc, 6)} | USDT: ${fixedTo(usdt, 2)}`,
      `Portfolio: $${fixedTo(total, 2)}`,
      `📈 Delta: ${deltaPercent}% (Trigger: ${fixedTo((swapTrigger * 100), 2)}%)`,
      `🔁 Direction: ${delta > 0 ? 'SELL BTCB → USDT' : 'BUY BTCB ← USDT'}`,
      `💸 Would swap: ${fixedTo(rawAmount, 6)} (${fixedTo(amountUSD, 2)} USD)`,
      `🧠 Strategy`,
      `Threshold: ${fixedTo((triggerDefault * 100), 2)}% | Drawdown: ${fixedTo((config.drawdownLimit * 100), 2)}%`,
      `Portion: ${fixedTo((config.swapPortion * 100), 0)}% | Limits: $${config.minSwapUSD} – $${config.maxSwapUSD}`,
      macdMsg
    ];

    report.forEach(line => logger.info(line));
    logChunks.push(...report);

    const reasons = [];

    if (!state.startValue) {
      state.startValue = total;
      reasons.push('startValue not set, initializing...');
    }

    if (!state.basePrice) {
      state.basePrice = price;
      reasons.push('basePrice not set, initializing...');
    }

    if (drawdown >= config.drawdownLimit) {
      reasons.push(`drawdown ${fixedTo((drawdown * 100), 2)}% >= limit`);
    }

    if (now - state.lastSwap < config.checkInterval) {
      reasons.push(`checkInterval not passed (${fixedTo((config.checkInterval / 60000), 0)} min)`);
    }

    
    //const usdtRatio = usdt / total;
    /* if (total > 0 && (usdtRatio < 0.05 || usdtRatio > 0.95)) {
      reasons.push(`portfolio imbalance: USDT ratio ${fixedTo((usdtRatio * 100), 1)}%`);
    } */
      if (total > 0) {
        const usdtRatio = usdt / total;
      
        if (delta > 0 && usdtRatio < 0.05) {
          // Продаем BTC, а USDT нету почти — плохо, блокируем
          reasons.push(`portfolio imbalance: USDT ratio ${fixedTo((usdtRatio * 100), 1)}%`);
        }
        if (delta < 0 && usdtRatio <= 0.0) {
          // Покупаем BTC, а USDT вообще нет — плохо, блокируем
          reasons.push(`portfolio imbalance: no USDT to buy`);
        }
      }

    
      
      

    if (Math.abs(delta) < swapTrigger) {
      reasons.push(`delta ${deltaPercent}% < trigger ${fixedTo((swapTrigger * 100), 2)}%`);
    }

    if (amountUSD < config.minSwapUSD) {
      reasons.push(`amount ${fixedTo(amountUSD, 2)} < minSwapUSD`);
    }

    if (amountUSD > config.maxSwapUSD) {
      reasons.push(`amount ${fixedTo(amountUSD, 2)} > maxSwapUSD`);
    }

    if ((delta > 0 && btc <= 0) || (delta < 0 && usdt <= 0)) {
      reasons.push(`not enough ${delta > 0 ? 'BTCB' : 'USDT'} to swap`);
    }

    let didSwap = false;

    if (reasons.length > 0) {
      const reasonText = `❌ Swap not executed due to:\n- ${reasons.join('\n- ')}`;
      logger.info(reasonText);
      logChunks.push(reasonText);
    } else {
      logger.info(`✅ Swap conditions met — executing swap...`);
      logChunks.push('✅ Swap conditions met — executing swap...');
      didSwap = await executeSwap(wallet, delta, state.balances, price);
      if (didSwap) {
        state.basePrice = price;
        state.lastSwap = now;

        await db.insertTxLog({
          direction: delta > 0 ? 'SELL' : 'BUY',
          amount_base: rawAmount,
          amount_quote: amountUSD,
          price,
          notes: 'swap executed'
        });

        if (delta < 0) {
          await db.addAsset({
            buy_price: price,
            amount_btc: rawAmount,
            notes: 'auto buy'
          });
        }

        if (delta > 0) {
          let remainingToSell = rawAmount;
          for (const asset of selectedAssets) {
            if (remainingToSell <= 0) break;

            const sellAmount = Math.min(asset.amount, remainingToSell);

            await db.updateAsset(asset.id, {
              amount_btc: asset.amount - sellAmount,
              status: (asset.amount - sellAmount) <= 0 ? 'sold' : 'holding'
            });

            remainingToSell -= sellAmount;
          }
        }
      } else {
        logger.warn(`❌ Swap execution failed or returned false`);
        logChunks.push(`❌ Swap execution failed or returned false`);
      }
    }

    await db.insertStateLog({
      wallet: wallet.address,
      base_price: state.basePrice,
      current_price: price,
      delta,
      macd,
      signal,
      usdt_balance: usdt,
      btc_balance: btc,
      did_swap: didSwap,
      reason: reasons.join('; ')
    });

    await db.updateRuntimeState(RUNTIME_ID, {
      base_price: state.basePrice,
      start_value: state.startValue,
      last_swap: new Date(state.lastSwap).toISOString(),
      prices: JSON.stringify(state.prices)
    });

    await notify(logChunks.join('\n'));

  } catch (err) {
    const msg = [
      '💥 SafeLoop ERROR:',
      `Message: ${err.message}`,
      `Stack:\n${err.stack}`
    ].join('\n');
    logger.error(msg);
    await notify(msg);
  }
};

logger.info('🚀 SafeLoop ΔUBP Rebalance Engine started...');
await safeLoop(); // <<< ВЫПОЛНИТЬ ПЕРВЫЙ ЦИКЛ СРАЗУ!
setInterval(safeLoop, config.checkInterval);
