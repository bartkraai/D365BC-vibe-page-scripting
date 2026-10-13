'use strict';

const fs = require('fs');
const path = require('path');
const { safeProjectName } = require('./project-folders');

function createPaths(root = process.env.PAGE_SCRIPTING_ROOT || path.resolve(__dirname, '..')) {
  const pageScripting = path.resolve(process.env.PAGE_SCRIPTING || path.join(root, 'page-scripting'));
  const workflows = path.resolve(process.env.WORKFLOWS || path.join(pageScripting, 'workflows'));
  const library = path.resolve(process.env.LIBRARY || path.join(pageScripting, 'script-library'));
  const catalog = path.join(pageScripting, 'catalog.json');

  function resolveWorkflowDir(name) {
    return resolveInside(workflows, safeProjectName(name), false);
  }

  function resolveInside(rootDir, relativePath = '.', mustExist = true) {
    const rootReal = fs.realpathSync(rootDir);
    const candidate = path.resolve(rootReal, relativePath);
    const target = mustExist ? fs.realpathSync(candidate) : candidate;
    const relative = path.relative(rootReal, target);
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new PathError('Path is outside its allowed root');
    }
    return target;
  }

  return { ROOT: root, PAGE_SCRIPTING: pageScripting, WORKFLOWS: workflows, LIBRARY: library, CATALOG: catalog, resolveWorkflowDir, resolveInside };
}

class PathError extends Error {
  constructor(message) { super(message); this.name = 'PathError'; this.status = 400; }
}

const paths = createPaths();
module.exports = { ...paths, createPaths, PathError };
