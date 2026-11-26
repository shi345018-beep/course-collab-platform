'use strict';
class Router {
  constructor() {
    this.routes = [];
  }
  add(method, pattern, handler, options) {
    const keys = [];
    const source = '^' + pattern.replace(/:[a-zA-Z]+/g, function (m) {
      keys.push(m.slice(1));
      return '([^/]+)';
    }) + '/?$';
    this.routes.push({
      method: method.toUpperCase(),
      regex: new RegExp(source),
      keys: keys,
      handler: handler,
      publicRoute: !!(options && options.publicRoute)
    });
    return this;
  }
  get(p, h, o) { return this.add('GET', p, h, o); }
  post(p, h, o) { return this.add('POST', p, h, o); }
  match(method, pathname) {
    for (const route of this.routes) {
      if (route.method !== method.toUpperCase()) continue;
      const m = route.regex.exec(pathname);
      if (!m) continue;
      const params = {};
      route.keys.forEach(function (key, index) { params[key] = decodeURIComponent(m[index + 1]); });
      return { route: route, params: params };
    }
    return null;
  }
}
module.exports = { Router };
