export class MockClassList {
  values = new Set();
  add(...names) { for (const name of names) this.values.add(name); }
  contains(name) { return this.values.has(name); }
}

/** A small DOM double for delegated chat events, including listener removal. */
export class MockElement {
  constructor() {
    this.dataset = {};
    this.classList = new MockClassList();
    this.childNodes = [];
    this.hidden = false;
    this.disabled = false;
    this.listeners = new Map();
    this.listenerSets = new Map();
    this.queries = new Map();
    this.attributes = new Map();
    this.textContent = "";
    this.id = "";
  }

  addEventListener(type, listener) {
    if (!this.listenerSets.has(type)) this.listenerSets.set(type, new Set());
    this.listenerSets.get(type).add(listener);
    this.listeners.set(type, (event) => {
      for (const callback of Array.from(this.listenerSets.get(type) ?? [])) callback(event);
    });
  }

  removeEventListener(type, listener) {
    this.listenerSets.get(type)?.delete(listener);
    if (!this.listenerSets.get(type)?.size) this.listeners.delete(type);
  }

  querySelector(selector) { return this.queries.get(selector) ?? null; }
  setAttribute(name, value) { this.attributes.set(name, value); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  append(...nodes) { this.childNodes.push(...nodes); }
  contains(element) {
    return element === this || Array.from(new Set([...this.queries.values(), ...this.childNodes]))
      .some((child) => child === element || child?.contains?.(element));
  }
  matches(selector) {
    const match = selector.match(/^\[data-([a-z-]+)(?:=["']([^"']+)["'])?\]$/);
    if (!match) return false;
    const key = match[1].replace(/-([a-z])/g, (_value, letter) => letter.toUpperCase());
    return Object.hasOwn(this.dataset, key) && (match[2] === undefined || this.dataset[key] === match[2]);
  }
  closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest(selector) ?? null; }
}
