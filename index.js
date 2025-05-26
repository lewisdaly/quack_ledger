const { DuckDBInstance } = require('@duckdb/node-api')
const id = require('tigerbeetle-node').id
const fs = require('node:fs')
const path = require('node:path')
const { cwd } = require('node:process')

const ACCOUNTS_COUNT = 100
const TRANSFERS_COUNT = 10000

let instance
let connection
const accountIds = []
const transfers = []

const randomElementExcluding = (arr, excluded, maxRetries = 10) => {
  for (let i = 0; i < maxRetries; i++) {
    const randomElement = arr[Math.floor(Math.random() * arr.length)];
    if (randomElement !== excluded) {
      return randomElement;
    }
  }
  throw new Error(`failed to find unique element`)
}

const setup = async () => {
  // set up duckdb, run migration
  instance = await DuckDBInstance.create('tmp.db')
  connection = await instance.connect()
  const migrationFile = fs.readFileSync(path.join(cwd(), 'migration_duck.sql'))
  const migrations = migrationFile.toString();

  await connection.run(migrations)
  await connection.run('TRUNCATE TABLE transfers');
  await connection.run('TRUNCATE TABLE accounts');

  const statement = await connection.prepare(`INSERT INTO accounts VALUES ($1, $2, $3, $4)`)

  // Create accounts
  for (let idx = 0; idx < ACCOUNTS_COUNT; idx++) {
    const accountId = id()
    accountIds.push(accountId)
    statement.bind({
      1: accountId,
      2: 0,
      3: 0,
      4: BigInt((new Date()).getTime())
    })
    await statement.run()
  }

  // Invent some transfers with random contention
  for (let idx = 0; idx < TRANSFERS_COUNT; idx++) {
    const debitAccountId = randomElementExcluding(accountIds, undefined)
    const creditAccountId = randomElementExcluding(accountIds, debitAccountId)
    transfers.push({
      id: id(),
      debitAccountId,
      creditAccountId,
      amount: 1n
    })
  }
}

const insertWithRetries = async (transfer, statements, retries) => {
  if (retries === 0) {
    throw new Error(`ran out of retries!`)
  }

  try {
    await connection.run('BEGIN');
    statements[0].bind({
      1: transfer.amount,
      2: transfer.creditAccountId
    })
    statements[1].bind({
      1: transfer.amount,
      2: transfer.debitAccountId
    })
    statements[2].bind({
      1: transfer.id,
      2: transfer.debitAccountId,
      3: transfer.creditAccountId,
      4: transfer.amount,
      5: BigInt((new Date()).getTime()),
    })

    await statements[0].run()
    await statements[1].run()
    await statements[2].run()
    await connection.run('COMMIT');
  } catch (err) {
    await connection.run('ROLLBACK');
    return insertWithRetries(transfer, statements, retries - 1)
  }
}

const run = async () => {
  const statements = [
    await connection.prepare(`UPDATE accounts SET credits = credits + $1 WHERE id = $2`),
    await connection.prepare(`UPDATE accounts SET debits = debits + $1 WHERE id = $2`),
    await connection.prepare(`INSERT INTO transfers VALUES ($1, $2, $3, $4, $5)`),
  ]
  const start = performance.now()


  // insert the transfers - one at a time!
  for await (const transfer of transfers) {
    await insertWithRetries(transfer, statements, 10)
  }

  const end = performance.now()

  const duration = Number(end - start).toFixed(2)
  const durationS = Number(end - start)/1000
  const avgTPS = Number(transfers.length / durationS).toFixed(2)
  console.log(`Finished inserting: ${transfers.length} transfers after ${duration} ms - Average TPS: ${avgTPS}`)
}

const main = async () => {
  await setup()
  await run()
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.log('uncaught exception', err)
    process.exit(1)
  })
