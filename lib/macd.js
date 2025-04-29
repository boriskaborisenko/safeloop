// lib/macd.js
import { EMA } from 'technicalindicators';

/**
 * Рассчитывает MACD и сигнал на основе массива цен
 * @param {number[]} prices - Массив цен
 * @returns {Promise<{macd: number, signal: number}>}
 */
export const getMACD = async (prices) => {
  if (!Array.isArray(prices) || prices.length < 26) {
    return { macd: 0, signal: 0 };
  }

  const ema12 = EMA.calculate({ period: 12, values: prices });
  const ema26 = EMA.calculate({ period: 26, values: prices });

  if (ema12.length === 0 || ema26.length === 0) {
    return { macd: 0, signal: 0 };
  }

  const macdLine = ema12.slice(-1)[0] - ema26.slice(-1)[0];

  const macdHistory = ema12
    .slice(-ema26.length)
    .map((val, i) => val - ema26[i]);

  if (!Array.isArray(macdHistory) || macdHistory.length < 9) {
    // Недостаточно данных для EMA(9) по MACD истории
    return { macd: macdLine, signal: 0 };
  }

  const signalArray = EMA.calculate({ period: 9, values: macdHistory });
  const signalLine = signalArray.length > 0 ? signalArray.slice(-1)[0] : 0;

  return {
    macd: macdLine,
    signal: signalLine
  };
};
