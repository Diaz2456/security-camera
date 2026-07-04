import React, { useState, useEffect } from 'react';
import { getEvents, lockEvent, unlockEvent } from '../utils/api';

const typeColors = {
  idle: '#667',
  motion: '#fbbf24',
  person: '#60a5fa',
  animal: '#34d399',
  package: '#a78bfa',
  vehicle: '#f472b6',
  unknown: '#9ca3af',
  stranger: '#e94560',
};

const styles = {
  container: { maxWidth: '1000px' },
  filters: { display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' },
  filterBtn: (active) => ({
    padding: '6px 14px', borderRadius: '20px', border: '1px solid #2a2a4a',
    background: active ? '#e94560' : 'transparent', color: '#e0e0e0',
    cursor: 'pointer', fontSize: '0.85rem',
  }),
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1rem' },
  card: (type) => ({
    background: '#16213e', borderRadius: '10px', overflow: 'hidden',
    cursor: 'pointer', transition: 'transform 0.2s',
    border: `1px solid ${typeColors[type] || '#2a2a4a'}`,
  }),
  thumb: { width: '100%', height: '150px', objectFit: 'cover', display: 'block' },
  info: { padding: '0.75rem' },
  type: (t) => ({ color: typeColors[t] || '#667', fontWeight: 'bold', fontSize: '0.8rem' }),
  time: { color: '#667', fontSize: '0.75rem', marginTop: '0.25rem' },
  lockBtn: {
    marginTop: '0.5rem', padding: '4px 10px', borderRadius: '4px',
    border: '1px solid #2a2a4a', background: 'transparent', color: '#8899aa',
    cursor: 'pointer', fontSize: '0.75rem',
  },
  pagination: { display: 'flex', justifyContent: 'center', gap: '0.5rem', marginTop: '1.5rem', flexWrap: 'wrap' },
  pageBtn: (active) => ({
    padding: '6px 12px', borderRadius: '6px', border: '1px solid #2a2a4a',
    background: active ? '#e94560' : 'transparent', color: '#e0e0e0', cursor: 'pointer',
  }),
  disabledBtn: {
    padding: '6px 12px', borderRadius: '6px', border: '1px solid #2a2a4a',
    background: 'transparent', color: '#445', cursor: 'default', opacity: 0.4,
  },
};

function EventLog() {
  const [events, setEvents] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [expandedImage, setExpandedImage] = useState(null);

  const fetchEvents = async (p, f) => {
    try {
      const params = { page: p, limit: 20 };
      if (f) params.type = f;
      const data = await getEvents(params);
      setEvents(data.events);
      setTotal(data.total);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchEvents(page, filter);
  }, [page, filter]);

  const handleFilter = (f) => {
    setFilter(f);
    setPage(1);
  };

  const handleLock = async (id) => {
    try {
      await lockEvent(id);
      fetchEvents(page, filter);
    } catch (err) {
      console.error(err);
    }
  };

  const handleUnlock = async (id) => {
    try {
      await unlockEvent(id);
      fetchEvents(page, filter);
    } catch (err) {
      console.error(err);
    }
  };

  const pages = Math.ceil(total / 20);

  const getPageRange = () => {
    const range = [];
    const start = Math.max(1, page - 4);
    const end = Math.min(pages, page + 5);
    for (let i = start; i <= end; i++) range.push(i);
    return range;
  };

  const types = ['', 'motion', 'person', 'animal', 'package', 'vehicle', 'stranger'];

  return (
    <div style={styles.container}>
      <div style={styles.filters}>
        {types.map((t) => (
          <button
            key={t}
            style={styles.filterBtn(filter === t)}
            onClick={() => handleFilter(t)}
          >
            {t || 'All'}
          </button>
        ))}
      </div>
      <div style={{ color: '#667', marginBottom: '1rem', fontSize: '0.85rem' }}>
        {total} events &mdash; page {page} of {pages}
      </div>
      <div style={styles.grid}>
        {events.map((ev) => (
          <div key={ev._id} style={styles.card(ev.motionType)}>
            <img
              style={styles.thumb}
              src={`data:image/jpeg;base64,${ev.thumbnailBase64}`}
              alt={ev.motionType}
            />
            <div style={styles.info}>
              <div style={styles.type(ev.motionType)}>
                {ev.motionType.toUpperCase()}
                {ev.isStranger && ' !STRANGER'}
                {ev.faceLabel && ` - ${ev.faceLabel}`}
              </div>
              <div style={styles.time}>
                {new Date(ev.createdAt).toLocaleString()}
              </div>
              {ev.locked ? (
                <button style={styles.lockBtn} onClick={() => handleUnlock(ev._id)}>
                  Unlock
                </button>
              ) : (
                <button style={styles.lockBtn} onClick={() => handleLock(ev._id)}>
                  Lock
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      {pages > 1 && (
        <div style={styles.pagination}>
          <button
            style={page <= 1 ? styles.disabledBtn : styles.pageBtn(false)}
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            &laquo; Prev
          </button>
          {getPageRange().map((p) => (
            <button
              key={p}
              style={styles.pageBtn(page === p)}
              onClick={() => setPage(p)}
            >
              {p}
            </button>
          ))}
          <button
            style={page >= pages ? styles.disabledBtn : styles.pageBtn(false)}
            disabled={page >= pages}
            onClick={() => setPage(page + 1)}
          >
            Next &raquo;
          </button>
        </div>
      )}
    </div>
  );
}

export default EventLog;
