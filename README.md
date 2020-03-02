# JSON RPC

[![NPM version][npm-image]][npm-url]
[![NPM downloads][downloads-image]][downloads-url]
[![Build status][travis-image]][travis-url]
[![Test coverage][coveralls-image]][coveralls-url]

> Tiny, type-safe [JSON-RPC 2.0](https://www.jsonrpc.org/specification) implementation.

## Installation

```sh
npm install @borderlesslabs/json-rpc --save

# Peer dependencies.
npm install io-ts fp-ts --save
```

## Usage

This package makes no assumptions about the transportation layer, for client or server.

### Methods

The methods definition uses [`io-ts`](https://github.com/gcanti/io-ts) to encode and decode requests or responses.

```ts
import * as t from "io-ts";

const methods = {
  hello: {
    // `request` is required, even when empty.
    request: t.type({}),
    response: t.string
  },
  echo: {
    // Specify `request` parameters as keys of the object.
    request: t.type({ arg: t.string }),
    response: t.string
  }
};
```

### Server

The server takes the methods and a dictionary of matching resolvers.

```ts
import { createClient } from "@borderlesslabs/json-rpc";

const server = createServer(methods, {
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

The client takes the methods and a function to `send` the JSON-RPC request.

```ts
import { createClient } from "@borderlesslabs/json-rpc";

const client = createClient(methods, async x => {
  const res = await fetch("...", {
    method: "POST",
    body: JSON.stringify(x),
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
