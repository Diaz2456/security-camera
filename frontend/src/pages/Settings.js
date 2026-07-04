import React, { useState, useEffect } from 'react';
import { getConfig, updateConfig, sendCommand } from '../utils/api';

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
  dangerButton: {
    padding: '10px 20px', borderRadius: '8px', border: 'none',
    background: '#dc2626', color: '#fff', cursor: 'pointer', marginTop: '1rem',
  },
  dangerText: { color: '#f87171', fontSize: '0.85rem', marginTop: '0.5rem' },
  inputSmall: {
    width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #2a2a4a',
    background: '#1a1a2e', color: '#e0e0e0', marginBottom: '0.5rem', fontSize: '0.9rem',
  },
};

function Settings() {
  const [config, setConfig] = useState({
    retentionDays: 7,
    storageAlertThreshold: 80,
  });
  const [saved, setSaved] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [cmdStatus, setCmdStatus] = useState('');

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

  const handleReset = async () => {
    if (!apiKey.trim()) {
      setCmdStatus('Enter the ESP32 API key first');
      return;
    }
    if (!window.confirm('This will reset the ESP32 credentials (WiFi + admin) and reboot it. Continue?')) return;
    try {
      setCmdStatus('Sending reset command...');
      await sendCommand(apiKey.trim(), 'reset');
      setCmdStatus('Reset command sent! ESP32 will reset on next check-in.');
    } catch (err) {
      setCmdStatus('Failed: ' + err.message);
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

      <div style={{ ...styles.card, border: '1px solid #dc2626' }}>
        <div style={{ color: '#f87171', fontWeight: 'bold', marginBottom: '0.5rem' }}>Danger Zone</div>
        <label style={styles.label}>ESP32 API Key</label>
        <input
          style={styles.inputSmall}
          type="text"
          placeholder="Enter the API key from your ESP32 config"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
        />
        <button style={styles.dangerButton} onClick={handleReset}>
          Reset ESP32 Credentials
        </button>
        <div style={styles.dangerText}>
          Sends a command to reset WiFi + admin credentials on the ESP32. The camera will reboot into AP mode.
        </div>
        {cmdStatus && <div style={styles.success}>{cmdStatus}</div>}
      </div>
    </div>
  );
}

export default Settings;
