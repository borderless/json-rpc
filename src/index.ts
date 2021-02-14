import { BaseError } from "make-error";

export interface Method<T, U> {
  request: T;
  response: U;
}

export type Methods = Record<string, Method<any, any>>;

/**
 * Metadata for JSON-RPC requests.
 */
export interface Metadata {
  id: JsonRpcId;
  isNotification: boolean;
}

/**
 * RPC method resolver.
 */
export type Resolver<T, U, C = void> = (
  req: T,
  context: C,
  meta: Metadata
) => U | Promise<U>;

/**
 * Implementation of methods.
 */
export type Resolvers<T extends Methods, C = void> = {
  [K in keyof T]: Resolver<T[K]["request"], T[K]["response"], C>;
};

/**
 * JSON RPC request.
 */
export interface JsonRpcRequest<T extends string, U> {
  jsonrpc: "2.0";
  id?: JsonRpcId;
  method: T;
  params: U;
}

/**
 * JSON RPC error.
 */
export interface JsonRpcError<T = void> {
  code: number;
  message: string;
  data: T;
}

/**
 * Valid JSON RPC IDs (`undefined` denotes no notification).
 */
export type JsonRpcId = string | number | null | undefined;

/**
 * JSON RPC response.
 */
export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: JsonRpcId;
}

/**
 * The JSON RPC success interface defines a response object.
 */
export interface JsonRpcSuccess<T> extends JsonRpcResponse {
  result: T;
}

/**
 * The JSON RPC failure interface occurs on error.
 */
export interface JsonRpcFailure<T> extends JsonRpcResponse {
  error: JsonRpcError<T>;
}

/**
 * Create a custom RPC error to report issues.
 */
export class RpcError<T = void> extends BaseError implements JsonRpcError<T> {
  constructor(public message: string, public code = -32603, public data: T) {
    super(message);
  }
}

export class InvalidRequestError extends RpcError {
  constructor() {
    super("Invalid request", -32600);
  }
}

export class MethodNotFoundError extends RpcError {
  constructor() {
    super("Method not found", -32601);
  }
}

export class ParseError extends RpcError {
  constructor(message: string) {
    super(message, -32700);
  }
}

/**
 * Parse raw input into JSON.
 */
export function parseJSON(input: string): unknown {
  try {
    return JSON.parse(input);
  } catch (err) {
    throw new ParseError(err.message);
  }
}

/**
 * Check if JSON RPC ID is valid.
 */
function isJsonRpcId(input: unknown): input is JsonRpcId {
  if (input === null || input === undefined) return true;
  if (typeof input === "string") return true;
  if (typeof input === "number") return input % 1 === 0;
  return false;
}

/**
 * Wrap a result in JSON RPC success response.
 */
function success<T>(result: T, id: JsonRpcId): JsonRpcSuccess<T> | undefined {
  if (id === undefined) return;
  return { jsonrpc: "2.0", result, id };
}

/**
 * Wrap an error in JSON RPC failure response.
 */
function failure<T = void>(
  error: JsonRpcError<T>,
  id: JsonRpcId
): JsonRpcFailure<T> | undefined {
  if (id === undefined) return;
  const { code, message, data } = error;
  return { jsonrpc: "2.0", error: { code, message, data }, id };
}

/**
 * Validate RPC message is correctly formatted and type-safe.
 */
async function processRequest<T extends Methods, C = void>(
  resolvers: Resolvers<T, C>,
  message: unknown,
  context: C
): Promise<JsonRpcSuccess<any> | JsonRpcFailure<any> | undefined> {
  if (message === null || typeof message !== "object") {
    return failure(new InvalidRequestError(), null);
  }

  const { jsonrpc, method, id, params } = message as Record<string, unknown>;
  const isNotification = id === undefined;

  if (!isJsonRpcId(id)) {
    return failure(new InvalidRequestError(), null);
  }

  if (jsonrpc !== "2.0" || typeof method !== "string") {
    return failure(new InvalidRequestError(), id ?? null);
  }

  if (!(method in resolvers)) {
    return failure(new MethodNotFoundError(), id);
  }

  // Metadata object used for request information.
  const metadata: Metadata = { id, isNotification };

  try {
    const data = await resolvers[method](params, context, metadata);
    if (isNotification) return; // Do not encode response for notifications.
    return success(data, id);
  } catch (err) {
    return failure(
      {
        code: typeof err.code === "number" ? err.code : -32603,
        message: err.message || "Internal error",
        data: err.data,
      },
      id
    );
  }
}

