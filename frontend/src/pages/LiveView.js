import React, { useState, useEffect, useRef } from 'react';

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
  sidebar: { flex: '0 0 320px' },
  alertCard: {
    background: '#16213e', borderRadius: '12px', padding: '1rem', marginBottom: '1rem',
    borderLeft: '4px solid #e94560',
  },
  alertTitle: { color: '#e94560', fontWeight: 'bold', marginBottom: '0.5rem' },
  alertTime: { color: '#667', fontSize: '0.8rem' },
  alertImg: { width: '100%', maxHeight: '160px', objectFit: 'cover', borderRadius: '6px', marginTop: '0.5rem' },
};

function LiveView({ socket }) {
  const [currentFrame, setCurrentFrame] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!socket) return;

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    socket.on('new-event', (event) => {
      if (event.motionType !== 'idle') {
        setCurrentFrame(event.thumbnailBase64);
      } else {
        setCurrentFrame(event.thumbnailBase64);
      }
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
          <div style={{ ...styles.img, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#667' }}>
            Waiting for camera...
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
