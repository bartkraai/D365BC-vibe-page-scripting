'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { findReplayVideo, isWithinDirectory } = require('./result-artifacts');

test('findReplayVideo finds a nested Playwright WebM recording', () => {
  const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bc-result-artifacts-'));
  const videoPath = path.join(reportDir, 'test-results', 'approval-flow', 'video.webm');
  fs.mkdirSync(path.dirname(videoPath), { recursive: true });
  fs.writeFileSync(videoPath, 'video');

  try {
    assert.equal(findReplayVideo(reportDir), videoPath);
  } finally {
    fs.rmSync(reportDir, { recursive: true, force: true });
  }
});

test('findReplayVideo returns null when no recording exists', () => {
  const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bc-result-artifacts-'));

  try {
    assert.equal(findReplayVideo(reportDir), null);
  } finally {
    fs.rmSync(reportDir, { recursive: true, force: true });
  }
});

test('findReplayVideo supports prefixed MP4 recordings', () => {
  const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bc-result-artifacts-'));
  const videoPath = path.join(reportDir, 'artifacts', 'video-approval.mp4');
  fs.mkdirSync(path.dirname(videoPath), { recursive: true });
  fs.writeFileSync(videoPath, 'video');

  try {
    assert.equal(findReplayVideo(reportDir), videoPath);
  } finally {
    fs.rmSync(reportDir, { recursive: true, force: true });
  }
});

test('findReplayVideo finds Playwright report data videos with hashed names', () => {
  const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bc-result-artifacts-'));
  const videoPath = path.join(reportDir, 'playwright-report', 'data', '972097ed82494e310b8bc514045c188897d41872.webm');
  fs.mkdirSync(path.dirname(videoPath), { recursive: true });
  fs.writeFileSync(videoPath, 'video');

  try {
    assert.equal(findReplayVideo(reportDir), videoPath);
  } finally {
    fs.rmSync(reportDir, { recursive: true, force: true });
  }
});

test('findReplayVideo returns null for missing and unreadable report locations', () => {
  const missingDir = path.join(os.tmpdir(), `bc-result-artifacts-missing-${Date.now()}`);
  const reportFile = path.join(os.tmpdir(), `bc-result-artifacts-file-${Date.now()}`);
  fs.writeFileSync(reportFile, 'not a directory');

  try {
    assert.equal(findReplayVideo(missingDir), null);
    assert.equal(findReplayVideo(reportFile), null);
  } finally {
    fs.rmSync(reportFile, { force: true });
  }
});

test('isWithinDirectory rejects a result directory that escapes through a junction', () => {
  const resultsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bc-result-root-'));
  const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bc-result-outside-'));
  const insideDir = path.join(resultsRoot, 'workflow', 'step-1');
  const junctionDir = path.join(resultsRoot, 'escaped-step');
  fs.mkdirSync(insideDir, { recursive: true });
  fs.symlinkSync(outsideDir, junctionDir, 'junction');

  try {
    assert.equal(isWithinDirectory(resultsRoot, insideDir), true);
    assert.equal(isWithinDirectory(resultsRoot, junctionDir), false);
  } finally {
    fs.rmSync(resultsRoot, { recursive: true, force: true });
    fs.rmSync(outsideDir, { recursive: true, force: true });
  }
});
