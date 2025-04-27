// lib/balances.js
import { Contract } from 'ethers';
import { formatUnits } from 'ethers';
import { config } from '../config/index.js';

const erc20ABI = [
  'function balanceOf(address) view returns (uint256)'
];

export const updateBalances = async (wallet, state) => {
  const btcContract = new Contract(config.btc, erc20ABI, wallet);
  const usdtContract = new Contract(config.usdt, erc20ABI, wallet);

  const btc = await btcContract.balanceOf(wallet.address);
  const usdt = await usdtContract.balanceOf(wallet.address);

  state.balances.btc = parseFloat(formatUnits(btc, config.btcDecimals));
  state.balances.usdt = parseFloat(formatUnits(usdt, config.usdtDecimals));
};
