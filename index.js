const { DuckDBInstance } = require('@duckdb/node-api')
const id = require('tigerbeetle-node').id
const fs = require('node:fs')
const path = require('node:path')
const { cwd } = require('node:process')

const TRANSFERS_COUNT = 10000
// What % of transfers are a debit/credit from the hot account?
const workloadContention = 0.9

let instance
let connection
let transfers = []

const setup = async () => {
  // set up duckdb, run migration
  instance = await DuckDBInstance.create('tmp.db')
  connection = await instance.connect()
  const migrationFile = fs.readFileSync(path.join(cwd(), 'migration_duck.sql'))
  const migrations = migrationFile.toString();

  await connection.run(migrations)
  await connection.run('TRUNCATE TABLE transfers');
  await connection.run('TRUNCATE TABLE accounts');

  // 10 hot accounts
  const hotAccountIds = Array.from({length: 10}).map(() => id())
  const hotTransfers = Math.floor(TRANSFERS_COUNT * workloadContention)
  const coldTransfers = TRANSFERS_COUNT - hotTransfers
  const accountIdMap = {}

  // Create hot transfers - one leg debits/credits the hot accounts
  for (let idx = 0; idx < hotTransfers; idx++) {
    const debitAccountId = hotAccountIds[Math.floor(Math.random() * hotAccountIds.length)];
    const creditAccountId = id()
    transfers.push({
      id: id(),
      debitAccountId,
      creditAccountId,
      amount: 1n
    })
    accountIdMap[debitAccountId] = true
    accountIdMap[creditAccountId] = true
  }

  // Create cold transfers
  for (let idx = 0; idx < coldTransfers; idx++) {
    const debitAccountId = id()
    const creditAccountId = id()
    transfers.push({
      id: id(),
      debitAccountId,
      creditAccountId,
      amount: 1n
    })
    accountIdMap[debitAccountId] = true
    accountIdMap[creditAccountId] = true
  }

  const accountIds = Object.keys(accountIdMap)
  const statement = await connection.prepare(`INSERT INTO accounts VALUES ($1, $2, $3, $4)`)

  for await (const accountId of accountIds) {
    statement.bind({
      1: accountId,
      2: 0,
      3: 0,
      4: BigInt((new Date()).getTime())
    })
    await statement.run()
  }

  // shuffle the transfers
  transfers = shuffle(transfers)
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


// util functions
function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}