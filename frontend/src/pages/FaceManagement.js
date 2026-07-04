import React, { useState, useEffect } from 'react';
import { getFaces, enrollFace, deleteFace } from '../utils/api';

const styles = {
  container: { maxWidth: '800px' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' },
  title: { fontSize: '1.2rem', fontWeight: 'bold' },
  addBtn: {
    padding: '8px 16px', borderRadius: '8px', border: 'none',
    background: '#e94560', color: '#fff', cursor: 'pointer',
  },
  form: {
    background: '#16213e', padding: '1.5rem', borderRadius: '12px', marginBottom: '1.5rem',
  },
  input: {
    width: '100%', padding: '10px', marginBottom: '0.75rem', borderRadius: '6px',
    border: '1px solid #2a2a4a', background: '#1a1a2e', color: '#e0e0e0',
  },
  textarea: {
    width: '100%', padding: '10px', marginBottom: '0.75rem', borderRadius: '6px',
    border: '1px solid #2a2a4a', background: '#1a1a2e', color: '#e0e0e0',
    minHeight: '80px', fontFamily: 'monospace', fontSize: '0.85rem',
  },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' },
  card: {
    background: '#16213e', borderRadius: '10px', padding: '1rem',
    border: '1px solid #2a2a4a',
  },
  faceName: { fontWeight: 'bold', marginBottom: '0.5rem' },
  faceDate: { color: '#667', fontSize: '0.8rem', marginBottom: '0.75rem' },
  faceImg: { width: '100%', height: '120px', objectFit: 'cover', borderRadius: '6px', marginBottom: '0.5rem' },
  deleteBtn: {
    padding: '4px 10px', borderRadius: '4px', border: '1px solid #e94560',
    background: 'transparent', color: '#e94560', cursor: 'pointer', fontSize: '0.8rem',
  },
  submitBtn: {
    padding: '10px 20px', borderRadius: '8px', border: 'none',
    background: '#e94560', color: '#fff', cursor: 'pointer',
  },
};

function FaceManagement() {
  const [faces, setFaces] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [label, setLabel] = useState('');
  const [embedding, setEmbedding] = useState('');
  const [imageBase64, setImageBase64] = useState('');
  const [error, setError] = useState('');

  const fetchFaces = async () => {
    try {
      const data = await getFaces();
      setFaces(data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => { fetchFaces(); }, []);

  const handleEnroll = async (e) => {
    e.preventDefault();
    setError('');
    try {
      let embArr;
      try {
        embArr = JSON.parse(embedding);
        if (!Array.isArray(embArr) || embArr.length !== 128) {
          throw new Error('Embedding must be 128 numbers');
        }
      } catch {
        setError('Invalid embedding JSON. Must be [0.1, 0.2, ...] (128 numbers)');
        return;
      }
      await enrollFace(label, embArr, imageBase64 || undefined);
      setLabel('');
      setEmbedding('');
      setImageBase64('');
      setShowForm(false);
      fetchFaces();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async (id) => {
    try {
      await deleteFace(id);
      fetchFaces();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.title}>Face Management</div>
        <button style={styles.addBtn} onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : '+ Enroll Face'}
        </button>
      </div>

      {showForm && (
        <div style={styles.form}>
          <form onSubmit={handleEnroll}>
            <input
              style={styles.input}
              placeholder="Label (e.g., John Doe)"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              required
            />
            <textarea
              style={styles.textarea}
              placeholder="Embedding: [0.1, 0.2, ...] (128 floats)"
              value={embedding}
              onChange={(e) => setEmbedding(e.target.value)}
              required
            />
            <input
              style={styles.input}
              placeholder="Face thumbnail base64 (optional)"
              value={imageBase64}
              onChange={(e) => setImageBase64(e.target.value)}
            />
            {error && <div style={{ color: '#e94560', marginBottom: '0.5rem', fontSize: '0.85rem' }}>{error}</div>}
            <button style={styles.submitBtn} type="submit">Enroll Face</button>
          </form>
        </div>
      )}

      <div style={styles.grid}>
        {faces.map((face) => (
          <div key={face._id} style={styles.card}>
            {face.thumbnailBase64 && (
              <img
                style={styles.faceImg}
                src={`data:image/jpeg;base64,${face.thumbnailBase64}`}
                alt={face.label}
              />
            )}
            <div style={styles.faceName}>{face.label}</div>
            <div style={styles.faceDate}>
              Enrolled: {new Date(face.createdAt).toLocaleDateString()}
            </div>
            <button style={styles.deleteBtn} onClick={() => handleDelete(face._id)}>
              Delete
            </button>
          </div>
        ))}
        {faces.length === 0 && (
          <div style={{ color: '#667' }}>No faces enrolled yet.</div>
        )}
      </div>
    </div>
  );
}

export default FaceManagement;
