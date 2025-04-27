const fixedTo = (val, digits = 2) => {
    return (typeof val === 'number' && !isNaN(val)) ? val.toFixed(digits) : 'NaN';
  };
  
  // lib/swap.js
  import { Contract, parseUnits } from 'ethers';
  import { config } from '../config/index.js';
  import logger from './logger.js';
  import { notify } from './notifier.js';
  
  const erc20ABI = [
    'function approve(address,uint256) returns (bool)',
    'function balanceOf(address) view returns (uint256)'
  ];
  
  const routerABI = [
    'function swapExactTokensForTokens(uint256,uint256,address[],address,uint256) returns (uint256[])'
  ];
  
  export const executeSwap = async (wallet, delta, balances, price) => {
    const router = new Contract(config.router, routerABI, wallet);
  
    const isSell = delta > 0;
    const direction = isSell ? 'SELL' : 'BUY';
  
    const tokenIn = isSell ? config.btc : config.usdt;
    const tokenOut = isSell ? config.usdt : config.btc;
    const decimalsIn = isSell ? config.btcDecimals : config.usdtDecimals;
  
    const amountFloat = isSell
      ? balances.btc * config.swapPortion
      : balances.usdt * config.swapPortion;
  
    const valueUSD = isSell
      ? amountFloat * price
      : amountFloat;
  
    // 🔒 Check swap thresholds
    if (valueUSD < config.minSwapUSD) {
      logger.info(`🧊 Swap skipped — under minimum: $${fixedTo(valueUSD, 2)} < $${config.minSwapUSD}`);
      await notify(`🧊 ${direction} signal too weak:\nAmount $${fixedTo(valueUSD, 2)} < min $${config.minSwapUSD}`);
      return false;
    }
  
    if (valueUSD > config.maxSwapUSD) {
      logger.warn(`🧱 Swap skipped — over max: $${fixedTo(valueUSD, 2)} > $${config.maxSwapUSD}`);
      await notify(`🧱 ${direction} too large:\nAmount $${fixedTo(valueUSD, 2)} > max $${config.maxSwapUSD}`);
      return false;
    }
  
    if (amountFloat <= 0) {
      logger.warn(`🧪 ${direction} condition met, but insufficient ${isSell ? 'BTCB' : 'USDT'} balance`);
      logger.info(`📊 Would have swapped ~${fixedTo(amountFloat, 6)} ${isSell ? 'BTCB' : 'USDT'} ≈ $${fixedTo(valueUSD, 2)} @ $${fixedTo(price, 2)}`);
      await notify(`💭 ${direction} signal:\nWould swap ~${fixedTo(amountFloat, 6)} ${isSell ? 'BTCB' : 'USDT'} ≈ $${fixedTo(valueUSD, 2)}\nBut insufficient funds`);
      return false;
    }
  
    const amountIn = parseUnits(fixedTo(amountFloat, 6), decimalsIn);
  
    const tokenContract = new Contract(tokenIn, erc20ABI, wallet);
    await tokenContract.approve(config.router, amountIn);
  
    const minOut = 0;
    const path = [tokenIn, tokenOut];
    const deadline = Math.floor(Date.now() / 1000) + 600;
  
    const tx = await router.swapExactTokensForTokens(
      amountIn,
      minOut,
      path,
      wallet.address,
      deadline,
      { gasLimit: 200000 }
    );
  
    await tx.wait();
  
    logger.info(`✅ Real swap executed: ${fixedTo(amountFloat, 6)} ${isSell ? 'BTCB' : 'USDT'} @ $${fixedTo(price, 2)}`);
    await notify(`✅ Swap executed:\n${direction} ${fixedTo(amountFloat, 6)} ${isSell ? 'BTCB' : 'USDT'} @ $${fixedTo(price, 2)}`);
    return true;
  };
  