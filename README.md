# Quack Ledger

Demo implementation of Debit/Credit on top of DuckDB. Not fit for production!

> GOAL: We should aim for 1 debit/credit per SQL transaction, with durability, and try to beat PG only for 90% contention

## Quick Start

```bash
npm i
node index.js

# Finished inserting: 10000 transfers after 11411.14 ms - Average TPS: 876.34
```

## Workload

The workload here is highly contentous, it looks like this:
1. Generate 10 hot accountIds
2. Based on the workload contention, generate transfers.
  When `workloadContention=0.9`, that means that every 9/10 transfers generated will reference just one 
  of the ids in the hot account id list
3. 1/10 transfers refer to unique accountIds on both the debit and credit side


## Debit/Credit Implementation

This is a super simplified model of Debit/Credit, the guts of the implementation are this (per transfer)

```sql
BEGIN
  UPDATE accounts SET credits = credits + $1 WHERE id = $2;
  UPDATE accounts SET debits = debits + $1 WHERE id = $2;
  INSERT INTO transfers VALUES ($1, $2, $3, $4, $5);
COMMIT
```

My first pass implementation has been to insert just 1 transfer at a time  but from what I've been
reading in the docs (https://duckdb.org/docs/stable/data/insert) we should try and avoid using `INSERT`
like this inside of a loop.


