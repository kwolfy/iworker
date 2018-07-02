enum FnDefType {
  PureFunction = 'PureFunction',
  Arrow = 'Arrow',
  EnhancedObjectLiteral = 'EnhancedObjectLiteral',
  Unknown = 'Unknown'
}

export function searializeSchema(obj: {[key: string]: Function}) {
  const schema = [];
  for(const key of Object.keys(obj)) {
    const fn = obj[key];
    const fnType = parseFnType(fn);

    if(fnType === FnDefType.EnhancedObjectLiteral) {
      schema.push(fn.toString());
    } else {
      schema.push(`${key}: ${fn.toString()}`);
    }
  }

  return `{${schema.join(',')}}`;
}

function parseFnType(fn: Function): FnDefType {
  const fnStr = fn.toString();
  let m = fnStr.substr(0, fnStr.indexOf('(')).trim().split(' ');

  m = m.filter(i => i.length && ['*', 'async'].indexOf(i) === -1);

  if(!m.length) {
    return FnDefType.Arrow;
  }

  if(m.indexOf('function') > -1) {
    return FnDefType.PureFunction;
  }

  if(m.length > 0) {
    return FnDefType.EnhancedObjectLiteral;
  }

  return FnDefType.Unknown;
}