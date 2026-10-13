'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { readJson, writeJsonAtomic } = require('./json-store');

class LibraryError extends Error {
  constructor(message, status = 400, details = {}) { super(message); this.name = 'LibraryError'; this.status = status; Object.assign(this, details); }
}

class ScriptLibrary {
  constructor(libraryPath, workflowsPath) { this.libraryPath = libraryPath; this.workflowsPath = workflowsPath; this.indexPath = path.join(libraryPath, 'library.json'); }
  load() {
    if (!fs.existsSync(this.indexPath)) return { schemaVersion: 1, folders: [], scripts: [] };
    const data = readJson(this.indexPath);
    if (!Array.isArray(data.folders) || !Array.isArray(data.scripts)) throw new LibraryError('Invalid library.json', 400);
    return data;
  }
  save(index) { writeJsonAtomic(this.indexPath, index); }
  folder(id) { const item = this.load().folders.find(x => x.id === id); if (!item) throw new LibraryError('Folder not found', 404); return item; }
  script(id) { const item = this.load().scripts.find(x => x.id === id); if (!item) throw new LibraryError('Script not found', 404); return item; }
  assertName(index, name, parentId, exceptId) {
    if (typeof name !== 'string' || !name.trim()) throw new LibraryError('name is required');
    const same = [...index.folders, ...index.scripts].some(item => item.id !== exceptId && ((Object.hasOwn(item, 'folderId') ? item.folderId : item.parentId) ?? null) === (parentId ?? null) && item.name.toLocaleLowerCase() === name.trim().toLocaleLowerCase());
    if (same) throw new LibraryError('Name already exists in this folder', 409);
  }
  assertFolder(index, id) { if (id !== null && !index.folders.some(x => x.id === id)) throw new LibraryError('Parent folder not found', 404); }
  createFolder({ name, parentId = null }) { const index = this.load(); this.assertFolder(index, parentId); this.assertName(index, name, parentId); const folder = { id: `f-${crypto.randomUUID()}`, name: name.trim(), parentId }; index.folders.push(folder); this.save(index); return folder; }
  updateFolder(id, changes) {
    const index = this.load(), folder = index.folders.find(x => x.id === id); if (!folder) throw new LibraryError('Folder not found', 404);
    const parentId = Object.hasOwn(changes, 'parentId') ? changes.parentId : folder.parentId;
    this.assertFolder(index, parentId);
    for (let current = parentId; current; current = index.folders.find(x => x.id === current)?.parentId) if (current === id) throw new LibraryError('Folder move would create a cycle', 409);
    const name = Object.hasOwn(changes, 'name') ? changes.name : folder.name; this.assertName(index, name, parentId, id);
    folder.name = name.trim(); folder.parentId = parentId; this.save(index); return folder;
  }
  deleteFolder(id) { const index = this.load(); if (!index.folders.some(x => x.id === id)) throw new LibraryError('Folder not found', 404); if (index.folders.some(x => x.parentId === id) || index.scripts.some(x => x.folderId === id)) throw new LibraryError('Folder is not empty', 409); index.folders = index.folders.filter(x => x.id !== id); this.save(index); }
  createScript({ name, folderId = null, description = '', fileName, content }) {
    this.validateVersionInput(fileName, content);
    const index = this.load(); this.assertFolder(index, folderId); this.assertName(index, name, folderId);
    const script = { id: `s-${crypto.randomUUID()}`, name: name.trim(), description: String(description), folderId, versions: [] };
    const version = this.newVersion(script, fileName, content);
    try {
      this.writeVersion(script.id, version.version, content);
      script.versions.push(version);
      index.scripts.push(script);
      this.save(index);
      return script;
    } catch (error) {
      fs.rmSync(path.join(this.libraryPath, 'scripts', script.id), { recursive: true, force: true });
      throw error;
    }
  }
  updateScript(id, changes) { const index = this.load(), script = index.scripts.find(x => x.id === id); if (!script) throw new LibraryError('Script not found', 404); const folderId = Object.hasOwn(changes, 'folderId') ? changes.folderId : script.folderId; this.assertFolder(index, folderId); const name = Object.hasOwn(changes, 'name') ? changes.name : script.name; this.assertName(index, name, folderId, id); script.name = name.trim(); script.folderId = folderId; if (Object.hasOwn(changes, 'description')) script.description = String(changes.description || ''); this.save(index); return script; }
  addVersion(id, { fileName, content }) {
    this.validateVersionInput(fileName, content);
    const index = this.load(), script = index.scripts.find(x => x.id === id); if (!script) throw new LibraryError('Script not found', 404);
    const sha256 = crypto.createHash('sha256').update(content).digest('hex'), latest = this.latest(script);
    if (latest?.sha256 === sha256) return { version: latest.version, createdAt: latest.createdAt, unchanged: true };
    const version = this.newVersion(script, fileName, content);
    this.writeVersion(id, version.version, content);
    try {
      script.versions.push(version);
      this.save(index);
    } catch (error) {
      fs.rmSync(path.join(this.libraryPath, 'scripts', id, `v${version.version}.yml`), { force: true });
      throw error;
    }
    return { version: version.version, createdAt: version.createdAt, unchanged: false };
  }
  validateVersionInput(fileName, content) {
    if (typeof content !== 'string' || !content.length || typeof fileName !== 'string' || !fileName) throw new LibraryError('fileName and content are required');
    try { yaml.load(content); } catch (error) { throw new LibraryError(`Invalid YAML: ${error.message}`); }
  }
  newVersion(script, fileName, content) {
    return { version: (this.latest(script)?.version || 0) + 1, createdAt: new Date().toISOString(), sha256: crypto.createHash('sha256').update(content).digest('hex'), fileName };
  }
  writeVersion(id, version, content) {
    const directory = path.join(this.libraryPath, 'scripts', id);
    fs.mkdirSync(directory, { recursive: true });
    const destination = path.join(directory, `v${version}.yml`);
    const temporary = path.join(directory, `.v${version}.${crypto.randomUUID()}.tmp`);
    try { fs.writeFileSync(temporary, content, 'utf8'); fs.renameSync(temporary, destination); }
    finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
  }
  latest(script) { return [...(script.versions || [])].sort((a, b) => b.version - a.version)[0]; }
  content(id, version = 'latest') { const script = this.script(id), item = version === 'latest' ? this.latest(script) : script.versions.find(x => x.version === Number(version)); if (!item) throw new LibraryError('Script version not found', 404); return { script, version: item, content: fs.readFileSync(path.join(this.libraryPath, 'scripts', id, `v${item.version}.yml`), 'utf8') }; }
  usage(id) {
    const usage = []; if (!fs.existsSync(this.workflowsPath)) return usage;
    for (const entry of fs.readdirSync(this.workflowsPath, { withFileTypes: true })) { const file = path.join(this.workflowsPath, entry.name, 'workflow.json'); if (!entry.isDirectory() || !fs.existsSync(file)) continue; let workflow; try { workflow = readJson(file); } catch { continue; } const steps = (workflow.steps || []).filter(step => Array.isArray(step.scriptIds) && step.scriptIds.includes(id)).map(({ id: stepId, name }) => ({ id: stepId, name })); if (steps.length) usage.push({ workflow: entry.name, steps }); }
    return usage;
  }
  deleteScript(id) { const usage = this.usage(id); if (usage.length) throw new LibraryError('Script is used by workflows', 409, { usage }); const index = this.load(); if (!index.scripts.some(x => x.id === id)) throw new LibraryError('Script not found', 404); index.scripts = index.scripts.filter(x => x.id !== id); this.save(index); fs.rmSync(path.join(this.libraryPath, 'scripts', id), { recursive: true, force: true }); }
  list() { const index = this.load(); return { folders: index.folders, scripts: index.scripts.map(script => this.summary(script)) }; }
  summary(script) { const latest = this.latest(script); return { id: script.id, name: script.name, description: script.description, folderId: script.folderId, latestVersion: latest?.version || null, latestVersionDate: latest?.createdAt || null, updatedAt: latest?.createdAt || null, usageCount: this.usage(script.id).reduce((sum, item) => sum + item.steps.length, 0) }; }
  details(id) { const script = this.script(id); const summary = this.summary(script); return { ...script, latestVersion: summary.latestVersion, latestVersionDate: summary.latestVersionDate, usage: this.usage(id) }; }
}

module.exports = { ScriptLibrary, LibraryError };
