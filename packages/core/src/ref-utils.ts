import { Source } from './resolve';
import { OasRef } from './typings/openapi';

export function joinPointer(base: string, key: string | number) {
  if (base === '') base = '#/';
  return base[base.length - 1] === '/' ? base + key : base + '/' + key;
}

export function isRef(node: any): node is OasRef {
  return node && typeof node.$ref === 'string';
}

export class Location {
  constructor(public source: Source, public pointer: string) {}

  child(components: (string | number)[] | string | number) {
    return new Location(
      this.source,
      joinPointer(
        this.pointer,
        (Array.isArray(components) ? components : [components]).map(escapePointer).join('/'),
      ),
    );
  }

  key() {
    return { ...this, reportOnKey: true };
  }

  get absolutePointer() {
    return this.source.absoluteRef + (this.pointer === '#/' ? '' : this.pointer);
  }
}

export function unescapePointer(fragment: string): string {
  return decodeURIComponent(fragment.replace(/~1/g, '/').replace(/~0/g, '~'));
}

export function escapePointer<T extends string | number>(fragment: T): T {
  if (typeof fragment === 'number') return fragment;
  return (fragment as string).replace(/~/g, '~0').replace(/\//g, '~1') as T;
}

export function parseRef(ref: string): { uri: string | null; pointer: string[] } {
  const [uri, pointer] = ref.split('#/');
  return {
    uri: uri || null,
    pointer: pointer ? pointer.split('/').map(unescapePointer).filter(Boolean) : [],
  };
}

export function parsePointer(pointer: string) {
  return pointer.substr(2).split('/').map(unescapePointer);
}

export function pointerBaseName(pointer: string) {
  const parts = pointer.split('/');
  return parts[parts.length - 1];
}

export function refBaseName(ref: string) {
  const parts = ref.split(/[\/\\]/); // split by '\' and '/'
  return parts[parts.length - 1].split('.')[0];
}

export function isAbsoluteUrl(ref: string) {
  return ref.startsWith('http://') || ref.startsWith('https://');
}

export function isMappingRef(mapping: string) {
  // TODO: proper detection of mapping refs
  return (
    mapping.startsWith('#') ||
    mapping.startsWith('https://') ||
    mapping.startsWith('./') ||
    mapping.startsWith('../') ||
    mapping.indexOf('/') > -1
  );
}
