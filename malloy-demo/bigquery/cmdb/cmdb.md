# Iowa State Store Liquor Purchases
In Iowa, all liquor stores are own by the state.  The store's purchases are a matter of public record.  

## What is this?

[Malloy Composer](https://github.com/malloydata/malloy-composer) is an open source tool for viewing and exploring data sets.  Data models are created in the  [Malloy](https://github.com/malloydata/malloy/) language.  Data can be served from a simple web server or from a SQL database.  

See the [Malloy source code](https://github.com/malloydata/malloy-samples/tree/main/bigquery/iowa) for this data set.


## Overview

Example dashboard for cmdb data from BigQuery

<!-- malloy-query 
  name="Overview"
  model="./cmdb.malloy"
  renderer="dashboard"
-->
```malloy
query: cmdb-> {
  nest: num_unique_owners
  nest: num_assets
  nest: asset_count_per_owner
}
```
