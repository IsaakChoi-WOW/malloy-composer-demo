/*
 * Copyright 2021 Google LLC
 *
 * This program is free software; you can redistribute it and/or
 * modify it under the terms of the GNU General Public License
 * version 2 as published by the Free Software Foundation.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 */

import {
  Connection,
  FetchSchemaAndRunSimultaneously,
  FetchSchemaAndRunStreamSimultaneously,
  FieldDef,
  FilterExpression,
  FixedConnectionMap,
  isFilteredAliasedName,
  Malloy,
  MalloyQueryData,
  Model,
  ModelDef,
  PersistSQLResults,
  PooledConnection,
  Runtime,
  StreamingConnection,
  StructDef,
  URLReader,
  Query,
} from "@malloydata/malloy";

class DummyFiles implements URLReader {
  async readURL(): Promise<string> {
    return "";
  }
}

class DummyConnection implements Connection {
  name = "dummy";

  runSQL(): Promise<MalloyQueryData> {
    throw new Error("Dummy connection cannot run SQL.");
  }

  runSQLBlockAndFetchResultSchema(): Promise<{
    data: MalloyQueryData;
    schema: StructDef;
  }> {
    throw new Error("Dummy connection cannot run SQL blocks.");
  }

  fetchSchemaForSQLBlocks(): Promise<{
    schemas: Record<string, StructDef>;
    errors: Record<string, string>;
  }> {
    throw new Error("Dummy connection cannot fetch schemas.");
  }

  fetchSchemaForTables(): Promise<{
    schemas: Record<string, StructDef>;
    errors: Record<string, string>;
  }> {
    throw new Error("Dummy connection cannot fetch schemas.");
  }

  isPool(): this is PooledConnection {
    return false;
  }

  canPersist(): this is PersistSQLResults {
    return false;
  }

  canFetchSchemaAndRunSimultaneously(): this is FetchSchemaAndRunSimultaneously {
    return false;
  }

  canStream(): this is StreamingConnection {
    return false;
  }

  canFetchSchemaAndRunStreamSimultaneously(): this is FetchSchemaAndRunStreamSimultaneously {
    return false;
  }
}

export async function _compileModel(
  modelDef: ModelDef,
  malloy: string
): Promise<Model> {
  const runtime = new Runtime(new DummyFiles(), new DummyConnection());
  const baseModel = await runtime._loadModelFromModelDef(modelDef).getModel();
  // TODO maybe a ModelMaterializer should have a `loadExtendingModel()` or something like that for this....
  const model = await Malloy.compile({
    urlReader: new DummyFiles(),
    connections: new FixedConnectionMap(
      new Map([["dummy", new DummyConnection()]]),
      "dummy"
    ),
    model: baseModel,
    parse: Malloy.parse({ source: malloy }),
  });
  return model;
}

export async function compileModel(
  modelDef: ModelDef,
  malloy: string
): Promise<ModelDef> {
  return (await _compileModel(modelDef, malloy))._modelDef;
}

function modelDefForSource(source: StructDef): ModelDef {
  return {
    name: "model",
    exports: [],
    contents: { [source.as || source.name]: source },
  };
}

export async function compileFilter(
  source: StructDef,
  filter: string
): Promise<FilterExpression> {
  const malloy = `query: the_query is ${
    source.as || source.name
  } -> { group_by: one is 1; where: ${filter}}`;
  const modelDef = modelDefForSource(source);
  const model = await compileModel(modelDef, malloy);
  const theQuery = model.contents["the_query"];
  if (theQuery.type !== "query") {
    throw new Error("Expected the_query to be a query");
  }
  const filterList = theQuery.pipeline[0].filterList;
  if (filterList === undefined) {
    throw new Error("Expected a filter list");
  }
  return filterList[0];
}

export async function compileDimension(
  source: StructDef,
  name: string,
  dimension: string
): Promise<FieldDef> {
  const malloy = `query: the_query is ${
    source.as || source.name
  } -> { group_by: ${name} is ${dimension} }`;
  const modelDef = modelDefForSource(source);
  const model = await compileModel(modelDef, malloy);
  const theQuery = model.contents["the_query"];
  if (theQuery.type !== "query") {
    throw new Error("Expected the_query to be a query");
  }
  const field = theQuery.pipeline[0].fields[0];
  if (typeof field === "string") {
    throw new Error("Expected field definiton, not reference");
  } else if (isFilteredAliasedName(field)) {
    throw new Error("Expected field definition, not filtered aliased name");
  }
  return field;
}

export async function compileMeasure(
  source: StructDef,
  name: string,
  measure: string
): Promise<FieldDef> {
  const malloy = `query: the_query is ${
    source.as || source.name
  } -> { aggregate: ${name} is ${measure} }`;
  const modelDef = modelDefForSource(source);
  const model = await compileModel(modelDef, malloy);
  const theQuery = model.contents["the_query"];
  if (theQuery.type !== "query") {
    throw new Error("Expected the_query to be a query");
  }
  const field = theQuery.pipeline[0].fields[0];
  if (typeof field === "string") {
    throw new Error("Expected field definiton, not reference");
  } else if (isFilteredAliasedName(field)) {
    throw new Error("Expected field definition, not filtered aliased name");
  }
  return field;
}

type CheatyPreparedQuery = { _query: Query };

// TODO get this from Malloy
export type NamedQuery = Query & { as?: string; name?: string };

export async function compileQuery(
  source: StructDef,
  query: string
): Promise<NamedQuery> {
  const modelDef = modelDefForSource(source);
  const model = await _compileModel(modelDef, query);
  const regex = /\s*query\s*:\s*([^\s]*)\s*is/;
  const match = query.match(regex);
  const preparedQuery = match
    ? model.getPreparedQueryByName(match[1])
    : model.preparedQuery;
  const compiledQuery = (preparedQuery as unknown as CheatyPreparedQuery)
    ._query;
  if (compiledQuery.pipeHead) {
    const structRef = compiledQuery.structRef;
    if (typeof structRef !== "string") {
      throw new Error("Cannot run queries with complex struct refs");
    }
    const source = model._modelDef.contents[structRef] as StructDef;
    // TODO LLOYD HOW
    // TODO deal with turtleSegment/pipeHead filters?
    const resolved = source.fields.find(
      (field) => field.name === compiledQuery.pipeHead.name
    );
    if (resolved.type !== "turtle") {
      throw new Error("Invalid query pipehead");
    }
    compiledQuery.pipeline = [...resolved.pipeline, ...compiledQuery.pipeline];
  }
  const as = "as" in compiledQuery ? (compiledQuery as any).as : undefined;
  const name =
    "name" in compiledQuery ? (compiledQuery as any).name : undefined;
  return {
    ...compiledQuery,
    as,
    name: name || "new_query",
  };
}

export async function getSourceNameForQuery(
  modelDef: ModelDef,
  query: string
): Promise<string> {
  const model = await _compileModel(modelDef, query);
  const regex = /\s*query\s*:\s*([^\s]*)\s*is/;
  const match = query.match(regex);
  const preparedQuery = match
    ? model.getPreparedQueryByName(match[1])
    : model.preparedQuery;
  return preparedQuery.preparedResult._sourceExploreName;
}
