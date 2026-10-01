'use strict';

const fs = require('fs');
const path = require('path');

function safeProjectName(name) {
  const value = String(name || '');
  const safeName = path.basename(value)
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '-')
    .replace(/[\s.]+$/, '')
    .trim();

  if (!safeName || safeName !== value) {
    throw new Error('Invalid project name');
  }
  return safeName;
}

function duplicateProjectFolder(projectsRoot, sourceName, workflowUpdates = {}) {
  const safeSourceName = safeProjectName(sourceName);
  const sourceDir = path.join(projectsRoot, safeSourceName);
  if (!fs.existsSync(sourceDir) || !fs.statSync(sourceDir).isDirectory()) {
    throw new Error(`Project folder "${safeSourceName}" was not found`);
  }

  let targetName = `${safeSourceName} (Copy)`;
  for (let index = 2; fs.existsSync(path.join(projectsRoot, targetName)); index++) {
    targetName = `${safeSourceName} (Copy ${index})`;
  }

  const targetDir = path.join(projectsRoot, targetName);
  try {
    fs.cpSync(sourceDir, targetDir, { recursive: true, errorOnExist: true });
    const workflowPath = path.join(targetDir, 'workflow.json');
    if (fs.existsSync(workflowPath)) {
      const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));
      if (workflowUpdates.name) workflow.name = workflowUpdates.name;
      if (workflowUpdates.catalog) workflow.catalog = workflowUpdates.catalog;
      fs.writeFileSync(workflowPath, JSON.stringify(workflow, null, 2));
    }
  } catch (error) {
    fs.rmSync(targetDir, { recursive: true, force: true });
    throw error;
  }
  return { sourceName: safeSourceName, targetName, targetDir };
}

module.exports = { duplicateProjectFolder, safeProjectName };
