import { expectType, TypeEqual } from "ts-expect";
import {
  schema,
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
      request: schema.object({}),
      response: schema.string()
    },
    echo: {
      request: schema.object({ arg: schema.string() }),
      response: schema.string()
    }
  };

  const resolvers: Resolvers<typeof methods> = {
    hello: _ => "Hello World!",
    echo: ({ arg }) => arg
  };

  const server = createServer(methods, resolvers);
  const client = createClient(methods, server);

  describe("types", () => {
    type Requests = ClientRequests<typeof methods>;
    type Responses = ClientResponse<typeof methods, Requests>;

    expectType<TypeEqual<Responses, string>>(true);
  });

  describe("parse", () => {
    it("should parse json", () => {
      expect(parse("{}")).toEqual({});
    });

    it("should fail to parse malformed json", () => {
      expect(() => parse("[")).toThrow(SyntaxError);
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
            message: "arg: Non-string type: undefined"
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

      it("should throw on invalid argument", async () => {
        await expect(
          client({
            method: "echo",
            params: {} as any
          })
        ).rejects.toBeInstanceOf(Error);
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

      it("should throw on invalid argument", async () => {
        expect(
          client.many([
            {
              method: "echo",
              params: {} as any
            }
          ])
        ).rejects.toBeInstanceOf(Error);
      });
    });
  });

  describe("intersection types", () => {
    const methods = {
      test: {
        request: schema.intersection(
          schema.object({ url: schema.string() }),
          schema.object({ accept: schema.string().optional() })
        ),
        response: schema.string()
      }
    };

    const server = createServer(methods, {
      test: ({ url, accept }) => `${url}#${accept}`
    });

    const client = createClient(methods, server);

    it("should support intersection types", async () => {
      const result = await client({
        method: "test",
        params: { url: "http://example.com", accept: "json" }
      });

      expect(result).toEqual(`http://example.com#json`);
    });

    it("should support intersection type with optional key", async () => {
      const result = await client({
        method: "test",
        params: { url: "http://example.com" }
      });

      expect(result).toEqual(`http://example.com#undefined`);
    });
  });
});
