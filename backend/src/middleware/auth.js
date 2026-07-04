const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = header.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.adminId = decoded.id;
    req.adminUsername = decoded.username;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function cameraAuthMiddleware(req, res, next) {
  const apiKey = req.body.apiKey || req.query.apiKey || req.headers['x-api-key'];
  if (!apiKey || apiKey !== process.env.CAMERA_API_KEY) {
    return res.status(403).json({ error: 'Invalid camera API key' });
  }
  next();
}

module.exports = { authMiddleware, cameraAuthMiddleware };
