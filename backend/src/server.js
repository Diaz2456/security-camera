require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');
const path = require('path');

const authRoutes = require('./routes/auth');
const cameraRoutes = require('./routes/camera');
const faceRoutes = require('./routes/faces');
const eventRoutes = require('./routes/events');
const configRoutes = require('./routes/config');
const storageRoutes = require('./routes/storage');
const { authMiddleware } = require('./middleware/auth');
const { startStorageMonitor } = require('./utils/storageMonitor');
const { seedAdmin } = require('./utils/seedAdmin');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  maxHttpBufferSize: 5e6,
});

// Make io accessible to routes
app.set('io', io);

// Middleware
app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// Static files (frontend build in production)
const staticDir = process.env.STATIC_DIR || path.join(__dirname, '../../frontend/build');
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(staticDir));
}

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/camera', cameraRoutes);
app.use('/api/faces', authMiddleware, faceRoutes);
app.use('/api/events', authMiddleware, eventRoutes);
app.use('/api/config', authMiddleware, configRoutes);
app.use('/api/storage', authMiddleware, storageRoutes);

// Serve frontend for all other routes (production)
if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res) => {
    res.sendFile(path.join(staticDir, 'index.html'));
  });
}

// Connect to MongoDB and start server
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/security-cam';

async function start() {
  try {
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000,
    });
    console.log('MongoDB connected');

    await seedAdmin();

    // Start hourly storage monitor
    startStorageMonitor(io);

    server.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error('Startup error:', err.message);
    process.exit(1);
  }
}

start();

module.exports = { app, server, io };
