/**
 * Storage Limit Test Script
 *
 * Simulates filling the database to near 500 MB and verifies
 * that the rolling deletion logic kicks in.
 *
 * Usage: node src/test/storage-test.js
 *
 * WARNING: This will create and then clean up test data.
 * Run against a TEST database, NOT production.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Event = require('../models/Event');
const AlertImage = require('../models/AlertImage');
const Face = require('../models/Face');
const { getTotalStorageUsage, performRollingDeletion } = require('../utils/storageMonitor');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/security-cam-test';
const MAX_STORAGE = parseInt(process.env.MAX_STORAGE_BYTES) || 524288000;
const ROLLING_TARGET = parseInt(process.env.ROLLING_DELETE_TARGET_BYTES) || 419430400;

function generateBase64(sizeKB) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const targetLen = Math.ceil(sizeKB * 1024 * 0.75);
  let result = '';
  for (let i = 0; i < targetLen; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

async function fillDatabase() {
  console.log('=== Storage Limit Test ===\n');
  console.log(`Max storage: ${(MAX_STORAGE / 1048576).toFixed(1)} MB`);
  console.log(`Rolling target: ${(ROLLING_TARGET / 1048576).toFixed(1)} MB\n`);

  // Drop existing test data
  await Event.deleteMany({});
  await AlertImage.deleteMany({});
  await Face.deleteMany({});

  let initialUsage = await getTotalStorageUsage();
  console.log(`Initial storage: ${(initialUsage.totalBytes / 1048576).toFixed(1)} MB\n`);

  // Phase 1: Fill with events (~300 MB)
  console.log('Phase 1: Creating events...');
  const EVENT_COUNT = 600;
  const THUMB_SIZE_KB = 30; // ~30 KB per thumbnail (base64)

  for (let i = 0; i < EVENT_COUNT; i++) {
    const types = ['idle', 'motion', 'person', 'animal', 'package', 'vehicle', 'stranger'];
    const motionType = types[Math.floor(Math.random() * types.length)];
    const thumbnailBase64 = generateBase64(THUMB_SIZE_KB);
    const isStranger = motionType === 'stranger';

    let fullImageId = null;
    if (isStranger || motionType === 'person') {
      const alertImg = await AlertImage.create({
        eventId: new mongoose.Types.ObjectId(),
        imageBase64: generateBase64(40),
        sizeBytes: 30000,
      });
      fullImageId = alertImg._id;
    }

    await Event.create({
      motionType,
      thumbnailBase64,
      isStranger,
      fullImageId,
      faceLabel: isStranger ? null : 'Test Face',
      createdAt: new Date(Date.now() - i * 60000),
    });

    if ((i + 1) % 100 === 0) {
      const usage = await getTotalStorageUsage();
      console.log(`  Created ${i + 1}/${EVENT_COUNT} events - Storage: ${(usage.totalBytes / 1048576).toFixed(1)} MB`);
    }
  }

  let midUsage = await getTotalStorageUsage();
  console.log(`\nAfter Phase 1: ${(midUsage.totalBytes / 1048576).toFixed(1)} MB used`);

  // Phase 2: Add more alert images (~200 MB)
  console.log('\nPhase 2: Adding extra alert images...');
  for (let i = 0; i < 300; i++) {
    await AlertImage.create({
      eventId: new mongoose.Types.ObjectId(),
      imageBase64: generateBase64(50),
      sizeBytes: 38000,
    });
  }

  let fullUsage = await getTotalStorageUsage();
  console.log(`After Phase 2: ${(fullUsage.totalBytes / 1048576).toFixed(1)} MB used`);

  // Phase 3: Trigger rolling deletion
  if (fullUsage.totalBytes > ROLLING_TARGET) {
    console.log(`\nPhase 3: Triggering rolling deletion (target: ${(ROLLING_TARGET / 1048576).toFixed(1)} MB)...`);
    const deleted = await performRollingDeletion(ROLLING_TARGET);
    console.log(`Deleted ${deleted} events`);

    let finalUsage = await getTotalStorageUsage();
    console.log(`\nFinal storage: ${(finalUsage.totalBytes / 1048576).toFixed(1)} MB`);
    console.log(`Percent used: ${finalUsage.percentUsed}%`);
    console.log(`Events remaining: ${finalUsage.events.count}`);
    console.log(`Alert images remaining: ${finalUsage.alerts.count}`);

    if (finalUsage.totalBytes <= ROLLING_TARGET) {
      console.log('\nSUCCESS: Rolling deletion brought storage below target.');
    } else {
      console.log('\nWARNING: Storage still above target. Manual review needed.');
    }
  } else {
    console.log('\nStorage below threshold, no deletion needed.');
  }

  // Cleanup
  console.log('\nCleaning up test data...');
  await Event.deleteMany({});
  await AlertImage.deleteMany({});
  await Face.deleteMany({});

  let finalClean = await getTotalStorageUsage();
  console.log(`Clean storage: ${(finalClean.totalBytes / 1048576).toFixed(1)} MB`);
  console.log('\n=== Test Complete ===');
}

mongoose.connect(MONGODB_URI)
  .then(fillDatabase)
  .catch(err => { console.error('Test error:', err); })
  .finally(() => setTimeout(() => process.exit(0), 2000));
