## IWorker

Promise-based wrapper for worker_threads

**Warning: worker_threads is experimental**
>Stability: 1 - Experimental. This feature is still under active development and subject to non-backwards compatible changes, or even removal, in any future version. Use of the feature is not recommended in production environments. Experimental features are not subject to the Node.js Semantic Versioning model.


## Install

```bash
npm install iworker
```

## Using

```js
const { WorkerGroup } = require('iworker');
const wg = new WorkerGroup();
```

**Object schema based**

Just put object schema with methods and magical iworker do others 

```js
const worker = wg.newThread({
  async foo(bar, baz) {
    return 'foo' + bar + baz;
  }
});


await worker.foo('bar', 'baz'); // foobarbaz

```

**Factory based**

You can define methods from factory-function

```js
const worker = wg.newThread((worker) => {
  const crypto = require('crypto');
  
  worker.def('randomBytes', async (size) => {
    return crypto.randomBytes(size);
  });
});


await worker.randomBytes(32); // Buffer(32) 
```

**Emit events during execution**

When you want to send some events during the execution of the function

```js
const worker = wg.newThread({
  async foo() {
    this.sendEvent('started');
    this.sendEvent('progress', 99);
    return 'bar';
  }
});


const res = await worker.foo()
  .on('started', () => {
    // do some job
  })
  .progress('progress', (per) => {
    // do some job
  });
  
// res - "baz"
```

**Send transferable objects**

Instead of copying data, you can move them using Worker Transferable Objects

```js
const worker = wg.newThread({
  async foo(buf) { return buf.toString('hex')}
});

const buf = Buffer.from('Hello', 'utf8');
const hex = buf.toString('hex');

const res = await worker.foo(buf).withTransferList([buf.buffer]);
assert.strictEqual(res, hex);
assert.strictEqual(buf.length, 0);

```

**Return transferable objects from worker**

```js
const worker = wg.newThread({
  async foo() { 
    const buf = Buffer.from('hello', 'utf8');
    this.setTransferList([buf.buffer]);
    return buf;
  }
});

const buf = await worker.foo();

```


**Pure event-emitter**

You can use iworker as pure event-emitter

```js
const worker = wg.newThread((w) => {
  w.on('event', (...args) => w.emit('eventBack', 'arg1', 'arg2'));
});

worker.on('eventBack', (arg1, arg2) => {
  // some code
});

worker.emit('event', 'arg');

```

