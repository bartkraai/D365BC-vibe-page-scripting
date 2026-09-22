'use strict';

const fs = require('fs');
const path = require('path');

const REPLAY_VIDEO = /\.(webm|mp4)$/i;

function isWithinDirectory(rootDir, candidateDir) {
  try {
    const root = fs.realpathSync(rootDir);
    const candidate = fs.realpathSync(candidateDir);
    const relative = path.relative(root, candidate);
    return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
  } catch {
    return false;
  }
}

function findReplayVideo(reportDir) {
  if (!reportDir || !fs.existsSync(reportDir)) return null;

  const pending = [reportDir];
  while (pending.length) {
    const currentDir = pending.shift();
    let entries;
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true })
        .sort((left, right) => left.name.localeCompare(right.name));
    } catch {
      continue;
    }

    const video = entries.find(entry => entry.isFile() && REPLAY_VIDEO.test(entry.name));
    if (video) return path.join(currentDir, video.name);

    for (const entry of entries) {
      if (entry.isDirectory()) pending.push(path.join(currentDir, entry.name));
    }
  }

  return null;
}

module.exports = { findReplayVideo, isWithinDirectory };
