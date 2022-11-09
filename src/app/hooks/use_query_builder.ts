/*
 * Copyright 2022 Google LLC
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
  FilterExpression,
  QueryFieldDef,
  StructDef,
  Result as MalloyResult,
  ModelDef,
  NamedQuery,
} from "@malloydata/malloy";
import { DataStyles } from "@malloydata/render";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { compileQuery } from "../../core/compile";
import { QueryBuilder, QueryWriter } from "../../core/query";
import { QuerySummary, RendererName, StagePath } from "../../types";
import { useRunQuery } from "../data/use_run_query";

interface UseQueryBuilderResult {
  queryBuilder: React.MutableRefObject<QueryBuilder | undefined>;
  queryMalloy: string;
  queryName: string;
  clearQuery: (noURLUpdate?: boolean) => void;
  runQuery: () => void;
  isRunning: boolean;
  clearResult: () => void;
  source: StructDef | undefined;
  queryModifiers: QueryModifiers;
  querySummary: QuerySummary | undefined;
  result: MalloyResult | undefined;
  dataStyles: DataStyles;
  error: Error | undefined;
  registerNewSource: (source: StructDef) => void;
  dirty: boolean;
}

export interface QueryModifiers {
  addFilter: (
    stagePath: StagePath,
    filter: FilterExpression,
    as?: string
  ) => void;
  toggleField: (stagePath: StagePath, fieldPath: string) => void;
  addLimit: (stagePath: StagePath, limit: number) => void;
  addOrderBy: (
    stagePath: StagePath,
    byFieldIndex: number,
    direction?: "asc" | "desc"
  ) => void;
  addNewNestedQuery: (stagePath: StagePath, name: string) => void;
  addNewDimension: (stagePath: StagePath, dimension: QueryFieldDef) => void;
  addNewMeasure: (stagePath: StagePath, measure: QueryFieldDef) => void;
  setDataStyle: (name: string, renderer: RendererName | undefined, noURLUpdate?: boolean) => DataStyles;
  setDataStyles: (styles: DataStyles, noURLUpdate?: boolean) => void;
  addStage: (stagePath: StagePath | undefined, fieldIndex?: number) => void;
  loadQuery: (queryPath: string) => void;
  updateFieldOrder: (stagePath: StagePath, newOrdering: number[]) => void;
  removeField: (stagePath: StagePath, fieldIndex: number) => void;
  removeFilter: (
    stagePath: StagePath,
    filterIndex: number,
    fieldIndex?: number
  ) => void;
  removeLimit: (stagePath: StagePath) => void;
  removeOrderBy: (stagePath: StagePath, orderByIndex: number) => void;
  renameField: (
    stagePath: StagePath,
    fieldIndex: number,
    newName: string
  ) => void;
  addFilterToField: (
    stagePath: StagePath,
    fieldIndex: number,
    filter: FilterExpression,
    as?: string
  ) => void;
  editLimit: (stagePath: StagePath, limit: number) => void;
  editFilter: (
    stagePath: StagePath,
    fieldIndex: number | undefined,
    filterIndex: number,
    filter: FilterExpression
  ) => void;
  replaceWithDefinition: (stagePath: StagePath, fieldIndex: number) => void;
  editDimension: (
    stagePath: StagePath,
    fieldIndex: number,
    dimension: QueryFieldDef
  ) => void;
  editMeasure: (
    stagePath: StagePath,
    fieldIndex: number,
    measure: QueryFieldDef
  ) => void;
  editOrderBy: (
    stagePath: StagePath,
    orderByIndex: number,
    direction: "asc" | "desc" | undefined
  ) => void;
  removeStage: (stagePath: StagePath) => void;
  clearQuery: (noURLUpdate?: boolean) => void;
  onDrill: (filters: FilterExpression[]) => void;
  setQuery: (query: NamedQuery, noURLUpdate?: boolean) => void;
}

export function useQueryBuilder(
  model?: ModelDef,
  sourceName?: string,
  updateQueryInURL?: (params: { 
    run: boolean, 
    query: string | undefined,
    styles: DataStyles
  }) => void,
): UseQueryBuilderResult {
  const queryBuilder = useRef<QueryBuilder>(new QueryBuilder(undefined));
  const [error, setError] = useState<Error | undefined>();
  // const [params, setParams] = useSearchParams();
  const [queryString, setQueryString] = useState("");
  const [dirty, setDirty] = useState(false);

  const dataStyles = useRef<DataStyles>({});

  const querySummary = (() => {
    if (queryBuilder.current.getSource() === undefined) {
      return undefined;
    }
    const writer = queryBuilder.current.getWriter();
    const summary = writer.getQuerySummary({}, dataStyles.current);
    return summary;
  })();

  const registerNewSource = (source: StructDef) => {
    queryBuilder.current.updateSource(source);
  };

  const queryName = queryBuilder.current.getQuery()?.name;

  const {
    result,
    runQuery: runQueryRaw,
    isRunning,
    clearResult,
  } = useRunQuery(setError, model);

  const runQuery = () => {
    let writer = queryBuilder.current.getWriter();
    const summary = writer.getQuerySummary({}, dataStyles.current);
    const topLevel = {
      stageIndex: summary ? summary.stages.length - 1 : 0,
    };
    setError(undefined);
    if (!queryBuilder.current?.hasLimit(topLevel)) {
      // TODO magic number here: we run the query before we set this limit,
      //      and this limit just happens to be the default limit
      modifyQuery((qb) => qb.addLimit(topLevel, 10), true, true);
    }
    const query = queryBuilder.current.getQuery();
    writer = queryBuilder.current.getWriter();
    if (queryBuilder.current?.canRun()) {
      const queryString = writer.getQueryStringForModel();
      runQueryRaw(queryString, query.name);
      setDirty(false);
    }
  };

  const modifyQuery = (
    modify: (queryBuilder: QueryBuilder) => void,
    noURLUpdate = false,
    replace = false
  ) => {
    console.log("Modify query: source", queryBuilder.current.getSource());
    modify(queryBuilder.current);
    const writer = queryBuilder.current.getWriter();
    if (queryBuilder.current?.canRun()) {
      const queryString = writer.getQueryStringForModel();
      if (!noURLUpdate) {
        updateQueryInURL({ run: noURLUpdate, query: queryString, styles: dataStyles.current });
      }
      setQueryString(queryString);
      setDirty(true);
    } else {
      const queryString = writer.getQueryStringForModel();
      setQueryString(queryString);
      setDirty(true);
    }
  };

  const clearQuery = (noURLUpdate = false, replace = false) => {
    modifyQuery((qb) => qb.clearQuery(), noURLUpdate);
    setDataStyles({}, noURLUpdate);
    clearResult();
    updateQueryInURL({ run: false, query: undefined, styles: {} });
    setQueryString("");
  };

  const toggleField = (stagePath: StagePath, fieldPath: string) => {
    modifyQuery((qb) => qb.toggleField(stagePath, fieldPath));
  };

  const removeField = (stagePath: StagePath, fieldIndex: number) => {
    modifyQuery((qb) => qb.removeField(stagePath, fieldIndex));
  };

  const addFilter = (stagePath: StagePath, filter: FilterExpression) => {
    modifyQuery((qb) => qb.addFilter(stagePath, filter));
  };

  const editFilter = (
    stagePath: StagePath,
    fieldIndex: number | undefined,
    filterIndex: number,
    filter: FilterExpression
  ) => {
    modifyQuery((qb) =>
      qb.editFilter(stagePath, fieldIndex, filterIndex, filter)
    );
  };

  const removeFilter = (
    stagePath: StagePath,
    filterIndex: number,
    fieldIndex?: number
  ) => {
    modifyQuery((qb) => qb.removeFilter(stagePath, filterIndex, fieldIndex));
  };

  const addLimit = (stagePath: StagePath, limit: number) => {
    modifyQuery((qb) => qb.addLimit(stagePath, limit));
  };

  const addStage = (stagePath: StagePath | undefined, fieldIndex?: number) => {
    modifyQuery((qb) => qb.addStage(stagePath, fieldIndex));
  };

  const removeStage = (stagePath: StagePath) => {
    modifyQuery((qb) => qb.removeStage(stagePath));
  };

  const addOrderBy = (
    stagePath: StagePath,
    byFieldIndex: number,
    direction?: "asc" | "desc"
  ) => {
    modifyQuery((qb) => qb.addOrderBy(stagePath, byFieldIndex, direction));
  };

  const editOrderBy = (
    stagePath: StagePath,
    orderByIndex: number,
    direction: "asc" | "desc" | undefined
  ) => {
    modifyQuery((qb) => qb.editOrderBy(stagePath, orderByIndex, direction));
  };

  const removeOrderBy = (stagePath: StagePath, orderByIndex: number) => {
    modifyQuery((qb) => qb.removeOrderBy(stagePath, orderByIndex));
  };

  const removeLimit = (stagePath: StagePath) => {
    modifyQuery((qb) => qb.removeLimit(stagePath));
  };

  const renameField = (
    stagePath: StagePath,
    fieldIndex: number,
    newName: string
  ) => {
    modifyQuery((qb) => qb.renameField(stagePath, fieldIndex, newName));
  };

  const addFilterToField = (
    stagePath: StagePath,
    fieldIndex: number,
    filter: FilterExpression,
    as?: string
  ) => {
    modifyQuery((qb) => qb.addFilterToField(stagePath, fieldIndex, filter, as));
  };

  const addNewNestedQuery = (stagePath: StagePath, name: string) => {
    modifyQuery((qb) => qb.addNewNestedQuery(stagePath, name));
  };

  const addNewDimension = (stagePath: StagePath, dimension: QueryFieldDef) => {
    modifyQuery((qb) => qb.addNewField(stagePath, dimension));
  };

  const setQuery = (query: NamedQuery, noURLUpdate = false) => {
    modifyQuery((qb) => qb.setQuery(query), noURLUpdate);
  };

  const editDimension = (
    stagePath: StagePath,
    fieldIndex: number,
    dimension: QueryFieldDef
  ) => {
    modifyQuery((qb) =>
      qb.editFieldDefinition(stagePath, fieldIndex, dimension)
    );
  };

  const editMeasure = (
    stagePath: StagePath,
    fieldIndex: number,
    measure: QueryFieldDef
  ) => {
    modifyQuery((qb) => qb.editFieldDefinition(stagePath, fieldIndex, measure));
  };

  const updateFieldOrder = (stagePath: StagePath, order: number[]) => {
    modifyQuery((qb) => qb.reorderFields(stagePath, order));
  };

  const replaceWithDefinition = (stagePath: StagePath, fieldIndex: number) => {
    modifyQuery((qb) =>
      qb.replaceWithDefinition(stagePath, fieldIndex)
    );
  };

  const loadQuery = (queryPath: string) => {
    modifyQuery((qb) => qb.loadQuery(queryPath));
  };

  const addNewMeasure = addNewDimension;

  const onDrill = (filters: FilterExpression[]) => {
    modifyQuery((qb) => {
      qb.clearQuery();
      for (const filter of filters) {
        qb.addFilter({ stageIndex: 0 }, filter);
      }
    });
  };

  const setDataStyle = (name: string, renderer: RendererName | undefined, noURLUpdate = false) => {
    const newDataStyles = { ...dataStyles.current };
    if (renderer === undefined) {
      if (name in newDataStyles) {
        delete newDataStyles[name];
      }
    } else {
      newDataStyles[name] = { renderer };
    }
    modifyQuery(() => {
      dataStyles.current = newDataStyles;
    }, noURLUpdate);
    return newDataStyles;
  };

  const setDataStyles = (styles: DataStyles, noURLUpdate = false) => {
    modifyQuery(() => {
      dataStyles.current = styles;
    }, noURLUpdate);
  }

  return {
    dirty,
    queryBuilder,
    queryMalloy: queryString,
    queryName,
    clearQuery,
    runQuery,
    isRunning,
    clearResult,
    source: queryBuilder.current.getSource(),
    querySummary,
    dataStyles: dataStyles.current,
    result,
    error,
    registerNewSource,
    queryModifiers: {
      setDataStyles,
      setQuery,
      addFilter,
      toggleField,
      addLimit,
      addOrderBy,
      addNewNestedQuery,
      addNewDimension,
      addNewMeasure,
      setDataStyle,
      addStage,
      loadQuery,
      updateFieldOrder,
      removeField,
      removeFilter,
      removeLimit,
      removeOrderBy,
      renameField,
      addFilterToField,
      editLimit: addLimit,
      editFilter,
      replaceWithDefinition,
      editDimension,
      editMeasure,
      editOrderBy,
      removeStage,
      clearQuery,
      onDrill,
    },
  };
}

function parseDataStyles(styles: string | undefined): DataStyles {
  try {
    return styles ? JSON.parse(styles) : {};
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(error);
    return {};
  }
}
