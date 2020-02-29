import * as t from "io-ts";
import { createServer, parse, createClient, RpcError } from "./index";
import { isLeft, isRight } from "fp-ts/lib/Either";

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

  const server = createServer(methods, {
    hello: _ => "Hello World!",
    echo: ({ arg }) => arg
  });

  const client = createClient(methods, x => server(x, undefined));

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
    });

    describe("batch", () => {
      it("should make a batch request", async () => {
        const result = await client.batch(
          { method: "hello", params: {} },
          { method: "echo", params: { arg: "test" } }
        );

        expect(result).toEqual(["Hello World!", "test"]);
      });

      it("should make a batch notification request", async () => {
        const result = await client.batch(
          { method: "hello", params: {}, async: true },
          { method: "echo", params: { arg: "test" }, async: true }
        );

        expect(result).toEqual([undefined, undefined]);
      });

      it("should handle mixed batch responses", async () => {
        const result = await client.batch(
          { method: "hello", params: {}, async: true },
          { method: "echo", params: { arg: "test" } },
          { method: "hello", params: {}, async: true }
        );

        expect(result).toEqual([undefined, "test", undefined]);
      });

      it("should return rpc errors", async () => {
        const result = await client.batch({
          method: "echo",
          params: {} as any
        });

        expect(result.length).toEqual(1);
        expect(result[0]).toBeInstanceOf(RpcError);
      });
    });
  });
});
