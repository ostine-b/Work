const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const upload = require('../middleware/upload');

const router = express.Router();

// GET /api/hostels - list all hostels (public)
router.get('/', (req, res) => {
  const { city, search } = req.query;
  let query = `
    SELECT h.*, u.name AS manager_name, u.phone AS manager_phone, u.email AS manager_email,
           COUNT(r.id) AS total_rooms,
           SUM(CASE WHEN r.is_available = 1 THEN 1 ELSE 0 END) AS available_rooms
    FROM hostels h
    JOIN users u ON h.manager_id = u.id
    LEFT JOIN rooms r ON r.hostel_id = h.id
  `;
  const params = [];
  const conditions = [];

  if (city) {
    conditions.push('LOWER(h.city) LIKE ?');
    params.push(`%${city.toLowerCase()}%`);
  }
  if (search) {
    conditions.push('(LOWER(h.name) LIKE ? OR LOWER(h.address) LIKE ?)');
    params.push(`%${search.toLowerCase()}%`, `%${search.toLowerCase()}%`);
  }

  if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
  query += ' GROUP BY h.id ORDER BY h.created_at DESC';

  const hostels = db.prepare(query).all(...params);
  res.json(hostels);
});

// GET /api/hostels/my - manager's own hostels
router.get('/my', authenticateToken, requireRole('manager'), (req, res) => {
  const hostels = db.prepare(`
    SELECT h.*, COUNT(r.id) AS total_rooms,
           SUM(CASE WHEN r.is_available = 1 THEN 1 ELSE 0 END) AS available_rooms
    FROM hostels h
    LEFT JOIN rooms r ON r.hostel_id = h.id
    WHERE h.manager_id = ?
    GROUP BY h.id
    ORDER BY h.created_at DESC
  `).all(req.user.id);
  res.json(hostels);
});

// GET /api/hostels/:id
router.get('/:id', (req, res) => {
  const hostel = db.prepare(`
    SELECT h.*, u.name AS manager_name, u.phone AS manager_phone, u.email AS manager_email
    FROM hostels h
    JOIN users u ON h.manager_id = u.id
    WHERE h.id = ?
  `).get(req.params.id);

  if (!hostel) return res.status(404).json({ error: 'Hostel not found' });

  const rooms = db.prepare('SELECT * FROM rooms WHERE hostel_id = ? ORDER BY room_number').all(req.params.id);
  res.json({ ...hostel, rooms });
});

// POST /api/hostels - create hostel (manager only)
router.post('/', authenticateToken, requireRole('manager'), upload.single('image'), (req, res) => {
  const { name, description, address, city, price_per_month, latitude, longitude, amenities } = req.body;

  if (!name || !address || !city || !price_per_month) {
    return res.status(400).json({ error: 'Name, address, city and price are required' });
  }

  const id = uuidv4();
  const image_url = req.file ? `/uploads/${req.file.filename}` : null;

  db.prepare(`
    INSERT INTO hostels (id, manager_id, name, description, address, city, price_per_month, latitude, longitude, amenities, image_url)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, req.user.id, name, description || null, address, city, parseFloat(price_per_month),
    latitude ? parseFloat(latitude) : null, longitude ? parseFloat(longitude) : null,
    amenities || null, image_url);

  const hostel = db.prepare('SELECT * FROM hostels WHERE id = ?').get(id);
  res.status(201).json(hostel);
});

// PUT /api/hostels/:id - update hostel (owner manager only)
router.put('/:id', authenticateToken, requireRole('manager'), upload.single('image'), (req, res) => {
  const hostel = db.prepare('SELECT * FROM hostels WHERE id = ?').get(req.params.id);
  if (!hostel) return res.status(404).json({ error: 'Hostel not found' });
  if (hostel.manager_id !== req.user.id) return res.status(403).json({ error: 'Not your hostel' });

  const { name, description, address, city, price_per_month, latitude, longitude, amenities } = req.body;
  const image_url = req.file ? `/uploads/${req.file.filename}` : hostel.image_url;

  db.prepare(`
    UPDATE hostels SET name=?, description=?, address=?, city=?, price_per_month=?,
    latitude=?, longitude=?, amenities=?, image_url=? WHERE id=?
  `).run(
    name || hostel.name, description ?? hostel.description, address || hostel.address,
    city || hostel.city, price_per_month ? parseFloat(price_per_month) : hostel.price_per_month,
    latitude ? parseFloat(latitude) : hostel.latitude, longitude ? parseFloat(longitude) : hostel.longitude,
    amenities ?? hostel.amenities, image_url, req.params.id
  );

  res.json(db.prepare('SELECT * FROM hostels WHERE id = ?').get(req.params.id));
});

// DELETE /api/hostels/:id
router.delete('/:id', authenticateToken, requireRole('manager'), (req, res) => {
  const hostel = db.prepare('SELECT * FROM hostels WHERE id = ?').get(req.params.id);
  if (!hostel) return res.status(404).json({ error: 'Hostel not found' });
  if (hostel.manager_id !== req.user.id) return res.status(403).json({ error: 'Not your hostel' });

  db.prepare('DELETE FROM hostels WHERE id = ?').run(req.params.id);
  res.json({ message: 'Hostel deleted' });
});

module.exports = router;
