const fixedTo = (val, digits = 2) => {
    return (typeof val === 'number' && !isNaN(val)) ? val.toFixed(digits) : 'NaN';
  };
  
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

  
  
 
 
  const provider = new ethers.JsonRpcProvider('https://bsc-dataseed.binance.org/');
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  
  const debugInit = true;
  
  let state = {
    basePrice: debugInit ? 84000 : null,
    startValue: debugInit ? 100 : null,
    lastSwap: 0,
    balances: { usdt: 0, btc: 0 },
    prices: [],
  };
  
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
  
      // MACD Boost
      let macdMsg = '';
      if (state.prices.length >= 26) {
        const { macd, signal } = await getMACD(state.prices);
        macdMsg = `MACD: ${fixedTo(macd, 6)} | Signal: ${fixedTo(signal, 6)}`;
        if ((macd > signal && delta > 0) || (macd < signal && delta < 0)) {
          swapTrigger = 0.015;
          macdMsg += ` → MACD Boost triggered! New trigger: ${fixedTo((swapTrigger * 100), 2)}%`;
        }
      }
  
      const direction = delta > 0 ? 'SELL BTCB → USDT' : 'BUY BTCB ← USDT';
      const rawAmount = delta > 0 ? btc * config.swapPortion : usdt * config.swapPortion;
      const amountUSD = delta > 0 ? rawAmount * price : rawAmount;
  
      // Logging Core Info
      const report = [
        `📡 Market Check`,
        `Price: $${fixedTo(price, 2)}`,
        `BTCB: ${fixedTo(btc, 6)} | USDT: ${fixedTo(usdt, 2)}`,
        `Portfolio: $${fixedTo(total, 2)}`,
        `📈 Delta: ${deltaPercent}% (Trigger: ${fixedTo((swapTrigger * 100), 2)}%)`,
        `🔁 Direction: ${direction}`,
        `💸 Would swap: ${fixedTo(rawAmount, 6)} (${fixedTo(amountUSD, 2)} USD)`,
        `🧠 Strategy`,
        `Threshold: ${fixedTo((triggerDefault * 100), 2)}% | Drawdown: ${fixedTo((config.drawdownLimit * 100), 2)}%`,
        `Portion: ${fixedTo((config.swapPortion * 100), 0)}% | Limits: $${config.minSwapUSD} – $${config.maxSwapUSD}`,
        macdMsg,
      ];
  
      report.forEach(line => logger.info(line));
      logChunks.push(...report);
  
      // === SWAP DECISION TREE ===
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
  
      const usdtRatio = usdt / total;
      if (total > 0 && (usdtRatio < 0.05 || usdtRatio > 0.95)) {
        reasons.push(`portfolio imbalance: USDT ratio ${fixedTo((usdtRatio * 100), 1)}%`);
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
  
      if (reasons.length > 0) {
        const reasonText = `❌ Swap not executed due to:\n- ${reasons.join('\n- ')}`;
        logger.info(reasonText);
        logChunks.push(reasonText);
  
        // 👉 Симулируем свап, если дельта прошла
        if (Math.abs(delta) >= swapTrigger) {
          const simulated = `🧪 Simulated swap: ${direction}\nAmount: ${fixedTo(rawAmount, 6)} ≈ $${fixedTo(amountUSD, 2)}`;
          logger.info(simulated);
          logChunks.push(simulated);
        }
      } else {
        logger.info(`✅ Swap conditions met — executing swap...`);
        logChunks.push('✅ Swap conditions met — executing swap...');
        const swapped = await executeSwap(wallet, delta, state.balances, price);
        if (swapped) {
          state.basePrice = price;
          state.lastSwap = now;
        } else {
          logger.warn(`❌ Swap execution failed or returned false`);
          logChunks.push(`❌ Swap execution failed or returned false`);
        }
      }
  
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
  setInterval(safeLoop, config.checkInterval); 

 
  