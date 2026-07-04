const express = require('express');
const { getTotalStorageUsage } = require('../utils/storageMonitor');

const router = express.Router();

router.get('/usage', async (req, res) => {
  try {
    const usage = await getTotalStorageUsage();
    res.json(usage);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
