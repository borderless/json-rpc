import * as t from "io-ts";
import { isLeft, isRight } from "fp-ts/lib/Either";
import { expectType, TypeEqual } from "ts-expect";
import {
  createServer,
  parse,
  createClient,
  RpcError,
  Resolvers,
  ClientRequests,
  ClientResponse
} from "./index";

describe("json rpc", () => {
  const methods = {
    hello: {
      request: t.type({}),
      response: t.string
    },
    echo: {
      request: t.type({ arg: t.string }),
      response: t.string
    }
  };

  const resolvers: Resolvers<typeof methods> = {
    hello: _ => "Hello World!",
    echo: ({ arg }) => arg
  };

  const server = createServer(methods, resolvers);
  const client = createClient(methods, x => server(x, undefined));

  describe("types", () => {
    type Requests = ClientRequests<typeof methods>;
    type Responses = ClientResponse<typeof methods, Requests>;

    expectType<TypeEqual<Responses, string>>(true);
  });

  describe("parse", () => {
    it("should parse json", () => {
      const result = parse("{}");

      expect(isRight(result)).toEqual(true);

      if (isRight(result)) {
        expect(result.right).toEqual({});
      }
    });

    it("should fail to parse malformed json", () => {
      const result = parse("[");

      expect(isLeft(result)).toEqual(true);

      if (isLeft(result)) {
        expect(result.left).toEqual({ code: -32700, message: "Parse error" });
      }
    });
  });

  describe("server", () => {
    describe("object", () => {
      it("should respond", async () => {
        const res = await server({
          jsonrpc: "2.0",
          id: "test",
          method: "hello"
        });

        expect(res).toEqual({
          jsonrpc: "2.0",
          id: "test",
          result: "Hello World!"
        });
      });

      it("should not respond to notification", async () => {
        const res = await server({
          jsonrpc: "2.0",
          method: "hello"
        });

        expect(res).toEqual(undefined);
      });

      it("should accept an array of parameters", async () => {
        const res = await server({
          jsonrpc: "2.0",
          id: "test",
          method: "echo",
          params: ["test"]
        });

        expect(res).toEqual({
          jsonrpc: "2.0",
          id: "test",
          result: "test"
        });
      });

      it("should accept an object of parameters", async () => {
        const res = await server({
          jsonrpc: "2.0",
          id: "test",
          method: "echo",
          params: { arg: "test" }
        });

        expect(res).toEqual({
          jsonrpc: "2.0",
          id: "test",
          result: "test"
        });
      });
    });

    describe("array", () => {
      it("should respond", async () => {
        const res = await server([
          {
            jsonrpc: "2.0",
            id: 1,
            method: "hello"
          },
          {
            jsonrpc: "2.0",
            id: 2,
            method: "hello"
          }
        ]);

        expect(res).toEqual([
          {
            jsonrpc: "2.0",
            id: 1,
            result: "Hello World!"
          },
          {
            jsonrpc: "2.0",
            id: 2,
            result: "Hello World!"
          }
        ]);
      });
    });

    describe("invalid", () => {
      it("should fail on malformed request", async () => {
        const res = await server(123);

        expect(res).toEqual({
          jsonrpc: "2.0",
          id: null,
          error: {
            code: -32600,
            message: "Invalid request"
          }
        });
      });

      it("should fail on malformed request object", async () => {
        const res = await server({});

        expect(res).toEqual({
          jsonrpc: "2.0",
          id: null,
          error: {
            code: -32600,
            message: "Invalid request"
          }
        });
      });

      it("should fail on empty batch request", async () => {
        const res = await server([]);

        expect(res).toEqual({
          jsonrpc: "2.0",
          id: null,
          error: {
            code: -32600,
            message: "Invalid request"
          }
        });
      });

      it("should fail on invalid request rpc id", async () => {
        const res = await server({
          jsonrpc: "2.0",
          id: {}
        });

        expect(res).toEqual({
          jsonrpc: "2.0",
          id: null,
          error: {
            code: -32600,
            message: "Invalid request"
          }
        });
      });

      it("should fail on fractional numeric request rpc id", async () => {
        const res = await server({
          jsonrpc: "2.0",
          id: 123.5
        });

        expect(res).toEqual({
          jsonrpc: "2.0",
          id: null,
          error: {
            code: -32600,
            message: "Invalid request"
          }
        });
      });

      it("should fail on method not found", async () => {
        const res = await server({
          jsonrpc: "2.0",
          id: "test",
          method: "missing"
        });

        expect(res).toEqual({
          jsonrpc: "2.0",
          id: "test",
          error: {
            code: -32601,
            message: "Method not found"
          }
        });
      });

      it("should fail on missing parameters", async () => {
        const res = await server({
          jsonrpc: "2.0",
          id: "test",
          method: "echo"
        });

        expect(res).toEqual({
          jsonrpc: "2.0",
          id: "test",
          error: {
            code: -32602,
            message:
              "Invalid value undefined supplied to : { arg: string }/arg: string"
          }
        });
      });

      it("should fail on invalid parameters", async () => {
        const res = await server({
          jsonrpc: "2.0",
          id: "test",
          method: "echo",
          params: "test"
        });

        expect(res).toEqual({
          jsonrpc: "2.0",
          id: "test",
          error: {
            code: -32600,
            message: "Invalid request"
          }
        });
      });

      it("should fail on invalid parameters", async () => {
        const res = await server({
          jsonrpc: "2.0",
          id: "test",
          method: "echo",
          params: "test"
        });

        expect(res).toEqual({
          jsonrpc: "2.0",
          id: "test",
          error: {
            code: -32600,
            message: "Invalid request"
          }
        });
      });

      describe("without type checking", () => {
        const server = createServer(methods, resolvers, {
          encode: false,
          decode: false
        });

        it("should succeed", async () => {
          const result = await server({
            jsonrpc: "2.0",
            id: 1,
            method: "hello",
            params: {}
          });

          expect(result).toEqual({
            jsonrpc: "2.0",
            id: 1,
            result: "Hello World!"
          });
        });
      });
    });
  });

  describe("client", () => {
    describe("request", () => {
      it("should make a request", async () => {
        const result = await client({ method: "hello", params: {} });

        expect(result).toEqual("Hello World!");
      });

      it("should make a notification request", async () => {
        const result = await client({
          method: "hello",
          params: {},
          async: true
        });

        expect(result).toEqual(undefined);
      });

      it("should throw rpc errors", async () => {
        await expect(
          client({
            method: "echo",
            params: {} as any
          })
        ).rejects.toBeInstanceOf(RpcError);
      });

      describe("without type checking", () => {
        const client = createClient(methods, x => server(x), {
          encode: false,
          decode: false
        });

        it("should succeed", async () => {
          const result = await client({ method: "hello", params: {} });

          expect(result).toEqual("Hello World!");
        });
      });

      describe("with send options", () => {
        const client = createClient(methods, (_, options: string) =>
          Promise.resolve({ result: options })
        );

        it("should accept options", async () => {
          const result = await client({ method: "hello", params: {} }, "Test");

          expect(result).toEqual("Test");
        });
      });
    });

    describe("many", () => {
      it("should make a many request", async () => {
        const result = await client.many([
          { method: "hello", params: {} },
          { method: "echo", params: { arg: "test" } }
        ]);

        expect(result).toEqual(["Hello World!", "test"]);
      });

      it("should make a many notification request", async () => {
        const result = await client.many([
          { method: "hello", params: {}, async: true },
          { method: "echo", params: { arg: "test" }, async: true }
        ]);

        expect(result).toEqual([undefined, undefined]);
      });

      it("should handle mixed many responses", async () => {
        const result = await client.many([
          { method: "hello", params: {}, async: true },
          { method: "echo", params: { arg: "test" } },
          { method: "hello", params: {}, async: true }
        ]);

        expect(result).toEqual([undefined, "test", undefined]);
      });

      it("should return rpc errors", async () => {
        const result = await client.many([
          {
            method: "echo",
            params: {} as any
          }
        ]);

        expect(result.length).toEqual(1);
        expect(result[0]).toBeInstanceOf(RpcError);
      });
    });
  });
});
