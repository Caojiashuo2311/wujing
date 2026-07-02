// ===== Server-backed key-value store (persists to MySQL) =====
const Store = {
  _cache: {},
  async load() {
    try {
      const res = await fetch('/api/storage');
      const data = await res.json();
      this._cache = data.data || {};
    } catch (e) {
      console.error('Store load failed:', e);
      this._cache = {};
    }
  },
  get(key) {
    return Object.prototype.hasOwnProperty.call(this._cache, key) ? this._cache[key] : null;
  },
  set(key, value) {
    this._cache[key] = value;
    return fetch('/api/storage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: key, value: value })
    }).catch(e => console.error('Store save failed:', e));
  },
  remove(key) {
    delete this._cache[key];
    return fetch('/api/storage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: key, value: null })
    }).catch(e => console.error('Store remove failed:', e));
  }
};
