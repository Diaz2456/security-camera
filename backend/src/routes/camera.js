const express = require('express');
const mongoose = require('mongoose');
const Event = require('../models/Event');
const AlertImage = require('../models/AlertImage');
const { cameraAuthMiddleware } = require('../middleware/auth');
const { compressImage, createThumbnail } = require('../utils/imageProcessor');

const router = express.Router();

router.post('/ingest', cameraAuthMiddleware, async (req, res) => {
  try {
    const { motionType, image } = req.body;
    if (!image || image.length < 100) {
      return res.status(400).json({ error: 'Invalid image data' });
    }

    const compressedImage = await compressImage(image);
    const thumbnail = await createThumbnail(compressedImage);

    let fullImageId = null;
    if (motionType === 'stranger' || motionType === 'person') {
      const alertImg = await AlertImage.create({
        eventId: new mongoose.Types.ObjectId(),
        imageBase64: compressedImage,
        sizeBytes: Math.ceil(compressedImage.length * 0.75),
      });
      fullImageId = alertImg._id;
    }

    const event = await Event.create({
      motionType,
      thumbnailBase64: thumbnail,
      fullImageId,
    });

    const io = req.app.get('io');
    if (io) {
      io.emit('new-event', {
        _id: event._id,
        motionType: event.motionType,
        thumbnailBase64: thumbnail,
        faceLabel: event.faceLabel,
        isStranger: event.isStranger,
        createdAt: event.createdAt,
      });

      if (motionType === 'stranger') {
        io.emit('stranger-alert', {
          eventId: event._id,
          imageBase64: compressedImage,
          timestamp: event.createdAt,
        });
      }
    }

    res.json({ success: true, eventId: event._id });
  } catch (err) {
    console.error('Ingest error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
