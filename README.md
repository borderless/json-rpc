# JSON RPC

[![NPM version][npm-image]][npm-url]
[![NPM downloads][downloads-image]][downloads-url]
[![Build status][travis-image]][travis-url]
[![Test coverage][coveralls-image]][coveralls-url]

> Tiny, mostly compliant [JSON-RPC 2.0](https://www.jsonrpc.org/specification) implementation.

This package intentionally doesn't implement the "arguments" form of request parameters. This is when the input `params` can be an object or an ordered array representing the object. Instead, you can pass _any_ JSON params over the wire.

## Installation

```sh
npm install @borderlesslabs/json-rpc --save
```

## Usage

This package makes no assumptions about the transportation layer, for client or server.

### Methods

```ts
type Methods = {
  hello: {
    request: {};
    response: string;
  };
  echo: {
    request: { arg: string };
    response: string;
  };
};
```

### Server

The server accepts a dictionary of resolvers.

```ts
import { createClient } from "@borderlesslabs/json-rpc";

const server = createServer<Methods>({
  hello: _ => "Hello World!",
  echo: ({ arg }) => arg
});

const res = await server({
  jsonrpc: "2.0",
  id: "test",
  method: "hello"
}); //=> { jsonrpc: "2.0", id: "test", result: "Hello World!" }
```

### Client

The client accepts a function to `send` the JSON-RPC request.

```ts
import { createClient } from "@borderlesslabs/json-rpc";

const client = createClient(async payload => {
  const res = await fetch("...", {
    method: "POST",
    body: JSON.stringify(payload),
    headers: {
      "Content-Type": "application/json"
    }
  });

  return res.json();
});

const result = await client({
  method: "hello",
  params: {}
}); //=> "Hello World!"

const results = await client.many([
  {
    method: "hello",
    params: {}
  },
  {
    method: "echo",
    params: { arg: "Test" }
  }
]); //=> ["Hello World!", "Test"]
```

## License

MIT

[npm-image]: https://img.shields.io/npm/v/@borderlesslabs/json-rpc.svg?style=flat
[npm-url]: https://npmjs.org/package/@borderlesslabs/json-rpc
[downloads-image]: https://img.shields.io/npm/dm/@borderlesslabs/json-rpc.svg?style=flat
[downloads-url]: https://npmjs.org/package/@borderlesslabs/json-rpc
[travis-image]: https://img.shields.io/travis/BorderlessLabs/json-rpc.svg?style=flat
[travis-url]: https://travis-ci.org/BorderlessLabs/json-rpc
[coveralls-image]: https://img.shields.io/coveralls/BorderlessLabs/json-rpc.svg?style=flat
[coveralls-url]: https://coveralls.io/r/BorderlessLabs/json-rpc?branch=master
