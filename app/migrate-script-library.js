'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { ScriptLibrary } = require('../app/script-library');
const { readJson, writeJsonAtomic } = require('../app/json-store');
const { validateCatalog, validateWorkflow } = require('../app/workflow-store');

const SKIP_SCRIPT_DIRS = new Set(['results', 'variants', '.git', 'node_modules']);
const COMMON_V3_SOURCE = 'Projecten (vaste termijnen)';
const COMMON_V2_SOURCE = 'UAV Project';

function inside(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function yamlFiles(folder) {
  const files = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!SKIP_SCRIPT_DIRS.has(entry.name.toLowerCase())) walk(path.join(dir, entry.name));
      } else if (/\.ya?ml$/i.test(entry.name)) files.push(path.join(dir, entry.name));
    }
  }
  if (fs.existsSync(folder)) walk(folder);
  return files.sort((a, b) => a.localeCompare(b));
}

function removeEmptyDirectories(folder) {
  if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) return;
  for (const entry of fs.readdirSync(folder, { withFileTypes: true })) if (entry.isDirectory()) removeEmptyDirectories(path.join(folder, entry.name));
  if (!fs.readdirSync(folder).length) fs.rmdirSync(folder);
}
function fileHash(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function preferCandidate(workflowName, ref, candidates) {
  const basename = path.basename(ref).toLowerCase();
  let preferredOwner = null;
  if (workflowName === 'Besteksposten' || /(?:^|\s)2\.ya?ml$/i.test(basename)) preferredOwner = COMMON_V2_SOURCE;
  else if (/(?:^|\s)3\.ya?ml$/i.test(basename)) preferredOwner = COMMON_V3_SOURCE;
  if (preferredOwner) {
    const preferred = candidates.find(item => item.owner === preferredOwner);
    if (preferred) return preferred;
  }
  const hashes = new Set(candidates.map(item => item.hash));
  if (hashes.size === 1) return candidates[0];
  throw new Error(`Ambiguous script reference in '${workflowName}': ${ref}; candidates: ${candidates.map(x => `${x.owner}/${path.basename(x.file)}`).join(', ')}`);
}

function buildMigrationPlan(pageScripting) {
  const legacyFolders = fs.readdirSync(pageScripting, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && !entry.name.startsWith('.') && !['script-library', 'workflows'].includes(entry.name.toLowerCase()))
    .map(entry => entry.name)
    .sort((a, b) => a.localeCompare(b));
  const sources = [];
  const workflows = [];
  for (const owner of legacyFolders) {
    const folder = path.join(pageScripting, owner);
    const workflowFile = path.join(folder, 'workflow.json');
    const files = yamlFiles(folder).map(file => ({ file, owner, hash: fileHash(file) }));
    sources.push(...files);
    if (fs.existsSync(workflowFile)) workflows.push({ owner, folder, workflow: readJson(workflowFile) });
  }

  const refFallbacks = [];
  for (const item of workflows) {
    for (const step of item.workflow.steps || []) {
      const refs = Array.isArray(step.scripts) ? step.scripts : (step.script ? [step.script] : []);
      for (const ref of refs) {
        const candidate = path.resolve(item.folder, ref);
        if (!inside(item.folder, candidate)) throw new Error(`Script reference escapes workflow folder '${item.owner}': ${ref}`);
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) continue;
        const matching = sources.filter(source => path.basename(source.file).toLowerCase() === path.basename(ref).toLowerCase());
        if (!matching.length) throw new Error(`Missing script reference in '${item.owner}': ${ref}`);
        const chosen = preferCandidate(item.owner, ref, matching);
        refFallbacks.push({ workflow: item.owner, step: step.id, reference: ref, source: path.relative(pageScripting, chosen.file).replace(/\\/g, '/'), hashes: [...new Set(matching.map(x => x.hash))].length });
      }
    }
  }

  const catalogFile = path.join(pageScripting, 'catalog.json');
  const catalog = readJson(catalogFile);
  for (const type of catalog.types || []) for (const chain of type.value_chains || []) for (const flow of chain.process_flows || []) {
    const oldPath = String(flow.workflow_path || '').replace(/\\/g, '/');
    if (oldPath) {
      const relative = oldPath.replace(/^\.\//, '');
      const top = relative.split('/')[0];
      if (legacyFolders.includes(top)) flow.workflow_path = `./${relative}`;
    }
  }
  const workflowRoot = path.join(pageScripting, 'workflows');
  const existingWorkflowNames = fs.existsSync(workflowRoot) ? fs.readdirSync(workflowRoot, { withFileTypes: true }).filter(entry => entry.isDirectory() && fs.existsSync(path.join(workflowRoot, entry.name, 'workflow.json'))).map(entry => entry.name) : [];
  return { pageScripting, legacyFolders, workflows, sources, refFallbacks, catalog, catalogFile, existingWorkflowNames };
}

function uniqueName(library, requested, folderId, kind) {
  const index = library.load();
  const occupied = [...index.folders, ...index.scripts].filter(item => (kind === 'folder' ? item.parentId : item.folderId) === folderId).map(item => item.name.toLocaleLowerCase());
  if (!occupied.includes(requested.toLocaleLowerCase())) return requested;
  for (let suffix = 2; ; suffix++) {
    const candidate = `${requested} (${suffix})`;
    if (!occupied.includes(candidate.toLocaleLowerCase())) return candidate;
  }
}

function migrate(pageScripting, backupDir) {
  const plan = buildMigrationPlan(pageScripting);
  const workflowTarget = path.join(pageScripting, 'workflows');
  const existingWorkflowNames = fs.existsSync(workflowTarget) ? fs.readdirSync(workflowTarget, { withFileTypes: true }).filter(entry => entry.isDirectory() && fs.existsSync(path.join(workflowTarget, entry.name, 'workflow.json'))).map(entry => entry.name) : [];
  if (!plan.legacyFolders.length) return { workflowCount: existingWorkflowNames.length, sourceFileCount: 0, importedCount: 0, reusedCount: 0, fallbackCount: 0, backupDir: null, refFallbacks: [] };
  const libraryTarget = path.join(pageScripting, 'script-library');
  const existingDirectoryNames = fs.existsSync(workflowTarget) ? fs.readdirSync(workflowTarget, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name) : [];
  const collisions = plan.legacyFolders.filter(name => existingDirectoryNames.includes(name));
  if (collisions.length) throw new Error(`Workflows already exist: ${collisions.join(', ')}; refusing to overwrite them`);
  if (fs.existsSync(backupDir)) throw new Error(`Backup directory already exists: ${backupDir}`);
  if (inside(path.resolve(pageScripting, '..'), backupDir)) throw new Error('Backup directory must be outside the repository');

  const stageSuffix = `.migration-${process.pid}-${crypto.randomUUID()}`;
  const stagedWorkflows = path.join(pageScripting, `.workflows${stageSuffix}`);
  const stagedLibrary = path.join(pageScripting, `.script-library${stageSuffix}`);
  const backupWorkflows = path.join(backupDir, 'legacy-workflows');
  const backupLibrary = path.join(backupDir, 'script-library');
  const backupCatalog = path.join(backupDir, 'catalog.json');
  let installedWorkflow = false, installedLibrary = false, catalogUpdated = false;
  const sourceToScript = new Map();
  try {
    if (fs.existsSync(workflowTarget)) fs.cpSync(workflowTarget, stagedWorkflows, { recursive: true, errorOnExist: true });
    else fs.mkdirSync(stagedWorkflows, { recursive: true });
    if (fs.existsSync(libraryTarget)) fs.cpSync(libraryTarget, stagedLibrary, { recursive: true, errorOnExist: true });
    else fs.mkdirSync(stagedLibrary, { recursive: true });
    fs.mkdirSync(backupDir, { recursive: true });
    fs.mkdirSync(backupWorkflows, { recursive: true });
    fs.copyFileSync(plan.catalogFile, backupCatalog);
    if (fs.existsSync(libraryTarget)) fs.cpSync(libraryTarget, backupLibrary, { recursive: true, errorOnExist: true });

    const library = new ScriptLibrary(stagedLibrary, stagedWorkflows);
    const hashToId = new Map();
    const current = library.load();
    for (const script of current.scripts) for (const version of script.versions || []) {
      let hash = version.sha256;
      if (!hash) {
        const content = library.content(script.id, version.version).content;
        hash = crypto.createHash('sha256').update(content).digest('hex');
      }
      hashToId.set(hash, script.id);
    }

    const ownerFolders = new Map();
    let importedCount = 0;
    for (const source of plan.sources) {
      let id = hashToId.get(source.hash);
      if (!id) {
        let folderId = ownerFolders.get(source.owner);
        if (!folderId) {
          const name = uniqueName(library, `Imported - ${source.owner}`, null, 'folder');
          folderId = library.createFolder({ name, parentId: null }).id;
          ownerFolders.set(source.owner, folderId);
        }
        const requested = path.basename(source.file).replace(/\.ya?ml$/i, '');
        const name = uniqueName(library, requested, folderId, 'script');
        const content = fs.readFileSync(source.file, 'utf8');
        const script = library.createScript({ name, folderId, fileName: path.basename(source.file), content });
        id = script.id;
        hashToId.set(source.hash, id);
        importedCount++;
      }
      sourceToScript.set(path.resolve(source.file), id);
    }

    for (const owner of plan.legacyFolders) fs.cpSync(path.join(pageScripting, owner), path.join(stagedWorkflows, owner), { recursive: true, errorOnExist: true });
    for (const item of plan.workflows) {
      const target = path.join(stagedWorkflows, item.owner);
      const workflow = JSON.parse(JSON.stringify(item.workflow));
      for (const step of workflow.steps || []) {
        if (Array.isArray(step.scriptIds)) continue;
        const refs = Array.isArray(step.scripts) ? step.scripts : (step.script ? [step.script] : []);
        if (refs.length) {
          step.scriptIds = refs.map(ref => {
            const local = path.resolve(item.folder, ref);
            let source = fs.existsSync(local) ? local : null;
            if (!source) {
              const fallback = plan.refFallbacks.find(x => x.workflow === item.owner && x.step === step.id && x.reference === ref);
              if (!fallback) throw new Error(`No source mapping for '${item.owner}' ${step.id}: ${ref}`);
              source = path.resolve(pageScripting, fallback.source);
            }
            const id = sourceToScript.get(path.resolve(source));
            if (!id) throw new Error(`Script was not imported: ${path.relative(pageScripting, source)}`);
            return id;
          });
        }
        delete step.script;
        delete step.scripts;
      }
      writeJsonAtomic(path.join(target, 'workflow.json'), workflow);
      validateWorkflow(workflow, library);
    }
    for (const source of plan.sources) {
      const copied = path.join(stagedWorkflows, source.owner, path.relative(path.join(pageScripting, source.owner), source.file));
      if (fs.existsSync(copied)) fs.unlinkSync(copied);
    }
    for (const owner of plan.legacyFolders) removeEmptyDirectories(path.join(stagedWorkflows, owner, 'scripts'));

    for (const entry of fs.readdirSync(stagedWorkflows, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const workflowFile = path.join(stagedWorkflows, entry.name, 'workflow.json');
      if (fs.existsSync(workflowFile)) validateWorkflow(readJson(workflowFile), library);
    }
    validateCatalog(plan.catalog, stagedWorkflows);
    writeJsonAtomic(path.join(stagedLibrary, 'library.json'), library.load());
    writeJsonAtomic(plan.catalogFile + '.migration-tmp', plan.catalog);

    for (const owner of plan.legacyFolders) fs.cpSync(path.join(pageScripting, owner), path.join(backupWorkflows, owner), { recursive: true, errorOnExist: true });
    if (fs.existsSync(workflowTarget)) fs.cpSync(workflowTarget, path.join(backupDir, 'existing-workflows'), { recursive: true, errorOnExist: true });
    if (fs.existsSync(workflowTarget)) fs.rmSync(workflowTarget, { recursive: true, force: true });
    fs.renameSync(stagedWorkflows, workflowTarget);
    installedWorkflow = true;
    if (fs.existsSync(libraryTarget)) fs.rmSync(libraryTarget, { recursive: true, force: true });
    fs.renameSync(stagedLibrary, libraryTarget);
    installedLibrary = true;
    fs.renameSync(plan.catalogFile + '.migration-tmp', plan.catalogFile);
    catalogUpdated = true;
    for (const owner of plan.legacyFolders) fs.rmSync(path.join(pageScripting, owner), { recursive: true, force: true });
    const workflowCount = fs.readdirSync(workflowTarget, { withFileTypes: true }).filter(entry => entry.isDirectory() && fs.existsSync(path.join(workflowTarget, entry.name, 'workflow.json'))).length;
    return { workflowCount, sourceFileCount: plan.sources.length, importedCount, reusedCount: plan.sources.length - importedCount, fallbackCount: plan.refFallbacks.length, backupDir, refFallbacks: plan.refFallbacks };
  } catch (error) {
    try {
      if (catalogUpdated && fs.existsSync(backupCatalog)) fs.copyFileSync(backupCatalog, plan.catalogFile);
      if (installedWorkflow && fs.existsSync(workflowTarget)) fs.rmSync(workflowTarget, { recursive: true, force: true });
      if (fs.existsSync(backupDir) && fs.existsSync(path.join(backupDir, 'existing-workflows'))) fs.cpSync(path.join(backupDir, 'existing-workflows'), workflowTarget, { recursive: true, errorOnExist: true });
      if (installedLibrary && fs.existsSync(libraryTarget)) fs.rmSync(libraryTarget, { recursive: true, force: true });
      if (fs.existsSync(backupLibrary) && !fs.existsSync(libraryTarget)) fs.cpSync(backupLibrary, libraryTarget, { recursive: true, errorOnExist: true });
      for (const owner of plan.legacyFolders) {
        const source = path.join(pageScripting, owner), backup = path.join(backupWorkflows, owner);
        if (!fs.existsSync(source) && fs.existsSync(backup)) fs.cpSync(backup, source, { recursive: true, errorOnExist: true });
      }
    } catch (rollbackError) {
      error.message += `; rollback also failed: ${rollbackError.message}. Recovery files: ${backupDir}`;
    }
    throw error;
  } finally {
    for (const staged of [stagedWorkflows, stagedLibrary, plan.catalogFile + '.migration-tmp']) if (fs.existsSync(staged)) fs.rmSync(staged, { recursive: true, force: true });
  }
}

function parseArgs(argv) {
  const options = { mode: 'dry-run', root: path.resolve(__dirname, '..'), backupDir: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--apply') options.mode = 'apply';
    else if (argv[i] === '--dry-run') options.mode = 'dry-run';
    else if (argv[i] === '--root') options.root = path.resolve(argv[++i]);
    else if (argv[i] === '--backup-dir') options.backupDir = path.resolve(argv[++i]);
    else throw new Error(`Unknown option: ${argv[i]}`);
  }
  return options;
}

if (require.main === module) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const pageScripting = path.join(options.root, 'page-scripting');
    const plan = buildMigrationPlan(pageScripting);
    console.log(`Legacy workflows to migrate: ${plan.workflows.length}`);
    console.log(`Existing workflows to preserve: ${plan.existingWorkflowNames.length}`);
    console.log(`Legacy project folders: ${plan.legacyFolders.length}`);
    console.log(`Existing script files: ${plan.sources.length}`);
    console.log(`References requiring a fallback: ${plan.refFallbacks.length}`);
    for (const fallback of plan.refFallbacks) console.log(`  ${fallback.workflow}/${fallback.step}: ${fallback.reference} -> ${fallback.source}${fallback.hashes > 1 ? ' (selected canonical copy)' : ''}`);
    if (options.mode === 'dry-run') {
      console.log('Dry run only. No files were changed. Use --apply to migrate.');
    } else {
      options.backupDir ||= path.join(os.tmpdir(), `script-library-migration-${new Date().toISOString().replace(/[:.]/g, '-')}`);
      const result = migrate(pageScripting, options.backupDir);
      console.log(`Migrated workflows: ${result.workflowCount}`);
      console.log(`Imported scripts: ${result.importedCount}; duplicate content reused: ${result.reusedCount}`);
      if (result.backupDir) console.log(`Recovery backup: ${result.backupDir}`);
    }
  } catch (error) {
    console.error(`Migration failed: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { buildMigrationPlan, migrate, parseArgs, yamlFiles };