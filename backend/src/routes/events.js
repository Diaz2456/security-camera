const express = require('express');
const Event = require('../models/Event');
const AlertImage = require('../models/AlertImage');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const type = req.query.type;
    const stranger = req.query.stranger;

    const filter = {};
    if (type) filter.motionType = type;
    if (stranger === 'true') filter.isStranger = true;

    const events = await Event.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select('motionType thumbnailBase64 faceLabel isStranger locked createdAt');

    const total = await Event.countDocuments(filter);

    res.json({
      events,
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ error: 'Event not found' });

    let fullImage = null;
    if (event.fullImageId) {
      const alertImg = await AlertImage.findById(event.fullImageId);
      if (alertImg) {
        fullImage = alertImg.imageBase64;
      }
    }

    res.json({ event, fullImage });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id/lock', async (req, res) => {
  try {
    const event = await Event.findByIdAndUpdate(
      req.params.id,
      { locked: true },
      { new: true }
    );
    if (!event) return res.status(404).json({ error: 'Event not found' });

    if (event.fullImageId) {
      await AlertImage.findByIdAndUpdate(event.fullImageId, { locked: true });
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id/unlock', async (req, res) => {
  try {
    const event = await Event.findByIdAndUpdate(
      req.params.id,
      { locked: false },
      { new: true }
    );
    if (!event) return res.status(404).json({ error: 'Event not found' });

    if (event.fullImageId) {
      await AlertImage.findByIdAndUpdate(event.fullImageId, { locked: false });
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/purge', async (req, res) => {
  try {
    const { before } = req.body;
    const filter = { locked: false };
    if (before) {
      filter.createdAt = { $lt: new Date(before) };
    }

    const events = await Event.find(filter).select('fullImageId');
    const alertIds = events.filter(e => e.fullImageId).map(e => e.fullImageId);

    if (alertIds.length > 0) {
      await AlertImage.deleteMany({ _id: { $in: alertIds } });
    }

    const result = await Event.deleteMany(filter);
    res.json({ success: true, deletedCount: result.deletedCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
