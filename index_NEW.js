import knex from './supabase.js'; // Подключение к базе

// ===== SF_SYSTEM =====

export const loadSystemState = async (runtimeId) => {
  const record = await knex('sf_system').where({ runtime_id: runtimeId }).first();
  return record || null;
};

export const createSystemState = async (runtimeId, basePoint, balances) => {
  await knex('sf_system').insert({
    runtime_id: runtimeId,
    current_base_point: basePoint,
    prices: JSON.stringify([]),
    usdt_balance_start: balances.usdt,
    btc_balance_start: balances.btc,
    usdt_balance_now: balances.usdt,
    btc_balance_now: balances.btc,
    total_profit: 0,
    created_at: knex.fn.now(),
    updated_at: knex.fn.now()
  });
};

export const updateSystemState = async (runtimeId, fields) => {
  await knex('sf_system')
    .where({ runtime_id: runtimeId })
    .update({
      ...fields,
      updated_at: knex.fn.now()
    });
};

// ===== SF_ASSETS =====

export const insertAssetBuy = async (runtimeId, amountBtc, priceUsd, amountUsd) => {
  await knex('sf_assets').insert({
    runtime_id: runtimeId,
    type: 'BUY',
    amount_btc: amountBtc,
    price_usd: priceUsd,
    amount_usd: amountUsd,
    status: 'active',
    created_at: knex.fn.now()
  });
};

export const insertAssetSell = async (runtimeId, amountBtc, priceUsd, amountUsd) => {
  await knex('sf_assets').insert({
    runtime_id: runtimeId,
    type: 'SELL',
    amount_btc: amountBtc,
    price_usd: priceUsd,
    amount_usd: amountUsd,
    status: 'closed',
    created_at: knex.fn.now()
  });
};

export const loadActiveBuys = async (runtimeId) => {
  const records = await knex('sf_assets')
    .where({ runtime_id: runtimeId, type: 'BUY', status: 'active' })
    .select();
  return records || [];
};

export const closeAssets = async (ids) => {
  if (ids.length === 0) return;
  await knex('sf_assets')
    .whereIn('id', ids)
    .update({ status: 'closed' });
};

// ===== SF_MANUAL =====

export const insertManualDeposit = async (runtimeId, amountUsd, note = null) => {
  await knex('sf_manual').insert({
    runtime_id: runtimeId,
    type: 'DEPOSIT',
    amount_usdt: amountUsd,
    notes: note,
    created_at: knex.fn.now()
  });
};

export const insertManualWithdraw = async (runtimeId, amountUsd, note = null) => {
  await knex('sf_manual').insert({
    runtime_id: runtimeId,
    type: 'WITHDRAW',
    amount_usdt: amountUsd,
    notes: note,
    created_at: knex.fn.now()
  });
};

export const loadManualCorrections = async (runtimeId) => {
  const deposits = await knex('sf_manual')
    .where({ runtime_id: runtimeId, type: 'DEPOSIT' })
    .sum('amount_usdt as sum');
  
  const withdraws = await knex('sf_manual')
    .where({ runtime_id: runtimeId, type: 'WITHDRAW' })
    .sum('amount_usdt as sum');

  const depositSum = parseFloat(deposits[0].sum) || 0;
  const withdrawSum = parseFloat(withdraws[0].sum) || 0;

  return {
    depositSum,
    withdrawSum,
    netManualFlow: depositSum - withdrawSum
  };
};
