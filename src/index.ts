import { BaseError } from "make-error";
import { TypeOf, Any, TypeC, Errors } from "io-ts";
import { PathReporter } from "io-ts/lib/PathReporter";
import { either } from "fp-ts";

export interface Method<T extends TypeC<any>, U extends Any> {
  request: T;
  response: U;
}

export type Methods = Record<string, Method<TypeC<any>, Any>>;

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
  [K in keyof T]: Resolver<
    TypeOf<T[K]["request"]>,
    TypeOf<T[K]["response"]>,
    C
  >;
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
export interface JsonRpcError<T = never> {
  code: number;
  message: string;
  data?: T;
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

// Define commonly used failure messages.
const INVALID_REQUEST = { code: -32600, message: "Invalid request" };
const METHOD_NOT_FOUND = { code: -32601, message: "Method not found" };
const PARSE_ERROR = { code: -32700, message: "Parse error" };

/**
 * Create a custom RPC error to report issues.
 */
export class RpcError<T = void> extends BaseError {
  constructor(public message: string, public code = -32603, public data: T) {
    super(message);
  }
}

/**
 * Parse raw input into JSON.
 */
export function parse(input: string): either.Either<JsonRpcError, unknown> {
  try {
    const value = JSON.parse(input);
    return either.right(value);
  } catch (err) {
    return either.left(PARSE_ERROR);
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
function failure<T = never>(
  error: JsonRpcError<T>,
  id: JsonRpcId
): JsonRpcFailure<T> | undefined {
  if (id === undefined) return;
  return { jsonrpc: "2.0", error, id };
}

/**
 * Ensure `key` is a property of `obj` in type-safe compatible way.
 */
function has<T extends string>(obj: Record<T, any>, key: string): key is T {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

/**
 * Validate RPC message is correctly formatted and type-safe.
 */
async function processRequest<T extends Methods, C = void>(
  methods: T,
  resolvers: Resolvers<T, C>,
  message: unknown,
  context: C
): Promise<JsonRpcSuccess<any> | JsonRpcFailure<any> | undefined> {
  if (message === null || typeof message !== "object") {
    return failure(INVALID_REQUEST, null);
  }

  const { jsonrpc, method, id, params } = message as Record<string, unknown>;
  const isNotification = id === undefined;

  if (!isJsonRpcId(id)) {
    return failure(INVALID_REQUEST, null);
  }

  if (jsonrpc !== "2.0" || typeof method !== "string") {
    return failure(INVALID_REQUEST, id ?? null);
  }

  if (!has(methods, method)) {
    return failure(METHOD_NOT_FOUND, id);
  }

  let data = undefined;
  const { request, response } = methods[method];

  if (Array.isArray(params)) {
    data = Object.keys(request.props).reduce<any>((obj, key, index) => {
      obj[key] = params[index];
      return obj;
    }, {});
  } else if (params === undefined || typeof params === "object") {
    data = params ?? {};
  } else {
    return failure(INVALID_REQUEST, id);
  }

  const input = request.decode(data);

  if (either.isLeft(input)) {
    return failure(
      {
        code: -32602,
        message: PathReporter.report(input).join("; ")
      },
      id
    );
  }

  // Metadata object used for request information.
  const metadata: Metadata = { id, isNotification };

  try {
    const data = await resolvers[method](input.right, context, metadata);
    if (isNotification) return; // Do not encode response for notifications.
    return success(response.encode(data), id);
  } catch (err) {
    return failure(
      {
        code: typeof err.code === "number" ? err.code : -32603,
        message: err.message || "Internal error",
        data: err.data
      },
      id
    );
  }
}

/**
 * Create a JSON RPC request handler.
 */
export function createServer<T extends Methods, C = void>(
  methods: T,
  resolvers: Resolvers<T, C>
) {
  return async function rpcServer(payload: unknown, context: C) {
    if (Array.isArray(payload)) {
      if (payload.length === 0) {
        return failure(INVALID_REQUEST, null);
      }

      const results = await Promise.all(
        payload.map(x => processRequest(methods, resolvers, x, context))
      );

      return results.filter((x): x is
        | JsonRpcSuccess<any>
        | JsonRpcFailure<any> => {
        return x !== undefined;
      });
    }

    return processRequest(methods, resolvers, payload, context);
  };
}

/**
 * Map methods to valid client methods.
 */
type ClientMethods<T extends Methods> = {
  [K in keyof T]: {
    method: K;
    params: TypeOf<T[K]["request"]>;
    async?: boolean;
  };
}[keyof T & string];

/**
 * Create a JSON RPC request client.
 */
export function createClient<T extends Methods>(
  methods: T,
  send: (
    rpc: JsonRpcRequest<string, unknown> | JsonRpcRequest<string, unknown>[]
  ) => Promise<unknown>
) {
  let counter = 0;
  const jsonrpc = "2.0";

  function prepare<U extends ClientMethods<T>>(payload: U) {
    const { method, params, async } = payload;
    const { request, response } = methods[method];

    return {
      method,
      params: request.encode(params),
      id: async ? undefined : counter++,
      process: (body: unknown): unknown => {
        if (body === undefined) {
          if (async) return undefined;

          throw new RpcError("Invalid response", -1, undefined);
        }

        if (body === null || typeof body !== "object" || Array.isArray(body)) {
          throw new RpcError("Invalid response", -1, undefined);
        }

        const { result, error } = body as Record<string, unknown>;

        if (result) {
          const output = response.decode(result);

          if (either.isLeft(output)) {
            throw new RpcError(
              PathReporter.report(output).join("; "),
              -2,
              output.left
            );
          }

          return output.right;
        }

        if (
          error === null ||
          typeof error !== "object" ||
          Array.isArray(error)
        ) {
          throw new RpcError("Invalid response", -1, undefined);
        }

        const { message, code, data } = error as Record<string, unknown>;
        throw new RpcError(String(message || "Error"), Number(code) || 0, data);
      }
    };
  }

  async function rpcClient<U extends ClientMethods<T>>(
    payload: U
  ): Promise<
    U["async"] extends true ? undefined : TypeOf<T[U["method"]]["response"]>
  > {
    const { params, id, method, process } = prepare(payload);
    const data = await send({ jsonrpc, method, params, id });
    return process(data) as any;
  }

  rpcClient.batch = async <U extends ClientMethods<T>[]>(
    ...payload: U
  ): Promise<
    {
      [K in keyof U]: U[K] extends ClientMethods<T>
        ? U[K]["async"] extends true
          ? undefined
          : TypeOf<T[U[K]["method"]]["response"]>
        : U[K];
    }
  > => {
    const items = payload.map(prepare);

    const data = await send(
      items.map(
        ({ method, params, id }): JsonRpcRequest<string, unknown> => ({
          jsonrpc,
          method,
          params,
          id
        })
      )
    );

    if (!Array.isArray(data)) {
      throw new RpcError("Invalid response", -1, undefined);
    }

    // Return items in the order they were sent.
    const lookup = new Map(data.map(data => [data.id, data]));
    return items.map(item => item.process(lookup.get(item.id))) as any;
  };

  return rpcClient;
}
