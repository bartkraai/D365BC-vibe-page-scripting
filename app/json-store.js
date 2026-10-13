'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class JsonStoreError extends Error {
  constructor(message, status = 500) { super(message); this.name = 'JsonStoreError'; this.status = status; }
}

function readJson(filePath, { missingStatus = 404 } = {}) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') throw new JsonStoreError(`File not found: ${path.basename(filePath)}`, missingStatus);
    if (error instanceof SyntaxError) throw new JsonStoreError(`Invalid JSON in ${path.basename(filePath)}`, 400);
    throw new JsonStoreError(error.message);
  }
}

function writeJsonAtomic(filePath, value) {
  const directory = path.dirname(filePath);
  fs.mkdirSync(directory, { recursive: true });
  const temporary = path.join(directory, `.${path.basename(filePath)}.${crypto.randomUUID()}.tmp`);
  try {
    fs.writeFileSync(temporary, JSON.stringify(value, null, 2), 'utf8');
    for (let attempt = 0; ; attempt++) {
      try { fs.renameSync(temporary, filePath); break; }
      catch (error) {
        if (!['EPERM', 'EACCES', 'EBUSY'].includes(error.code) || attempt >= 4) throw error;
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20 * (attempt + 1));
      }
    }
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

module.exports = { JsonStoreError, readJson, writeJsonAtomic };
