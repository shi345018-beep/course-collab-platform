'use strict';
/**
 * 架构约束检查（C1、C2、C9、C10）
 * 运行：node tools/arch-check.js
 * 退出码非 0 表示存在违规。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const builtins = new Set([
  'fs', 'path', 'http', 'https', 'crypto', 'os', 'url', 'util',
  'events', 'stream', 'zlib', 'child_process', 'net', 'querystring'
]);

const errors = [];
const warnings = [];

function walk(dir, out) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.js')) out.push(full);
  }
}

function relOf(file) {
  return path.relative(SRC, file).split(path.sep).join('/');
}

function importsOf(file) {
  const text = fs.readFileSync(file, 'utf8');
  const specs = [];
  const re = /(?:require\s*\(\s*['"]([^'"]+)['"]\s*\)|from\s+['"]([^'"]+)['"])/g;
  let m;
  while ((m = re.exec(text)) !== null) specs.push(m[1] || m[2]);
  return specs;
}

function resolveTarget(fromFile, spec) {
  const base = path.resolve(path.dirname(fromFile), spec);
  const candidates = [base, base + '.js', path.join(base, 'index.js')];
  for (const c of candidates) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  }
  return base;
}

function checkFile(file) {
  const rel = relOf(file);
  const isDomain = rel.startsWith('domain/');
  const isHttp = rel.startsWith('http/');
  const isModule = rel.startsWith('modules/');
  const isRepo = rel.includes('/repository');
  const isService = rel.endsWith('/service.js');
  const isController = rel.endsWith('/controller.js');

  for (const spec of importsOf(file)) {
    if (!spec.startsWith('.')) {
      const name = spec.replace(/^node:/, '').split('/')[0];
      if (!builtins.has(name)) {
        errors.push(`[C9] ${rel} 引入了非内置依赖 "${spec}"`);
      }
      continue;
    }
    const target = relOf(resolveTarget(file, spec));
    if (isDomain && !target.startsWith('domain/')) {
      errors.push(`[C2] ${rel} 的 domain 层引用了层外文件 ${target}`);
    }
    if (isService && target.startsWith('http/')) {
      errors.push(`[C1] ${rel} 的业务层引用了 HTTP 层 ${target}`);
    }
    if (isController && target.includes('/repository')) {
      errors.push(`[C1] ${rel} 的 controller 绕过 service 引用了 ${target}`);
    }
    if (isRepo && (target.startsWith('http/') || target.includes('/service') || target.includes('/controller'))) {
      errors.push(`[C1] ${rel} 的 repository 反向引用了 ${target}`);
    }
    if (isHttp && target.includes('/repository')) {
      errors.push(`[C1] ${rel} 的 HTTP 层直接引用了 ${target}`);
    }
    if (isModule && target.startsWith('http/')) {
      errors.push(`[C1] ${rel} 的模块层反向引用了 HTTP 层 ${target}`);
    }
  }
}

function checkPackage() {
  const pkgPath = path.join(ROOT, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    errors.push('[C9] 缺少 package.json');
    return;
  }
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const deps = Object.keys(pkg.dependencies || {});
  const devDeps = Object.keys(pkg.devDependencies || {});
  if (deps.length || devDeps.length) {
    errors.push(`[C9] package.json 存在第三方依赖：${deps.concat(devDeps).join(', ')}`);
  }
}

function checkFrontend() {
  const appJs = path.join(ROOT, 'public', 'app.js');
  if (!fs.existsSync(appJs)) return;
  const text = fs.readFileSync(appJs, 'utf8');
  const hits = (text.match(/fetch\s*\(/g) || []).length;
  if (hits > 0) {
    warnings.push(`[C10] public/app.js 仍有 ${hits} 处直接 fetch，待迁移到 api-client`);
  }
}

function main() {
  const files = [];
  walk(SRC, files);
  if (!files.length) {
    warnings.push('src/ 下暂无源码，检查已完成但没有可扫描文件');
  }
  files.forEach(checkFile);
  checkPackage();
  checkFrontend();

  console.log('架构约束检查');
  console.log('  源文件：' + files.length);
  console.log('  错误：' + errors.length + '  警告：' + warnings.length);
  errors.forEach((e) => console.log('  ✗ ' + e));
  warnings.forEach((w) => console.log('  ! ' + w));
  if (errors.length) {
    console.log('\n检查未通过。');
    process.exit(1);
  }
  console.log('\n检查通过。');
}

main();
