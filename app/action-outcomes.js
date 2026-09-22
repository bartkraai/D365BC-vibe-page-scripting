'use strict';

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

function cleanDescription(value) {
  return String(value || '').replace(/<[^>]+>/g, '');
}

function errorMessage(error) {
  if (!error) return null;
  if (typeof error === 'string') return error;
  return error.message || error.target || JSON.stringify(error);
}

function mergeActionOutcomes(testDefinition, executionLog) {
  const definitionSteps = testDefinition?.steps || [];
  const logSteps = executionLog?.steps || [];
  const maxLength = Math.max(definitionSteps.length, logSteps.length);
  const steps = [];

  for (let index = 0; index < maxLength; index++) {
    const definition = definitionSteps[index] || {};
    const execution = logSteps[index] || {};
    const log = execution.log || null;
    const error = log?.error || null;

    steps.push({
      index: index + 1,
      type: execution.type || definition.type || '',
      description: cleanDescription(execution.description || definition.description),
      target: definition.target || execution.target || null,
      value: definition.value || execution.value || null,
      start: log?.start || null,
      duration_ms: log?.duration ?? null,
      status: error ? 'failed' : log ? 'passed' : 'not-recorded',
      error_message: errorMessage(error),
    });
  }

  return {
    name: testDefinition?.name || '',
    telemetryId: testDefinition?.telemetryId || executionLog?.telemetryId || '',
    totalSteps: steps.length,
    steps,
  };
}

function readActionOutcomes(reportDir) {
  if (!reportDir) return null;
  const dataDir = path.join(reportDir, 'playwright-report', 'data');
  if (!fs.existsSync(dataDir)) return null;

  let testDefinition = null;
  let executionLog = null;
  for (const fileName of fs.readdirSync(dataDir).filter(file => /\.ya?ml$/i.test(file))) {
    const content = yaml.load(fs.readFileSync(path.join(dataDir, fileName), 'utf8'));
    if (!content?.steps) continue;
    if (content.steps.some(step => step?.log)) executionLog = content;
    else if (content.name) testDefinition = content;
  }

  return mergeActionOutcomes(testDefinition, executionLog);
}

module.exports = { mergeActionOutcomes, readActionOutcomes };
