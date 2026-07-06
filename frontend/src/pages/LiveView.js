import React, { useState, useEffect, useRef } from 'react';
import { getCameraStatus } from '../utils/api';

const styles = {
  container: { display: 'flex', gap: '1.5rem', flexWrap: 'wrap' },
  feedCard: {
    flex: '1 1 640px',
    maxWidth: '720px',
    background: '#16213e',
    borderRadius: '12px',
    overflow: 'hidden',
    boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
  },
  feedHeader: { padding: '1rem', borderBottom: '1px solid #2a2a4a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  feedTitle: { fontWeight: 'bold', color: '#e0e0e0' },
  statusDot: (on) => ({
    width: '10px', height: '10px', borderRadius: '50%',
    background: on ? '#4ade80' : '#e94560', display: 'inline-block', marginRight: '0.5rem',
  }),
  img: { width: '100%', display: 'block', minHeight: '360px', background: '#1a1a2e', objectFit: 'contain' },
  placeholder: {
    width: '100%', minHeight: '360px', display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', color: '#667', background: '#1a1a2e',
    padding: '2rem', textAlign: 'center',
  },
  sidebar: { flex: '0 0 320px' },
  alertCard: {
    background: '#16213e', borderRadius: '12px', padding: '1rem', marginBottom: '1rem',
    borderLeft: '4px solid #e94560',
  },
  alertTitle: { color: '#e94560', fontWeight: 'bold', marginBottom: '0.5rem' },
  alertTime: { color: '#667', fontSize: '0.8rem' },
  alertImg: { width: '100%', maxHeight: '160px', objectFit: 'cover', borderRadius: '6px', marginTop: '0.5rem' },
  tipBox: {
    background: '#1a1a2e', borderRadius: '8px', padding: '1rem', marginTop: '1rem',
    fontSize: '0.85rem', color: '#8899aa', lineHeight: '1.5',
  },
  tipTitle: { color: '#fbbf24', fontWeight: 'bold', marginBottom: '0.5rem' },
};

function LiveView({ socket }) {
  const [currentFrame, setCurrentFrame] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [connected, setConnected] = useState(false);
  const [camStatus, setCamStatus] = useState(null);
  const [statusChecked, setStatusChecked] = useState(false);

  useEffect(() => {
    getCameraStatus().then((s) => {
      setCamStatus(s);
      setStatusChecked(true);
    }).catch(() => setStatusChecked(true));
  }, []);

  useEffect(() => {
    if (!socket) return;

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    socket.on('new-event', (event) => {
      setCurrentFrame(event.thumbnailBase64);
      getCameraStatus().then(setCamStatus).catch(() => {});
    });

    socket.on('stranger-alert', (alert) => {
      setAlerts((prev) => [{ ...alert, id: Date.now() }, ...prev].slice(0, 10));
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('new-event');
      socket.off('stranger-alert');
    };
  }, [socket]);

  const noCamera = statusChecked && camStatus && !camStatus.isOnline;
  const neverSeen = statusChecked && camStatus && camStatus.uploadCount === 0;

  return (
    <div style={styles.container}>
      <div style={styles.feedCard}>
        <div style={styles.feedHeader}>
          <div style={styles.feedTitle}>
            <span style={styles.statusDot(connected)} />
            Live Feed
          </div>
          <span style={{ color: connected ? '#4ade80' : '#e94560', fontSize: '0.8rem' }}>
            {connected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
        {currentFrame ? (
          <img
            style={styles.img}
            src={`data:image/jpeg;base64,${currentFrame}`}
            alt="Live feed"
          />
        ) : (
          <div style={styles.placeholder}>
            {noCamera ? (
              <>
                <div style={{ color: '#e94560', fontSize: '1.1rem', marginBottom: '0.5rem' }}>
                  Camera Offline
                </div>
                <div>No upload received in the last 5 minutes.</div>
              </>
            ) : neverSeen ? (
              <>
                <div style={{ color: '#fbbf24', fontSize: '1.1rem', marginBottom: '0.5rem' }}>
                  Waiting for first upload
                </div>
                <div>The ESP32 has never uploaded. Check configuration.</div>
              </>
            ) : (
              <>
                <div>Waiting for camera...</div>
              </>
            )}
          </div>
        )}
        {noCamera && (
          <div style={styles.tipBox}>
            <div style={styles.tipTitle}>Troubleshooting</div>
            <div>1. Make sure the ESP32 is connected to WiFi with internet</div>
            <div>2. On the ESP32 settings page, verify <b>Server URL</b> is <code>https://security-camera-api.onrender.com</code></div>
            <div>3. Verify the <b>API Key</b> matches the server's CAMERA_API_KEY</div>
            <div>4. Check the ESP32 Serial Monitor for "Upload OK" messages</div>
            <div>5. Motion must be detected or wait up to 2 min for heartbeat capture</div>
          </div>
        )}
      </div>

      <div style={styles.sidebar}>
        <div style={{ fontWeight: 'bold', marginBottom: '1rem', color: '#e94560' }}>
          Recent Alerts
        </div>
        {alerts.length === 0 && (
          <div style={{ color: '#667', fontSize: '0.9rem' }}>No alerts yet</div>
        )}
        {alerts.map((alert) => (
          <div key={alert.id} style={styles.alertCard}>
            <div style={styles.alertTitle}>Stranger Alert</div>
            <div style={styles.alertTime}>
              {new Date(alert.timestamp).toLocaleString()}
            </div>
            {alert.imageBase64 && (
              <img
                style={styles.alertImg}
                src={`data:image/jpeg;base64,${alert.imageBase64}`}
                alt="Stranger"
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default LiveView;
