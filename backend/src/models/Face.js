const mongoose = require('mongoose');

const faceSchema = new mongoose.Schema({
  label: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    maxlength: 64,
  },
  embedding: {
    type: [Number],
    required: true,
    validate: {
      validator: function (v) { return v.length === 128; },
      message: 'Embedding must be 128 dimensions',
    },
  },
  thumbnailBase64: {
    type: String,
    maxlength: 15000,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

faceSchema.index({ label: 1 });

faceSchema.statics.getStorageUsage = async function () {
  const stats = await this.aggregate([
    {
      $group: {
        _id: null,
        totalBytes: { $sum: { $strLenCP: { $ifNull: ['$thumbnailBase64', ''] } } },
        count: { $sum: 1 },
      },
    },
  ]);
  return stats.length > 0
    ? { bytes: stats[0].totalBytes, count: stats[0].count }
    : { bytes: 0, count: 0 };
};

module.exports = mongoose.model('Face', faceSchema);
