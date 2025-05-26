# Quack Ledger
Demo implementation of Debit/Credit on top of DuckDB. Not fit for production!


## Quick Start

```bash
npm i
node index.js
```


## Notes

> When using option 1, DuckDB supports multiple writer threads using a combination of MVCC
But I couldn't see how to execute more than 1 tx a time

>  For example, each process could acquire a cross-process mutex lock, then open the database in read/write mode and close it when the query is complete. Instead of using a mutex lock, each process could instead retry the connection if another process is already connected to the database 

Maybe we could do something along these lines...


https://duckdb.org/docs/stable/data/insert

Says that we should if at all possible not use `INSERT` inside of a loop! Is there a method we could
implement debit/credit using some of DuckDB's bulk operations?

