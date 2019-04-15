export interface CallHandler {
  res(arg: any): void
  rej(arg: any): void
  onEvent(eventName: string, ...args: any[]): void
}

export enum MessageSendType {
  Call = 1,
  Event = 2
}

export enum MessageReturnType {
  CallResult = 1,
  CallEvent = 2,
  PureEvent = 3
}

export interface ISendMessage {
  type: MessageSendType,
  payload: ICallPayload | IPureEventPayload
}


export interface ICallPayload {
  id: number
  method: string
  args: any[]
}

export interface IReturnMessage {
  type: MessageReturnType,
  payload: ICallEventPayload | ICallResultPayload | IPureEventPayload
}

export enum ResultType {
  Success = 1,
  Error = 2
}

export interface ISerializedError {}

export interface ICallResultPayload {
  type: ResultType,
  id: number,
  err?: ISerializedError,
  data?: any
}

export interface ICallEventPayload {
  id: number,
  eventName: string,
  args: any[]
}

export interface IPureEventPayload {
  eventName: string,
  args: any[]
}

export interface IEventHandler {
  (eventName: string, ...args: any[]): void
}
