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

interface CallMethodChan {
  transferList: any[]
}

interface IPort {
  postMessage(msg: IReturnMessage, transferList?: any[])
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
      const err = new CallUndefinedMethodException(`Method ${data.method} is unhandled`);
      return this.returnCallError(data.id, err);
    }

    const ch = { transferList: [] };

    try {
      const res = await handler.bind(this.makeCallContext(data, ch))(...data.args);
      return this.returnCallSuccess(data.id, res, ch.transferList);
    } catch (e) {
      return this.returnCallError(data.id, e);
    }

  }

  private makeCallContext(data: ICallPayload, ch: CallMethodChan) {
    const self = this;
    return {
      sendEvent(eventName: string, ...args: any[]) {
        const payload = { id: data.id, eventName, args };
        self.port.postMessage({ type: MessageReturnType.CallEvent, payload });
      },

      setTransferList(list: any[] = []) {
        ch.transferList = list;
      }
    };
  }

  private returnCallSuccess(id: number, data: any, transferList: any[] = []) {
    const payload = { type: ResultType.Success, id, data, err: null };
    this.port.postMessage({ type: MessageReturnType.CallResult, payload }, transferList);
  }

  private returnCallError(id: number, err: any) {
    const payload = { type: ResultType.Error, id, err: serializeError(err) };
    this.port.postMessage({ type: MessageReturnType.CallResult, payload });
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

  emit(eventName: string, ...args: any[]) {
    this.port.postMessage({ type: MessageReturnType.PureEvent, payload: { eventName, args } });
  }

  def(name: string, handler:IMethodHandler): ThreadClient {
    this.handlers[name] = handler;
    return this;
  }
}


class CallUndefinedMethodException extends Error {
  constructor(message) {
    super(message);
  }
}

function serializeError(err: any) {
  if(!err) {
    err = new Error('Unknown error');
  }

  if(err.stack) {
    return { stack: err.stack, message: err.message, name: err.name };
  }

  return err;
}

