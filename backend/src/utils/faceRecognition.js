const Face = require('../models/Face');

function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function recognizeFace(embedding, threshold = 0.6) {
  const faces = await Face.find({});
  if (faces.length === 0) {
    return null;
  }

  let bestMatch = null;
  let bestScore = -1;

  for (const face of faces) {
    const score = cosineSimilarity(embedding, face.embedding);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = face;
    }
  }

  if (bestScore >= threshold) {
    return { label: bestMatch.label, faceId: bestMatch._id, score: bestScore };
  }

  return null;
}

async function enrollFace(label, embedding, thumbnailBase64) {
  const existing = await Face.findOne({ label });
  if (existing) {
    existing.embedding = embedding;
    if (thumbnailBase64) existing.thumbnailBase64 = thumbnailBase64;
    await existing.save();
    return existing;
  }

  return Face.create({ label, embedding, thumbnailBase64 });
}

module.exports = { recognizeFace, enrollFace, cosineSimilarity };
