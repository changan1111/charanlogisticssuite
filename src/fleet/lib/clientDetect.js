import { NAMED_CLIENTS, OTHER_CLIENT, CLIENT_CONFIG } from './constants';

export function detectClientEntry(note = '') {
  const u = note.toUpperCase();
  for (const c of NAMED_CLIENTS) {
    if (u.includes(c.keyword.toUpperCase())) return c;
  }
  return OTHER_CLIENT;
}

export function detectClient(note = '') {
  return detectClientEntry(note).key;
}

export function clientByKey(key) {
  return CLIENT_CONFIG.find(x => x.key === key) || OTHER_CLIENT;
}
