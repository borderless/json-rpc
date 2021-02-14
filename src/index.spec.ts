import { expectType, TypeEqual } from "ts-expect";
import {
  createServer,
  parseJSON,
  createClient,
  RpcError,
  Resolvers,
  ClientRequest,
  ClientResponse,
} from "./index";

describe("json rpc", () => {
  type Methods = {
    hello: {
      request: undefined;
      response: string;
    };
    echo: {
      request: { arg: string };
      response: string;
    };
  };

  const resolvers: Resolvers<Methods> = {
    hello: () => "Hello World!",
    echo: ({ arg }) => arg,
  };

  const server = createServer(resolvers);
  const client = createClient((x) => server(x, undefined));

  describe("types", () => {
    type Requests = ClientRequest<Methods>;
    type Responses = ClientResponse<Methods, Requests>;

    expectType<TypeEqual<Responses, string>>(true);
  });

  describe("parse", () => {
    it("should parse json", () => {
      expect(() => parseJSON("{}")).not.toThrow();
    });

    it("should fail to parse malformed json", () => {
      expect(() => parseJSON("[")).toThrow(RpcError);
    });
  });

  describe("server", () => {
    describe("object", () => {
      it("should respond", async () => {
        const res = await server({
          jsonrpc: "2.0",
          id: "test",
          method: "hello",
        });

        expect(res).toEqual({
          jsonrpc: "2.0",
          id: "test",
          result: "Hello World!",
        });
      });

      it("should not respond to notification", async () => {
        const res = await server({
          jsonrpc: "2.0",
          method: "hello",
        });

        expect(res).toEqual(undefined);
      });

      it("should accept an object of parameters", async () => {
        const res = await server({
          jsonrpc: "2.0",
          id: "test",
          method: "echo",
          params: { arg: "test" },
        });

        expect(res).toEqual({
          jsonrpc: "2.0",
          id: "test",
          result: "test",
        });
      });
    });

    describe("array", () => {
      it("should respond", async () => {
        const res = await server([
          {
            jsonrpc: "2.0",
            id: 1,
            method: "hello",
          },
          {
            jsonrpc: "2.0",
            id: 2,
            method: "hello",
          },
        ]);

        expect(res).toEqual([
          {
            jsonrpc: "2.0",
            id: 1,
            result: "Hello World!",
          },
          {
            jsonrpc: "2.0",
            id: 2,
            result: "Hello World!",
          },
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
            message: "Invalid request",
          },
        });
      });

      it("should fail on malformed request object", async () => {
        const res = await server({});

        expect(res).toEqual({
          jsonrpc: "2.0",
          id: null,
          error: {
            code: -32600,
            message: "Invalid request",
          },
        });
      });

      it("should fail on empty batch request", async () => {
        const res = await server([]);

        expect(res).toEqual({
          jsonrpc: "2.0",
          id: null,
          error: {
            code: -32600,
            message: "Invalid request",
          },
        });
      });

      it("should fail on invalid request rpc id", async () => {
        const res = await server({
          jsonrpc: "2.0",
          id: {},
        });

        expect(res).toEqual({
          jsonrpc: "2.0",
          id: null,
          error: {
            code: -32600,
            message: "Invalid request",
          },
        });
      });

      it("should fail on fractional numeric request rpc id", async () => {
        const res = await server({
          jsonrpc: "2.0",
          id: 123.5,
        });

        expect(res).toEqual({
          jsonrpc: "2.0",
          id: null,
          error: {
            code: -32600,
            message: "Invalid request",
          },
        });
      });

      it("should fail on method not found", async () => {
        const res = await server({
          jsonrpc: "2.0",
          id: "test",
          method: "missing",
        });

        expect(res).toEqual({
          jsonrpc: "2.0",
          id: "test",
          error: {
            code: -32601,
            message: "Method not found",
          },
        });
      });
    });
  });

  describe("client", () => {
    describe("request", () => {
      it("should make a request", async () => {
        const result = await client({ method: "hello", params: undefined });

        expect(result).toEqual("Hello World!");
      });

      it("should make a notification request", async () => {
        const result = await client({
          method: "hello",
          params: undefined,
          async: true,
        });

        expect(result).toEqual(undefined);
      });

      it("should throw rpc errors", async () => {
        await expect(
          client({
            method: "echo",
            params: {} as any,
          })
        ).rejects.toBeInstanceOf(RpcError);
      });

      describe("with send context", () => {
        const client = createClient(async (_, context: string) => ({
          result: context,
        }));

        it("should accept options", async () => {
          const result = await client(
            { method: "hello", params: undefined },
            "Test"
          );

          expect(result).toEqual("Test");
        });
      });
    });

    describe("many", () => {
      it("should make a many request", async () => {
        const result = await client.many([
          { method: "hello", params: undefined },
          { method: "echo", params: { arg: "test" } },
        ]);

        expect(result).toEqual(["Hello World!", "test"]);
      });

      it("should make a many notification request", async () => {
        const result = await client.many([
          { method: "hello", params: undefined, async: true },
          { method: "echo", params: { arg: "test" }, async: true },
        ]);

        expect(result).toEqual([undefined, undefined]);
      });

      it("should handle mixed many responses", async () => {
        const result = await client.many([
          { method: "hello", params: undefined, async: true },
          { method: "echo", params: { arg: "test" } },
          { method: "hello", params: undefined, async: true },
        ]);

        expect(result).toEqual([undefined, "test", undefined]);
      });

      it("should return rpc errors", async () => {
        const result = await client.many([
          {
            method: "echo",
            params: {} as any,
          },
        ]);

        expect(result.length).toEqual(1);
        expect(result[0]).toBeInstanceOf(RpcError);
      });
    });
  });
});
