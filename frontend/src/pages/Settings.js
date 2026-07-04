import React, { useState, useEffect } from 'react';
import { getConfig, updateConfig } from '../utils/api';

const styles = {
  container: { maxWidth: '500px' },
  title: { fontSize: '1.2rem', fontWeight: 'bold', marginBottom: '1.5rem' },
  card: { background: '#16213e', borderRadius: '12px', padding: '1.5rem', marginBottom: '1rem' },
  label: { color: '#8899aa', fontSize: '0.9rem', marginBottom: '0.5rem', display: 'block' },
  input: {
    width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #2a2a4a',
    background: '#1a1a2e', color: '#e0e0e0', marginBottom: '1rem',
  },
  select: {
    width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #2a2a4a',
    background: '#1a1a2e', color: '#e0e0e0', marginBottom: '1rem',
  },
  button: {
    padding: '10px 20px', borderRadius: '8px', border: 'none',
    background: '#e94560', color: '#fff', cursor: 'pointer',
  },
  success: { color: '#4ade80', marginTop: '0.5rem' },
};

function Settings() {
  const [config, setConfig] = useState({
    retentionDays: 7,
    storageAlertThreshold: 80,
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getConfig().then((cfg) => {
      if (cfg.retentionDays) setConfig((c) => ({ ...c, ...cfg }));
    }).catch(() => {});
  }, []);

  const handleSave = async () => {
    try {
      await updateConfig(config);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.title}>Settings</div>
      <div style={styles.card}>
        <label style={styles.label}>Event Retention (days)</label>
        <input
          style={styles.input}
          type="number"
          min={1}
          max={30}
          value={config.retentionDays}
          onChange={(e) => setConfig({ ...config, retentionDays: parseInt(e.target.value) || 7 })}
        />

        <label style={styles.label}>Storage Alert Threshold (%)</label>
        <input
          style={styles.input}
          type="number"
          min={50}
          max={95}
          value={config.storageAlertThreshold}
          onChange={(e) => setConfig({ ...config, storageAlertThreshold: parseInt(e.target.value) || 80 })}
        />

        <button style={styles.button} onClick={handleSave}>Save Settings</button>
        {saved && <div style={styles.success}>Saved!</div>}
      </div>
    </div>
  );
}

export default Settings;
