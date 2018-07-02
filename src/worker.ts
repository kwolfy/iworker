import {
  ICallPayload, ICallResultPayload,
  IPureEventPayload,
  IReturnMessage,
  ISendMessage,
  MessageReturnType,
  MessageSendType,
  ResultType
} from "./shared";
import * as EventEmitter from 'events';

const w = require('worker_threads');

interface IMethodHandler {
  (...args: any[]): Promise<any>
}

interface IPort {
  postMessage(msg: IReturnMessage)
  on(eventName: string, handler: (msg: ISendMessage) => any)
}

export class ThreadClient {
  private handlers = new Map<string, IMethodHandler>();
  private port: IPort;
  private emitter = new EventEmitter();

  constructor() {
    this.port = w.parentPort;
    this.port.on('message', this.onMessage.bind(this));
  }

  private onMessage(msg: ISendMessage) {
    if(msg.type === MessageSendType.Call) {
      this.onCallMethod(msg.payload as ICallPayload);
    } else if(msg.type === MessageSendType.Event) {
      this.onPureEvent(msg.payload as IPureEventPayload);
    } else {
      console.warn('Wrong message type %s', msg.type);
    }
  }

  private async onCallMethod(data: ICallPayload) {
    const handler = this.handlers[data.method];
    if(!handler) {
      const err = new UnhandledMethodError(`Method ${data.method} is unhandled`);
      return this.returnCallError(data.id, err);
    }

    try {
      const res = await handler.bind({ sendEvent: this.callEventFactory(data.id) })(...data.args);
      return this.returnCallSuccess(data.id, res);
    } catch (e) {
      return this.returnCallError(data.id, e);
    }

  }

  private returnCallSuccess(id: number, data: any) {
    const payload = { type: ResultType.Success, id, data, err: null };
    this.port.postMessage({ type: MessageReturnType.CallResult, payload });
  }

  private returnCallError(id: number, err: any) {
    const payload = { type: ResultType.Error, id, err: serializeError(err) };
    this.port.postMessage({ type: MessageReturnType.CallResult, payload });
  }

  private callEventFactory(id: number) {
    return (eventName: string, ...args: any[]) => {
      const payload = { id, eventName, args };
      this.port.postMessage({ type: MessageReturnType.CallEvent, payload });
    };
  }


  private onPureEvent(data: IPureEventPayload) {
    this.emitter.emit(data.eventName, ...data.args);
  }

  on(eventName: string, handler: (...args: any[]) => any) {
    return this.emitter.on(eventName, handler);
  }

  off(eventName: string, handler: (...args: any[]) => any) {
    return this.emitter.off(eventName, handler);
  }

  method(name: string, handler:IMethodHandler): ThreadClient {
    this.handlers[name] = handler;
    return this;
  }
}


class UnhandledMethodError extends Error {}

function serializeError(err: any) {
  if(!err) {
    err = new Error('Unknown error');
  }

  if(err.stack) {
    return { stack: err.stack, message: err.message, name: err.name };
  }

  return err;
}

