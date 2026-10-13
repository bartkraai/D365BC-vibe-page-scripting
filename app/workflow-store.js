'use strict';
const fs = require('fs');
const path = require('path');
const { readJson, writeJsonAtomic } = require('./json-store');
const { safeProjectName } = require('./project-folders');

class WorkflowError extends Error { constructor(message, status = 400) { super(message); this.name = 'WorkflowError'; this.status = status; } }
function validateWorkflow(workflow, library) {
  if (!workflow || !Array.isArray(workflow.steps)) throw new WorkflowError('workflow.steps must be an array');
  const ids = new Set();
  for (const step of workflow.steps) {
    if (!step?.id || ids.has(step.id)) throw new WorkflowError('Step ids must be unique');
    ids.add(step.id);
    if (step.type !== 'bc-api') {
      if (!step.user) throw new WorkflowError(`Step '${step.id}' requires a user`);
      if (Object.hasOwn(step, 'scriptIds')) {
        if (!Array.isArray(step.scriptIds) || !step.scriptIds.length) throw new WorkflowError(`Step '${step.id}' requires scriptIds`);
        for (const id of step.scriptIds) { try { library.script(id); } catch { throw new WorkflowError(`Step '${step.id}' references unknown script '${id}'`); } }
      } else throw new WorkflowError(`Step '${step.id}' requires scriptIds`);
    }
  }
  for (const step of workflow.steps) if (step.depends_on && !ids.has(step.depends_on)) throw new WorkflowError(`Step '${step.id}' depends on an unknown step`);
  return workflow;
}
function renameWithRetry(source, target) {
  for (let attempt = 0; ; attempt++) {
    try { fs.renameSync(source, target); return; }
    catch (error) {
      if (!['EPERM', 'EACCES', 'EBUSY'].includes(error.code) || attempt >= 4) throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20 * (attempt + 1));
    }
  }
}
class WorkflowStore {
  constructor(workflowsPath, catalogPath) { this.workflowsPath = workflowsPath; this.catalogPath = catalogPath; }
  dir(name) { const safe = safeProjectName(name); const result = path.resolve(this.workflowsPath, safe); if (path.dirname(result) !== path.resolve(this.workflowsPath)) throw new WorkflowError('Invalid workflow name'); return result; }
  list() { if (!fs.existsSync(this.workflowsPath)) return []; return fs.readdirSync(this.workflowsPath, { withFileTypes: true }).filter(x => x.isDirectory()).map(x => ({ name: x.name, hasWorkflow: fs.existsSync(path.join(this.workflowsPath, x.name, 'workflow.json')) })); }
  read(name) { return readJson(path.join(this.dir(name), 'workflow.json')); }
  write(name, workflow, library) { validateWorkflow(workflow, library); writeJsonAtomic(path.join(this.dir(name), 'workflow.json'), workflow); }
  renameWorkflow(oldName, newName) {
    const safeOld = safeProjectName(oldName), safeNew = safeProjectName(newName);
    const source = this.dir(safeOld), target = this.dir(safeNew);
    if (!fs.existsSync(source)) throw new WorkflowError('Workflow not found', 404);
    if (fs.existsSync(target)) throw new WorkflowError('Workflow already exists', 409);
    let catalog;
    if (fs.existsSync(this.catalogPath)) {
      catalog = readJson(this.catalogPath);
      const oldPath = `./${safeOld}`, newPath = `./${safeNew}`;
      for (const type of catalog.types || []) for (const chain of type.value_chains || []) for (const flow of chain.process_flows || []) if (flow.workflow_path === oldPath) flow.workflow_path = newPath;
    }
    renameWithRetry(source, target);
    try { if (catalog) writeJsonAtomic(this.catalogPath, catalog); }
    catch (error) { renameWithRetry(target, source); throw error; }
    return { oldName: safeOld, newName: safeNew };
  }
}
function validateCatalog(catalog, workflowsPath) {
  if (!catalog || !Array.isArray(catalog.types)) throw new WorkflowError('catalog.types must be an array');
  const validateLevel = (items, child) => { const codes = new Set(); for (const item of items) { const code = typeof item?.code === 'string' ? item.code.trim() : ''; if (!item || typeof item.name !== 'string' || !code || codes.has(code.toLocaleLowerCase())) throw new WorkflowError('Catalog names/codes are invalid or duplicate'); codes.add(code.toLocaleLowerCase()); if (child) validateLevel(item[child] || [], child === 'value_chains' ? 'process_flows' : null); else if (item.workflow_path) { const resolved = path.resolve(workflowsPath, item.workflow_path.replace(/^\.\//, '')); const rel = path.relative(workflowsPath, resolved); if (rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) throw new WorkflowError('workflow_path must be inside workflows'); } } };
  validateLevel(catalog.types, 'value_chains'); return catalog;
}
module.exports = { WorkflowStore, WorkflowError, validateWorkflow, validateCatalog };
