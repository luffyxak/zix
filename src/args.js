// Tiny argv parser tailored to the Zix CLI. No deps.
//
// Supports:
//   zix <command> <positional> --flag value -f value --bool
// Unknown flags become an error so we fail loudly instead of silently dropping.

const FLAG_DEFS = {
  out:      { type: 'string', alias: 'o' },
  password: { type: 'string', alias: 'p' },
  title:    { type: 'string' },
  theme:    { type: 'string' },
  'max-size': { type: 'number' },
  include:  { type: 'list' },
  exclude:  { type: 'list' },
  quiet:    { type: 'bool',   alias: 'q' },
  help:     { type: 'bool',   alias: 'h' },
  version:  { type: 'bool',   alias: 'V' }
};

const ALIAS = Object.fromEntries(
  Object.entries(FLAG_DEFS)
    .filter(([, d]) => d.alias)
    .map(([k, d]) => [d.alias, k])
);

export function parseArgs(argv) {
  const out = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];

    if (tok === '--') {
      out._.push(...argv.slice(i + 1));
      break;
    }

    if (tok.startsWith('--')) {
      const eq = tok.indexOf('=');
      const name = eq === -1 ? tok.slice(2) : tok.slice(2, eq);
      const inlineValue = eq === -1 ? undefined : tok.slice(eq + 1);
      const def = FLAG_DEFS[name];
      if (!def) throw new Error(`Unknown flag: --${name}`);
      i = consume(out, def, name, inlineValue, argv, i);
      continue;
    }

    if (tok.startsWith('-') && tok.length > 1) {
      // collapsed short flags only allowed for bool flags
      const chars = tok.slice(1).split('');
      let consumedNext = false;
      for (let c = 0; c < chars.length; c++) {
        const short = chars[c];
        const long = ALIAS[short];
        if (!long) throw new Error(`Unknown flag: -${short}`);
        const def = FLAG_DEFS[long];
        if (def.type === 'bool') {
          out.flags[long] = true;
        } else {
          if (c !== chars.length - 1) {
            throw new Error(`Flag -${short} expects a value; group only bool flags`);
          }
          i = consume(out, def, long, undefined, argv, i);
          consumedNext = true;
        }
      }
      if (consumedNext) continue;
      continue;
    }

    out._.push(tok);
  }
  return out;
}

function consume(out, def, name, inlineValue, argv, i) {
  if (def.type === 'bool') {
    out.flags[name] = inlineValue === undefined ? true : asBool(inlineValue);
    return i;
  }
  let raw = inlineValue;
  if (raw === undefined) {
    const next = argv[i + 1];
    if (next === undefined || (next.startsWith('-') && next !== '-' && !/^-\d/.test(next))) {
      throw new Error(`Flag --${name} expects a value`);
    }
    raw = next;
    i += 1;
  }
  if (def.type === 'number') {
    const n = Number(raw);
    if (!Number.isFinite(n)) throw new Error(`Flag --${name} expects a number, got '${raw}'`);
    out.flags[name] = n;
  } else if (def.type === 'list') {
    if (!Array.isArray(out.flags[name])) out.flags[name] = [];
    out.flags[name].push(raw);
  } else {
    out.flags[name] = raw;
  }
  return i;
}

function asBool(v) {
  if (v === 'true' || v === '1' || v === 'yes') return true;
  if (v === 'false' || v === '0' || v === 'no') return false;
  throw new Error(`Bad bool value: ${v}`);
}
