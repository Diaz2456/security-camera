const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
  motionType: {
    type: String,
    enum: ['idle', 'motion', 'person', 'animal', 'package', 'vehicle', 'unknown', 'stranger'],
    required: true,
    index: true,
  },
  thumbnailBase64: {
    type: String,
    required: true,
    maxlength: 15000,
  },
  faceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Face',
    default: null,
  },
  faceLabel: {
    type: String,
    default: null,
  },
  isStranger: {
    type: Boolean,
    default: false,
    index: true,
  },
  fullImageId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null,
  },
  locked: {
    type: Boolean,
    default: false,
    index: true,
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
});

eventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 604800 });

eventSchema.statics.getStorageUsage = async function () {
  const stats = await this.aggregate([
    {
      $group: {
        _id: null,
        totalThumbnailsBytes: { $sum: { $strLenCP: '$thumbnailBase64' } },
        count: { $sum: 1 },
      },
    },
  ]);
  return stats.length > 0
    ? { bytes: stats[0].totalThumbnailsBytes, count: stats[0].count }
    : { bytes: 0, count: 0 };
};

module.exports = mongoose.model('Event', eventSchema);
