// lib/macd.js
import { EMA } from 'technicalindicators';

export const getMACD = async (prices) => {
  if (prices.length < 26) return { macd: 0, signal: 0 };

  const ema12 = EMA.calculate({ period: 12, values: prices });
  const ema26 = EMA.calculate({ period: 26, values: prices });

  if (ema12.length === 0 || ema26.length === 0) return { macd: 0, signal: 0 };

  const macdLine = ema12.slice(-1)[0] - ema26.slice(-1)[0];

  const macdHistory = ema12
    .slice(-ema26.length)
    .map((val, i) => val - ema26[i]);

  const signalLine = EMA.calculate({ period: 9, values: macdHistory }).slice(-1)[0];

  return { macd: macdLine, signal: signalLine };
};
