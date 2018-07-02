const w = require('worker_threads');
const path = require('path')
import {WorkerGroup, ICallPromise} from './';
const fs = require('fs');


interface IThread {
  foo(bar: string): ICallPromise<string>
}

(async () => {
  const wg = new WorkerGroup();
  //const worker = wg.newThread<IThread>(path.resolve('client.js'));
  const worker = wg.newThread<IThread>({
    async foo(bar: string) {
      return 'foo' + bar;
    }
  });
  const res = await worker.foo('bar');

  console.log('hi', res);

})().catch(e => console.error(e));