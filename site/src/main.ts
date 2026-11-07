import {
  compileSanitizer,
  type Sanitizer,
  type SanitizeResult,
  type SanitizerOptions,
  sanitizeText
} from '@url-sanitize/core';
import { mergedCatalog, mergedMetadata } from '@url-sanitize/merged';

const EXAMPLE = [
  'Saw this, thought of you: https://www.youtube.com/watch?v=dQw4w9WgXcQ&si=AbCdEfGh1234&pp=ygUE',
  '',
  'The recipe (https://example.com/recipes/pasta?utm_source=newsletter&utm_medium=email&fbclid=IwAR0abc)',
  'and the [pan](https://www.amazon.com/dp/B00006JSUA/ref=sr_1_3?crid=2X&keywords=pan&qid=1700000000&tag=friend-20).',
  'Search result: https://www.google.com/url?sa=t&q=https%3A%2F%2Fexample.org%2Fguide%3Fgclid%3Dxyz'
].join('\n');

const input = element<HTMLTextAreaElement>('input');
const output = element<HTMLPreElement>('output');
const summary = element<HTMLParagraphElement>('summary');
const list = element<HTMLOListElement>('urls');
const copy = element<HTMLButtonElement>('copy');
const options = {
  unwrap: element<HTMLInputElement>('opt-unwrap'),
  referral: element<HTMLInputElement>('opt-referral'),
  block: element<HTMLInputElement>('opt-block')
};

// One compiled sanitizer per option set: compiling is the slow part.
const sanitizers = new Map<string, Sanitizer>();

function currentSanitizer(): Sanitizer {
  const opts: SanitizerOptions = {
    unwrapRedirects: options.unwrap.checked,
    stripReferralMarketing: options.referral.checked,
    domainBlocking: options.block.checked
  };
  const key = JSON.stringify(opts);
  let sanitize = sanitizers.get(key);
  if (!sanitize) {
    sanitize = compileSanitizer(mergedCatalog, opts);
    sanitizers.set(key, sanitize);
  }
  return sanitize;
}

function render(): void {
  const text = input.value;
  const result = sanitizeText(text, currentSanitizer());
  output.textContent = result.text;
  output.classList.toggle('empty', text.length === 0);
  if (text.length === 0) output.textContent = 'The clean version appears here.';
  copy.disabled = text.length === 0;
  list.replaceChildren(...result.urls.map(urlItem));
  summary.textContent = describe(result.urls, text.length > 0);
}

function describe(urls: SanitizeResult[], hasText: boolean): string {
  if (!hasText) return '';
  if (urls.length === 0) return 'No http(s) links found.';
  const changed = urls.filter((r) => r.kind === 'cleaned' || r.kind === 'redirected').length;
  const blocked = urls.filter((r) => r.kind === 'blocked').length;
  const parts = [`${urls.length} ${urls.length === 1 ? 'link' : 'links'} found`];
  parts.push(changed === 0 ? 'all already clean' : `${changed} cleaned`);
  if (blocked > 0) parts.push(`${blocked} on a blocked domain`);
  return `${parts.join(', ')}.`;
}

function urlItem(result: SanitizeResult): HTMLLIElement {
  const li = document.createElement('li');
  li.className = `url ${result.kind}`;
  li.append(badge(result.kind));
  const body = document.createElement('div');
  body.className = 'url-body';
  li.append(body);

  switch (result.kind) {
    case 'unchanged':
      body.append(line('', result.url));
      break;
    case 'cleaned': {
      body.append(line('before', result.original), line('after', result.url));
      const chips = document.createElement('p');
      chips.className = 'chips';
      for (const name of result.strippedParams) chips.append(chip(name));
      body.append(chips, rules(result.matchedRules.map((m) => `${m.source} · ${m.provider}`)));
      break;
    }
    case 'redirected':
      body.append(
        line('wrapped', result.original),
        line('target', result.url),
        rules([`${result.via.source} · ${result.via.provider}`])
      );
      break;
    case 'blocked':
      body.append(
        line('', result.original),
        rules([`${result.via.source} · ${result.via.provider}`])
      );
      break;
  }
  return li;
}

function badge(kind: SanitizeResult['kind']): HTMLSpanElement {
  const span = document.createElement('span');
  span.className = 'badge';
  span.textContent = kind;
  return span;
}

function line(label: string, url: string): HTMLParagraphElement {
  const p = document.createElement('p');
  p.className = 'url-line';
  if (label) {
    const tag = document.createElement('span');
    tag.className = 'url-label';
    tag.textContent = label;
    p.append(tag);
  }
  const code = document.createElement('code');
  code.textContent = url;
  p.append(code);
  return p;
}

function chip(name: string): HTMLSpanElement {
  const span = document.createElement('span');
  span.className = 'chip';
  span.textContent = name;
  return span;
}

function rules(names: string[]): HTMLParagraphElement {
  const p = document.createElement('p');
  p.className = 'rules';
  p.textContent = `Rule: ${[...new Set(names)].join(', ')}`;
  return p;
}

function element<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el as T;
}

input.addEventListener('input', render);
for (const box of Object.values(options)) box.addEventListener('change', render);

element<HTMLButtonElement>('example').addEventListener('click', () => {
  input.value = EXAMPLE;
  render();
  input.scrollTop = 0;
  input.setSelectionRange(0, 0);
  input.focus({ preventScroll: true });
});

copy.addEventListener('click', () => {
  const text = sanitizeText(input.value, currentSanitizer()).text;
  navigator.clipboard.writeText(text).then(
    () => flash('Copied'),
    () => flash('Copy failed')
  );
});

function flash(label: string): void {
  copy.textContent = label;
  setTimeout(() => (copy.textContent = 'Copy'), 1200);
}

const sources = mergedMetadata.sources.map((s) => `${sourceName(s.name)} ${s.version}`).join(', ');
element<HTMLParagraphElement>('catalog').textContent =
  `Catalog of ${mergedCatalog.rules.length.toLocaleString('en')} rules from ${sources}, ` +
  `built ${mergedMetadata.generatedAt.slice(0, 10)}.`;

function sourceName(name: string): string {
  return { clearurls: 'ClearURLs', brave: 'Brave', firefox: 'Firefox' }[name] ?? name;
}

render();
input.focus({ preventScroll: true });
