import * as EventEmitter from 'events';
import * as path from 'path';
import * as fs from 'fs';

import {
  CallHandler,
  ICallEventPayload,
  ICallResultPayload, IEventHandler,
  IPureEventPayload,
  IReturnMessage,
  MessageReturnType, MessageSendType, ResultType
} from "./shared";
import {ThreadClient} from "./worker";
import {searializeSchema} from "./util";

const w = require('worker_threads');

export interface IPureWorkerFunc {
  (...args: any[]): PromiseLike<any>
}

export interface IObjectSchema {
  [key: string]: IPureWorkerFunc
}

export interface ISchemaFactory {
  (worker: ThreadClient)
}

export class WorkerGroup {
  private _workers: Thread[] = [];

  newThread<T>(source: string | ISchemaFactory | IObjectSchema, workerData = {}): T & Thread {
    let isEval = !(typeof source === 'string');
    if(typeof source === 'object') {
      source = this.makeObjectSchemaSourceWrapper(source);
    } else if(typeof source === 'function') {
      source = this.makeFactorySourceWrapper(source);
    }

    const worker = new w.Worker(source, { eval: isEval, workerData });
    const thread = new Thread(this, worker);
    this.workers.push(thread);

    return new Proxy(thread, {
      get(target, prop) {
        if(target[prop])
          return target[prop];
        else if(typeof prop === 'string') {
          return (...args: any[]) => thread.call(prop as string, ...args);
        }
      }
    }) as any;
  }

  private makeObjectSchemaSourceWrapper(source: IObjectSchema) {
    const schema = searializeSchema(source)

    return this.makeSourceWrapper(`
      const schema = ${schema};
      console.log('schema', schema);
      for(let key of Object.keys(schema)) {
        console.log(schema[key]);
        worker.method(key, schema[key]);
      }
    `);
  }

  private makeFactorySourceWrapper(source: ISchemaFactory) {
    const fn = source.toString();
    return this.makeSourceWrapper(`(${fn})(worker);`);
  }

  private makeSourceWrapper(source: string): string {
    const threadClientSource = path.join(__dirname, '../lib');

    return `
      const { ThreadClient } = require("${threadClientSource}");
      const worker = new ThreadClient();
      ${source}
    `;
  }


  killOne(thread: Thread) {
    thread.terminate();
    this._workers = this.workers.filter(w => w === thread);
  }

  get workers() {
    return this._workers;
  }
}



export class Thread {
  private counter = 1;
  private callHandlers = new Map<number, CallHandler>();
  private emitter = new EventEmitter();

  constructor(private wg: WorkerGroup, private worker: any) {
    worker.on('message', this.onMessage.bind(this));
  }

  private onMessage(msg: IReturnMessage) {
    if(msg.type === MessageReturnType.CallEvent) {
      this.onCallEvent(msg.payload as ICallEventPayload);
    } else if(msg.type === MessageReturnType.CallResult) {
      this.onCallResult(msg.payload as ICallResultPayload);
    } else if(msg.type === MessageReturnType.PureEvent) {
      this.onPureEvent(msg.payload as IPureEventPayload);
    } else {
      console.warn('Wrong answer type from worker %s', msg.type);
    }
  }

  private onCallEvent(data: ICallEventPayload) {
    const handler: CallHandler = this.callHandlers[data.id];
    handler.onEvent(data.eventName, ...data.args);
  }

  private onCallResult(data: ICallResultPayload) {
    const handler: CallHandler = this.callHandlers[data.id];
    this.callHandlers.delete(data.id);

    if(data.type === ResultType.Success) {
      handler.res(data.data);
    } else {
      handler.rej(data.err);
    }
  }

  private onPureEvent(data: IPureEventPayload) {
    this.emitter.emit(data.eventName, ...data.args);
  }

  call(method: string, ...args: any[]) {
    return new CallPromise(this, method, args);
  }

  _call(method: string, args: any[], transferList?: any[], onEvent?: IEventHandler) {
    const id = this.counter++;

    return new Promise((res, rej) => {
      this.callHandlers[id] = { res, rej, onEvent: onEvent || function() {} };
      this.worker.postMessage({ type: MessageSendType.Call, payload: { id, method, args } }, transferList);
    });
  }

  emit(eventName: string, args: any[]) {
    this.worker.postMessage({ type: MessageSendType.Event, payload: { eventName, args } });
  }

  on(eventName: string, handler: (...args: any[]) => void) {
    this.emitter.on(eventName, handler);
  }

  off(eventName: string, handler: (...args: any[]) => void) {
    this.emitter.off(eventName, handler);
  }

  terminate() {
    this.worker.terminate();
  }
}

export interface ICallPromise<T> extends PromiseLike<T> {
  withTransferList(transferList: any[]): this
  on(eventName: string, handler: (...args: any[]) => any): this
}

class CallPromise<T = any> implements ICallPromise<T>{
  private handlers = new Map<string, Function[]>();
  private transferList: any[];
  private called = false;

  private res: (value?: T | PromiseLike<T>) => void;
  private rej: (reason?: any) => void;
  private readonly promise: Promise<T>;

  constructor(
    private thread: Thread, private methodName: string,
    private args: any[]) {
    this.promise = new Promise((resolve, reject) => {
      this.res = resolve;
      this.rej = reject;
    });
  }


  withTransferList(list: any[]) {
    console.log('withTransferList');
    this.transferList = list;
    return this;
  }

  on(eventName: string, handler: (...args: any[]) => void) {
    if(!this.handlers[eventName]) {
      this.handlers[eventName] = [];
    }
    this.handlers[eventName].push(handler);

    return this;
  }

  then(fn: (value: any) => any) {
    if(!this.called) {
      this.called = true;
      const promise = this.thread._call(this.methodName, this.args, this.transferList, this.handleEvents.bind(this));
      promise.then(this.res).catch(this.rej);
    }

    return this.promise.then(fn);
  }

  catch(fn: (value: any) => any) {
    return this.promise.catch(fn);
  }

  private handleEvents(eventName: string, ...args: any[]) {
    if(this.handlers[eventName]) {
      for(const handler of this.handlers[eventName]) {
        handler(...args);
      }
    }
  }

  readonly [Symbol.toStringTag]: "Promise";
}