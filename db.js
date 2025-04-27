import knex from './supabase.js';

// Получить runtime state по ID
export const getRuntimeState = async (id = 'main') => {
  return await knex('loop_runtime_state').where({ id }).first();
};

// Убедиться, что runtime state существует (если нет — создать)
export const ensureRuntimeState = async (id, data) => {
  const existing = await getRuntimeState(id);
  if (!existing) {
    await knex('loop_runtime_state').insert({ id, ...data });
  }
};

// Обновить runtime state по ID
export const updateRuntimeState = async (id, patch) => {
  await knex('loop_runtime_state').where({ id }).update(patch);
};

// Вставить лог состояния (одна запись на шаг)
export const insertStateLog = async (data) => {
  await knex('loop_state_log').insert(data);
};

// Вставить запись о реальном свапе
export const insertTxLog = async (data) => {
  await knex('loop_tx_log').insert(data);
};


//////

// Новый модуль для loop_assets:
export const addAsset = async (data) => {
    return await knex('loop_assets').insert(data).returning('*');
  };
  
  export const getHoldingAssets = async () => {
    return await knex('loop_assets')
      .where({ status: 'holding' })
      .orderBy('buy_price', 'asc');
  };
  
  export const updateAsset = async (id, patch) => {
    return await knex('loop_assets')
      .where({ id })
      .update(patch)
      .returning('*');
  };

  