// lib/price.js
import { Contract, formatUnits } from 'ethers';
import { config } from '../config/index.js';
import { notify } from './notifier.js';
import logger from './logger.js';

const pairABI = [
  'function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
  'function token0() view returns (address)',
  'function token1() view returns (address)'
];

export const getPoolPrice = async (provider) => {
  try {
    const pair = new Contract(config.v2pair, pairABI, provider);

    const [reserve0, reserve1] = await pair.getReserves();
    const token0 = await pair.token0();
    const token1 = await pair.token1();

    logger.info(`token0: ${token0}`);
    logger.info(`token1: ${token1}`);

    const isToken0USDT = token0.toLowerCase() === config.usdt.toLowerCase();

    const usdtReserve = isToken0USDT ? reserve0 : reserve1;
    const btcReserve = isToken0USDT ? reserve1 : reserve0;

    const usdt = parseFloat(formatUnits(usdtReserve, config.usdtDecimals));
    const btc = parseFloat(formatUnits(btcReserve, config.btcDecimals));

    if (usdt === 0 || btc === 0) {
      logger.warn(`⚠️ Reserves zero: usdt=${usdt}, btc=${btc}`);
      await notify(`⚠️ Pancake V2 reserves empty:\nUSDT=${usdt}, BTC=${btc}`);
      return 0;
    }

    const price = usdt / btc;

    return price;
  } catch (err) {
    logger.warn(`❌ V2 getReserves failed: ${err.message}`);
    await notify(`⚠️ Pancake V2 price fetch failed:\n${err.message}`);
    return 0;
  }
};
