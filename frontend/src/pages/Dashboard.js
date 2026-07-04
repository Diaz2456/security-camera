import React, { useState, useEffect } from 'react';
import LiveView from './LiveView';
import EventLog from './EventLog';
import FaceManagement from './FaceManagement';
import StorageMonitor from './StorageMonitor';
import Settings from './Settings';

const tabs = ['Live View', 'Events', 'Faces', 'Storage', 'Settings'];

const styles = {
  container: { minHeight: '100vh', background: '#0f0f1a' },
  nav: {
    background: '#16213e',
    padding: '0 1rem',
    display: 'flex',
    alignItems: 'center',
    borderBottom: '1px solid #2a2a4a',
    flexWrap: 'wrap',
  },
  logo: { fontSize: '1.2rem', fontWeight: 'bold', color: '#e94560', padding: '1rem 0', marginRight: '2rem' },
  tab: {
    padding: '1rem 1.5rem',
    cursor: 'pointer',
    color: '#8899aa',
    borderBottom: '2px solid transparent',
    transition: 'all 0.2s',
    background: 'none',
    border: 'none',
    fontSize: '0.9rem',
  },
  tabActive: { color: '#e0e0e0', borderBottom: '2px solid #e94560' },
  logout: {
    marginLeft: 'auto',
    padding: '0.5rem 1rem',
    borderRadius: '6px',
    border: '1px solid #e94560',
    background: 'transparent',
    color: '#e94560',
    cursor: 'pointer',
  },
  content: { padding: '1.5rem' },
  alertBar: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    padding: '14px 20px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    cursor: 'pointer',
    fontWeight: 'bold',
    fontSize: '0.95rem',
    boxShadow: '0 2px 12px rgba(0,0,0,0.5)',
    transition: 'transform 0.3s',
  },
  alertStranger: { background: '#dc2626', color: '#fff' },
  alertMotion: { background: '#e94560', color: '#fff' },
  alertTime: { fontSize: '0.75rem', opacity: 0.8, fontWeight: 'normal' },
};

function Dashboard({ token, socket, onLogout }) {
  const [activeTab, setActiveTab] = useState('Live View');
  const [alert, setAlert] = useState(null);

  useEffect(() => {
    if (!socket) return;
    const onStranger = (data) => {
      setAlert({
        type: 'stranger',
        message: 'STRANGER DETECTED!',
        time: new Date(data.timestamp).toLocaleTimeString(),
        image: data.imageBase64,
      });
    };
    const onEvent = (data) => {
      setAlert({
        type: data.motionType || 'motion',
        message: `${(data.motionType || 'Motion').toUpperCase()} event`,
        time: new Date(data.createdAt).toLocaleTimeString(),
      });
    };
    socket.on('stranger-alert', onStranger);
    socket.on('new-event', onEvent);
    return () => {
      socket.off('stranger-alert', onStranger);
      socket.off('new-event', onEvent);
    };
  }, [socket]);

  useEffect(() => {
    if (!alert) return;
    const timer = setTimeout(() => setAlert(null), 6000);
    return () => clearTimeout(timer);
  }, [alert]);

  const renderTab = () => {
    switch (activeTab) {
      case 'Live View': return <LiveView socket={socket} />;
      case 'Events': return <EventLog />;
      case 'Faces': return <FaceManagement />;
      case 'Storage': return <StorageMonitor socket={socket} />;
      case 'Settings': return <Settings />;
      default: return null;
    }
  };

  return (
    <div style={styles.container}>
      {alert && (
        <div
          style={{
            ...styles.alertBar,
            ...(alert.type === 'stranger' ? styles.alertStranger : styles.alertMotion),
          }}
          onClick={() => setAlert(null)}
        >
          <span>{alert.message}</span>
          <span style={styles.alertTime}>
            {alert.time}
            {alert.type === 'stranger' && alert.image && ' | Click to dismiss'}
          </span>
        </div>
      )}
      <div style={styles.nav}>
        <div style={styles.logo}>Security Cam</div>
        {tabs.map((t) => (
          <button
            key={t}
            style={{ ...styles.tab, ...(activeTab === t ? styles.tabActive : {}) }}
            onClick={() => setActiveTab(t)}
          >
            {t}
          </button>
        ))}
        <button style={styles.logout} onClick={onLogout}>Logout</button>
      </div>
      <div style={styles.content}>
        {renderTab()}
      </div>
    </div>
  );
}

export default Dashboard;
