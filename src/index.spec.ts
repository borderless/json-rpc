import * as t from "io-ts";
import { createRpc, parse } from "./index";
import { isLeft, isRight } from "fp-ts/lib/Either";

describe("json rpc", () => {
  const rpc = createRpc(
    {
      hello: {
        request: t.type({}),
        response: t.string
      },
      echo: {
        request: t.type({ arg: t.string }),
        response: t.string
      }
    },
    {
      hello: _ => "Hello World!",
      echo: ({ arg }) => arg
    }
  );

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

  describe("rpc", () => {
    describe("object", () => {
      it("should respond", async () => {
        const res = await rpc({
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
        const res = await rpc({
          jsonrpc: "2.0",
          method: "hello"
        });

        expect(res).toEqual(undefined);
      });

      it("should accept an array of parameters", async () => {
        const res = await rpc({
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
        const res = await rpc({
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
        const res = await rpc([
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
        const res = await rpc(123);

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
        const res = await rpc({});

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
        const res = await rpc([]);

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
        const res = await rpc({
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
        const res = await rpc({
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
        const res = await rpc({
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
        const res = await rpc({
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
        const res = await rpc({
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
        const res = await rpc({
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
});
