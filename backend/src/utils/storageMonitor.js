const Event = require('../models/Event');
const AlertImage = require('../models/AlertImage');
const Face = require('../models/Face');
const Config = require('../models/Config');

const MAX_STORAGE = parseInt(process.env.MAX_STORAGE_BYTES) || 524288000;
const ALERT_THRESHOLD = parseInt(process.env.ALERT_THRESHOLD_BYTES) || 419430400;
const ROLLING_TARGET = parseInt(process.env.ROLLING_DELETE_TARGET_BYTES) || 419430400;
const EMERGENCY_TARGET = parseInt(process.env.ROLLING_DELETE_EMERGENCY_TARGET_BYTES) || 419430400;

async function getTotalStorageUsage() {
  try {
    const eventStats = await Event.getStorageUsage();
    const alertStats = await AlertImage.getStorageUsage();
    const faceStats = await Face.getStorageUsage();
    const total = eventStats.bytes + alertStats.bytes + faceStats.bytes;
    return {
      totalBytes: total,
      events: eventStats,
      alerts: alertStats,
      faces: faceStats,
      percentUsed: MAX_STORAGE > 0 ? ((total / MAX_STORAGE) * 100).toFixed(1) : 0,
    };
  } catch (err) {
    console.error('Storage usage calculation error:', err.message);
    return { totalBytes: 0, events: { bytes: 0, count: 0 }, alerts: { bytes: 0, count: 0 }, faces: { bytes: 0, count: 0 }, percentUsed: '0.0' };
  }
}

async function performRollingDeletion(targetBytes) {
  let deleted = 0;

  while (true) {
    const usage = await getTotalStorageUsage();
    if (usage.totalBytes <= targetBytes) break;

    const oldestUnlocked = await Event.findOne({ locked: false }).sort({ createdAt: 1 });
    if (!oldestUnlocked) break;

    if (oldestUnlocked.fullImageId) {
      await AlertImage.deleteOne({ _id: oldestUnlocked.fullImageId });
    }

    await Event.deleteOne({ _id: oldestUnlocked._id });
    deleted++;
  }

  if (deleted > 0) {
    console.log(`Rolling deletion removed ${deleted} old events`);
  }

  return deleted;
}

async function emergencyCleanup() {
  const usage = await getTotalStorageUsage();
  if (usage.totalBytes >= MAX_STORAGE * 0.95) {
    console.log('EMERGENCY: Storage at 95%+, purging all non-locked events');
    const result = await Event.deleteMany({ locked: false });
    await AlertImage.deleteMany({ locked: false });
    console.log(`Emergency purge removed ${result.deletedCount} events`);
  }
}

async function checkAndCleanup(io) {
  try {
    const usage = await getTotalStorageUsage();
    const retentionDays = await Config.get('retentionDays', 7);
    const retentionMs = retentionDays * 86400 * 1000;
    const cutoff = new Date(Date.now() - retentionMs);

    await Event.deleteMany({ createdAt: { $lt: cutoff }, locked: false });
    await AlertImage.deleteMany({ createdAt: { $lt: cutoff }, locked: false });

    if (usage.totalBytes > ALERT_THRESHOLD) {
      console.log(`Storage at ${usage.percentUsed}%, performing rolling deletion`);
      await performRollingDeletion(ROLLING_TARGET);
    }

    await emergencyCleanup();

    const updated = await getTotalStorageUsage();
    if (io) {
      io.emit('storage-update', updated);
    }

  } catch (err) {
    console.error('Storage monitor error:', err.message);
  }
}

function startStorageMonitor(io) {
  checkAndCleanup(io);
  setInterval(() => checkAndCleanup(io), 3600000);
  console.log('Storage monitor started (hourly checks)');
}

module.exports = { startStorageMonitor, getTotalStorageUsage, performRollingDeletion };
