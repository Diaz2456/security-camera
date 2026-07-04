import React, { useState, useEffect } from 'react';
import { getStorageUsage } from '../utils/api';

const MAX_STORAGE = parseInt(process.env.REACT_APP_MAX_STORAGE_BYTES) || 524288000;

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

const styles = {
  container: { maxWidth: '600px' },
  title: { fontSize: '1.2rem', fontWeight: 'bold', marginBottom: '1.5rem' },
  barOuter: {
    width: '100%', height: '32px', background: '#1a1a2e', borderRadius: '16px',
    overflow: 'hidden', marginBottom: '1rem',
  },
  barInner: (pct) => ({
    width: `${Math.min(pct, 100)}%`, height: '100%',
    background: pct > 80 ? '#e94560' : pct > 60 ? '#fbbf24' : '#4ade80',
    borderRadius: '16px', transition: 'width 0.5s',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: '#fff', fontSize: '0.8rem', fontWeight: 'bold',
    minWidth: pct > 10 ? '0' : '0',
  }),
  stats: { display: 'grid', gap: '0.75rem' },
  statRow: { display: 'flex', justifyContent: 'space-between', padding: '0.75rem', background: '#16213e', borderRadius: '8px' },
  statLabel: { color: '#8899aa' },
  statValue: { color: '#e0e0e0', fontWeight: 'bold' },
  warning: {
    padding: '1rem', borderRadius: '8px', marginTop: '1rem',
    background: '#451a1a', border: '1px solid #e94560', color: '#ff6b6b',
  },
  info: {
    padding: '1rem', borderRadius: '8px', marginTop: '1rem',
    background: '#1a2e1a', border: '1px solid #4ade80', color: '#4ade80',
  },
};

function StorageMonitor({ socket }) {
  const [usage, setUsage] = useState(null);

  const fetchUsage = async () => {
    try {
      const data = await getStorageUsage();
      setUsage(data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchUsage();
    if (socket) {
      socket.on('storage-update', (data) => setUsage(data));
      return () => socket.off('storage-update');
    }
  }, [socket]);

  if (!usage) return <div>Loading...</div>;

  const pct = parseFloat(usage.percentUsed);
  const isWarning = pct > 80;
  const isCritical = pct > 90;

  return (
    <div style={styles.container}>
      <div style={styles.title}>Storage Monitor (500 MB cap)</div>
      <div style={styles.barOuter}>
        <div style={styles.barInner(pct)}>
          {pct > 15 ? `${usage.percentUsed}%` : ''}
        </div>
      </div>
      <div style={styles.stats}>
        <div style={styles.statRow}>
          <span style={styles.statLabel}>Total Used</span>
          <span style={styles.statValue}>{formatBytes(usage.totalBytes)}</span>
        </div>
        <div style={styles.statRow}>
          <span style={styles.statLabel}>Event Thumbnails</span>
          <span style={styles.statValue}>{formatBytes(usage.events.bytes)} ({usage.events.count} events)</span>
        </div>
        <div style={styles.statRow}>
          <span style={styles.statLabel}>Alert Images</span>
          <span style={styles.statValue}>{formatBytes(usage.alerts.bytes)} ({usage.alerts.count} images)</span>
        </div>
        <div style={styles.statRow}>
          <span style={styles.statLabel}>Face Data</span>
          <span style={styles.statValue}>{formatBytes(usage.faces.bytes)} ({usage.faces.count} faces)</span>
        </div>
        <div style={styles.statRow}>
          <span style={styles.statLabel}>Max Capacity</span>
          <span style={styles.statValue}>500 MB</span>
        </div>
      </div>
      {isWarning && !isCritical && (
        <div style={styles.warning}>
          Warning: Storage exceeds 80%. Old events will be automatically purged.
        </div>
      )}
      {isCritical && (
        <div style={styles.warning}>
          CRITICAL: Storage exceeds 90%. Emergency rolling deletion is active.
        </div>
      )}
      {pct < 60 && (
        <div style={styles.info}>
          Storage is healthy. Auto-cleanup runs hourly.
        </div>
      )}
    </div>
  );
}

export default StorageMonitor;
