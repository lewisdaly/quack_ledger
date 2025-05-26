CREATE TABLE IF NOT EXISTS accounts (
  id UINT128 PRIMARY KEY,
  credits UINT128 NOT NULL,
  debits UINT128 NOT NULL,
  -- using a BIGINT here to match TigerBeetle's API
  ts UINT128 NOT NULL
);

CREATE TABLE IF NOT EXISTS transfers (
  id UINT128 PRIMARY KEY,
  debit_account_id UINT128 NOT NULL,
  credit_account_id UINT128 NOT NULL,
  amount UINT128 NOT NULL,
  -- using a BIGINT here to match TigerBeetle's API
  ts UINT128 NOT NULL,
);