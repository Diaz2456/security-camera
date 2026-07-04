const mongoose = require('mongoose');

const alertImageSchema = new mongoose.Schema({
  eventId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Event',
    required: true,
    index: true,
  },
  imageBase64: {
    type: String,
    maxlength: 60000,
    default: null,
  },
  gridFSId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null,
  },
  locked: {
    type: Boolean,
    default: false,
    index: true,
  },
  sizeBytes: {
    type: Number,
    default: 0,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

alertImageSchema.index({ createdAt: 1 }, { expireAfterSeconds: 604800 });

alertImageSchema.statics.getStorageUsage = async function () {
  const stats = await this.aggregate([
    {
      $group: {
        _id: null,
        totalImageBytes: { $sum: { $strLenCP: { $ifNull: ['$imageBase64', ''] } } },
        count: { $sum: 1 },
      },
    },
  ]);
  return stats.length > 0
    ? { bytes: stats[0].totalImageBytes, count: stats[0].count }
    : { bytes: 0, count: 0 };
};

module.exports = mongoose.model('AlertImage', alertImageSchema);
