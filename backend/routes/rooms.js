const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const upload = require('../middleware/upload');

const router = express.Router();

// GET /api/rooms/hostel/:hostelId - all rooms in a hostel (public)
router.get('/hostel/:hostelId', (req, res) => {
  const rooms = db.prepare('SELECT * FROM rooms WHERE hostel_id = ? ORDER BY room_number').all(req.params.hostelId);
  res.json(rooms);
});

// POST /api/rooms - add room to hostel (manager only)
router.post('/', authenticateToken, requireRole('manager'), upload.single('image'), (req, res) => {
  const { hostel_id, room_number, room_type, capacity, price_per_month, description } = req.body;

  if (!hostel_id || !room_number || !room_type || !price_per_month) {
    return res.status(400).json({ error: 'hostel_id, room_number, room_type and price are required' });
  }

  const hostel = db.prepare('SELECT * FROM hostels WHERE id = ?').get(hostel_id);
  if (!hostel) return res.status(404).json({ error: 'Hostel not found' });
  if (hostel.manager_id !== req.user.id) return res.status(403).json({ error: 'Not your hostel' });

  const id = uuidv4();
  const image_url = req.file ? `/uploads/${req.file.filename}` : null;

  db.prepare(`
    INSERT INTO rooms (id, hostel_id, room_number, room_type, capacity, price_per_month, description, image_url)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, hostel_id, room_number, room_type, parseInt(capacity) || 1,
    parseFloat(price_per_month), description || null, image_url);

  res.status(201).json(db.prepare('SELECT * FROM rooms WHERE id = ?').get(id));
});

// PUT /api/rooms/:id - update room
router.put('/:id', authenticateToken, requireRole('manager'), upload.single('image'), (req, res) => {
  const room = db.prepare(`
    SELECT r.*, h.manager_id FROM rooms r JOIN hostels h ON r.hostel_id = h.id WHERE r.id = ?
  `).get(req.params.id);

  if (!room) return res.status(404).json({ error: 'Room not found' });
  if (room.manager_id !== req.user.id) return res.status(403).json({ error: 'Not your room' });

  const { room_number, room_type, capacity, price_per_month, description, is_available } = req.body;
  const image_url = req.file ? `/uploads/${req.file.filename}` : room.image_url;

  db.prepare(`
    UPDATE rooms SET room_number=?, room_type=?, capacity=?, price_per_month=?,
    description=?, is_available=?, image_url=? WHERE id=?
  `).run(
    room_number || room.room_number, room_type || room.room_type,
    capacity ? parseInt(capacity) : room.capacity,
    price_per_month ? parseFloat(price_per_month) : room.price_per_month,
    description ?? room.description,
    is_available !== undefined ? (is_available === 'true' || is_available === true ? 1 : 0) : room.is_available,
    image_url, req.params.id
  );

  res.json(db.prepare('SELECT * FROM rooms WHERE id = ?').get(req.params.id));
});

// DELETE /api/rooms/:id
router.delete('/:id', authenticateToken, requireRole('manager'), (req, res) => {
  const room = db.prepare(`
    SELECT r.*, h.manager_id FROM rooms r JOIN hostels h ON r.hostel_id = h.id WHERE r.id = ?
  `).get(req.params.id);

  if (!room) return res.status(404).json({ error: 'Room not found' });
  if (room.manager_id !== req.user.id) return res.status(403).json({ error: 'Not your room' });

  db.prepare('DELETE FROM rooms WHERE id = ?').run(req.params.id);
  res.json({ message: 'Room deleted' });
});

// POST /api/rooms/:id/book - student books a room
router.post('/:id/book', authenticateToken, requireRole('student'), (req, res) => {
  const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(req.params.id);
  if (!room) return res.status(404).json({ error: 'Room not found' });
  if (!room.is_available) return res.status(400).json({ error: 'Room is not available' });

  const existing = db.prepare(`
    SELECT id FROM bookings WHERE student_id = ? AND room_id = ? AND status != 'rejected'
  `).get(req.user.id, req.params.id);
  if (existing) return res.status(409).json({ error: 'You already have a booking for this room' });

  const id = uuidv4();
  db.prepare(`
    INSERT INTO bookings (id, student_id, room_id, hostel_id, message)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, req.user.id, req.params.id, room.hostel_id, req.body.message || null);

  res.status(201).json({ id, message: 'Booking request submitted' });
});

// GET /api/rooms/bookings/my - student's bookings
router.get('/bookings/my', authenticateToken, requireRole('student'), (req, res) => {
  const bookings = db.prepare(`
    SELECT b.*, r.room_number, r.room_type, r.price_per_month, h.name AS hostel_name, h.address
    FROM bookings b
    JOIN rooms r ON b.room_id = r.id
    JOIN hostels h ON b.hostel_id = h.id
    WHERE b.student_id = ?
    ORDER BY b.created_at DESC
  `).all(req.user.id);
  res.json(bookings);
});

// GET /api/rooms/bookings/hostel/:hostelId - manager sees bookings for their hostel
router.get('/bookings/hostel/:hostelId', authenticateToken, requireRole('manager'), (req, res) => {
  const hostel = db.prepare('SELECT * FROM hostels WHERE id = ?').get(req.params.hostelId);
  if (!hostel || hostel.manager_id !== req.user.id) {
    return res.status(403).json({ error: 'Not your hostel' });
  }

  const bookings = db.prepare(`
    SELECT b.*, r.room_number, r.room_type, u.name AS student_name, u.email AS student_email, u.phone AS student_phone
    FROM bookings b
    JOIN rooms r ON b.room_id = r.id
    JOIN users u ON b.student_id = u.id
    WHERE b.hostel_id = ?
    ORDER BY b.created_at DESC
  `).all(req.params.hostelId);
  res.json(bookings);
});

// PUT /api/rooms/bookings/:id - manager approves/rejects booking
router.put('/bookings/:id', authenticateToken, requireRole('manager'), (req, res) => {
  const { status } = req.body;
  if (!['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'Status must be approved or rejected' });
  }

  const booking = db.prepare(`
    SELECT b.*, h.manager_id FROM bookings b JOIN hostels h ON b.hostel_id = h.id WHERE b.id = ?
  `).get(req.params.id);

  if (!booking) return res.status(404).json({ error: 'Booking not found' });
  if (booking.manager_id !== req.user.id) return res.status(403).json({ error: 'Not your booking to manage' });

  db.prepare('UPDATE bookings SET status = ? WHERE id = ?').run(status, req.params.id);

  // Mark room unavailable if approved
  if (status === 'approved') {
    db.prepare('UPDATE rooms SET is_available = 0 WHERE id = ?').run(booking.room_id);
  }

  res.json({ message: `Booking ${status}` });
});

module.exports = router;
