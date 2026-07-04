const express = require('express');
const Face = require('../models/Face');
const { enrollFace } = require('../utils/faceRecognition');
const { createThumbnail } = require('../utils/imageProcessor');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const faces = await Face.find({}).select('label createdAt thumbnailBase64').sort({ createdAt: -1 });
    res.json(faces);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/enroll', async (req, res) => {
  try {
    const { label, embedding, imageBase64 } = req.body;
    if (!label || !embedding || !Array.isArray(embedding) || embedding.length !== 128) {
      return res.status(400).json({ error: 'Label and 128-dim embedding required' });
    }

    const thumbnailBase64 = imageBase64 ? await createThumbnail(imageBase64) : null;
    const face = await enrollFace(label.trim(), embedding, thumbnailBase64);

    res.json({ success: true, face: { _id: face._id, label: face.label } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const face = await Face.findByIdAndDelete(req.params.id);
    if (!face) return res.status(404).json({ error: 'Face not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
