'use strict';
/**
 * 前端唯一的数据访问入口（C10）。
 * 页面与视图不得直接调用 fetch；token 与错误处理集中在这里。
 */
(function (global) {
  let token = '';

  function setToken(value) { token = value || ''; }
  function getToken() { return token; }

  async function request(path, options) {
    const init = Object.assign({ headers: {} }, options || {});
    init.headers = Object.assign({ 'Content-Type': 'application/json' }, init.headers);
    if (token) init.headers.Authorization = 'Bearer ' + token;
    if (init.body && typeof init.body !== 'string') init.body = JSON.stringify(init.body);

    const res = await fetch(path, init);
    const json = await res.json().catch(function () {
      return { code: res.status, message: '响应解析失败' };
    });
    if (!res.ok || json.code !== 0) {
      const error = new Error(json.message || ('请求失败 (' + res.status + ')'));
      error.status = res.status;
      if (res.status === 401) {
        token = '';
        global.dispatchEvent(new CustomEvent('auth:expired'));
      }
      throw error;
    }
    return json.data;
  }

  async function download(path, fallbackName) {
    const res = await fetch(path, { headers: token ? { Authorization: 'Bearer ' + token } : {} });
    if (!res.ok) throw new Error('下载失败 (' + res.status + ')');
    const blob = await res.blob();
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = fallbackName || 'download.csv';
    link.click();
    return true;
  }

  global.ApiClient = {
    setToken: setToken,
    getToken: getToken,
    request: request,
    download: download
  };
})(window);
