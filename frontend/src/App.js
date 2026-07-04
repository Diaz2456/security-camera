import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';

const SOCKET_URL = process.env.REACT_APP_API_URL || '';

function App() {
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    if (token) {
      const s = io(SOCKET_URL, {
        auth: { token },
        transports: ['websocket', 'polling'],
      });
      s.on('connect', () => console.log('Socket connected'));
      s.on('connect_error', (err) => console.error('Socket error:', err.message));
      setSocket(s);
      return () => s.close();
    }
  }, [token]);

  const handleLogin = (t) => {
    localStorage.setItem('token', t);
    setToken(t);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setToken(null);
    if (socket) socket.close();
  };

  if (!token) {
    return <Login onLogin={handleLogin} />;
  }

  return <Dashboard token={token} socket={socket} onLogout={handleLogout} />;
}

export default App;
