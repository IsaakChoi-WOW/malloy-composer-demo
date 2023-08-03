# CMDB Data
Simple demonstration of Malloy Composer using cmdb data from BigQuery.

## What is this?

[Malloy Composer](https://github.com/malloydata/malloy-composer) is an open source tool for viewing and exploring data sets.  Data models are created in the  [Malloy](https://github.com/malloydata/malloy/) language.  Data can be served from a simple web server or from a SQL database.  

See [composer rendering docs](https://malloydata.github.io/documentation/visualizations/overview).


## Example

Example dashboard for cmdb data from BigQuery

<!-- malloy-query 
  name="CMDB Example Dashboard"
  model="./cmdb.malloy"
  renderer="dashboard"
-->
```malloy
query: cmdb-> {
  nest: num_assets
  nest: num_unique_owners
  nest: asset_count_per_owner
}
```