/**
 * Create a JSON RPC request handler.
 */
export function createServer<T extends Methods, C = void>(
  resolvers: Resolvers<T, C>
) {
  return async function rpcServer(payload: unknown, context: C) {
    if (Array.isArray(payload)) {
      if (payload.length === 0) {
        return failure(new InvalidRequestError(), null);
      }

      const results = await Promise.all(
        payload.map((x) => processRequest(resolvers, x, context))
      );

      return results.filter((x): x is
        | JsonRpcSuccess<any>
        | JsonRpcFailure<any> => {
        return x !== undefined;
      });
    }

    return processRequest(resolvers, payload, context);
  };
}

/**
 * Map methods to valid client methods.
 */
export type ClientRequest<T extends Methods> = {
  [K in keyof T]: {
    method: K;
    params: T[K]["request"];
    async?: boolean;
  };
}[keyof T & string];

/**
 * Map client requests to response types.
 */
export type ClientResponse<
  T extends Methods,
  P extends ClientRequest<T>
> = P["async"] extends true ? undefined : T[P["method"]]["response"];

/**
 * Create a JSON RPC request client.
 */
export function createClient<T extends Methods, C = void>(
  send: (
    data: JsonRpcRequest<string, unknown> | JsonRpcRequest<string, unknown>[],
    context: C
  ) => Promise<unknown>
) {
  let counter = 0;
  const jsonrpc = "2.0";

  function prepare<U extends ClientRequest<T>>(payload: U) {
    const { method, params, async } = payload;
    const id = async ? undefined : counter++;

    const process = (body: unknown): unknown => {
      if (body === undefined) {
        if (async) return undefined;

        return new RpcError("Invalid response", -1, undefined);
      }

      if (body === null || typeof body !== "object" || Array.isArray(body)) {
        return new RpcError("Invalid response", -1, undefined);
      }

      const { result, error } = body as Record<string, any>;

      if (result === undefined && error === undefined) {
        return new RpcError("Invalid response", -1, undefined);
      }

      if (error !== undefined) {
        return new RpcError(
          String(error?.message || "Error"),
          Number(error?.code) || 0,
          error?.data
        );
      }

      return result;
    };

    return { method, params, id, process };
  }

  async function rpcClient<P extends ClientRequest<T>>(
    payload: P,
    context: C
  ): Promise<ClientResponse<T, P>> {
    const { params, id, method, process } = prepare(payload);
    const data = await send({ jsonrpc, method, params, id }, context);
    const response = process(data) as any;
    if (response instanceof RpcError) throw response; // Throw RPC errors.
    return response;
  }

  rpcClient.many = async <P extends ClientRequest<T>[]>(
    payload: P,
    context: C
  ): Promise<
    {
      [K in keyof P]: K extends number
        ? ClientResponse<T, P[K]> | RpcError
        : P[K];
    }
  > => {
    const items = payload.map(prepare);

    const data = await send(
      items.map(
        ({ method, params, id }): JsonRpcRequest<string, unknown> => ({
          jsonrpc,
          method,
          params,
          id,
        })
      ),
      context
    );

    if (!Array.isArray(data)) {
      throw new RpcError("Invalid response", -1, undefined);
    }

    // Return items in the order they were sent.
    const lookup = new Map(data.map((data) => [data.id, data]));
    return items.map((item) => item.process(lookup.get(item.id))) as any;
  };

  return rpcClient;
}
