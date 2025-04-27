// lib/gas.js
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

export const keepGasPumping = async (wallet, provider) => {
  try {
    const bnbBalance = await provider.getBalance(wallet.address);
    const bnbMin = parseUnits('0.03', 'ether');

    if (bnbBalance >= bnbMin) return;

    logger.warn('Low BNB balance detected — auto-refill triggered');

    const usdtContract = new Contract(config.usdt, erc20ABI, wallet);
    const amountIn = parseUnits('2', config.usdtDecimals);

    const usdtBalance = await usdtContract.balanceOf(wallet.address);
    if (usdtBalance < amountIn) {
      logger.warn('Auto-refill skipped — not enough USDT');
      return;
    }

    await usdtContract.approve(config.router, amountIn);

    const router = new Contract(config.router, routerABI, wallet);
    const minOut = 0;
    const path = [config.usdt, config.wbnb];
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

    logger.info(`✅ Auto-refill: Swapped 2 USDT to WBNB for gas`);
    await notify(`🔁 Auto-refill: Swapped 2 USDT to WBNB for gas`);
  } catch (err) {
    logger.warn(`Auto-refill failed: ${err.message}`);
    await notify(`❌ Auto-refill error:\n${err.message}`);
  }
};
