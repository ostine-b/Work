const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../database');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// Every admin route requires authentication + admin role.
router.use(authenticateToken, requireRole('admin'));

/* ============================================================
 * GET /api/admin/stats — high-level platform totals
 * ============================================================ */
router.get('/stats', (req, res) => {
  try {
    const usersByRole = db.prepare(`
      SELECT role, COUNT(*) AS count FROM users GROUP BY role
    `).all();
    const roleCounts = { student: 0, manager: 0, admin: 0 };
    usersByRole.forEach(r => { roleCounts[r.role] = r.count; });

    const hostels = db.prepare('SELECT COUNT(*) AS c FROM hostels').get().c;
    const rooms = db.prepare('SELECT COUNT(*) AS c FROM rooms').get().c;
    const availRooms = db.prepare('SELECT COUNT(*) AS c FROM rooms WHERE is_available = 1').get().c;
    const bookings = db.prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) AS approved,
        SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) AS rejected
      FROM bookings
    `).get();
    const messages = db.prepare('SELECT COUNT(*) AS c FROM messages').get().c;
    const unread = db.prepare('SELECT COUNT(*) AS c FROM messages WHERE is_read = 0').get().c;

    res.json({
      users: {
        total: roleCounts.student + roleCounts.manager + roleCounts.admin,
        students: roleCounts.student,
        managers: roleCounts.manager,
        admins: roleCounts.admin
      },
      hostels,
      rooms,
      available_rooms: availRooms,
      bookings: {
        total: bookings.total || 0,
        pending: bookings.pending || 0,
        approved: bookings.approved || 0,
        rejected: bookings.rejected || 0
      },
      messages: { total: messages, unread }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load stats' });
  }
});

/* ============================================================
 * GET /api/admin/users — list all users (optional ?role=&search=)
 * ============================================================ */
router.get('/users', (req, res) => {
  try {
    const { role, search } = req.query;
    const conditions = [];
    const params = [];

    if (role) { conditions.push('role = ?'); params.push(role); }
    if (search) {
      conditions.push('(LOWER(name) LIKE ? OR LOWER(email) LIKE ?)');
      params.push(`%${search.toLowerCase()}%`, `%${search.toLowerCase()}%`);
    }

    let sql = `
      SELECT
        u.id, u.name, u.email, u.role, u.phone, u.created_at,
        (SELECT COUNT(*) FROM hostels h WHERE h.manager_id = u.id) AS hostel_count,
        (SELECT COUNT(*) FROM bookings b WHERE b.student_id = u.id) AS booking_count
      FROM users u
    `;
    if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
    sql += ' ORDER BY u.created_at DESC';

    const users = db.prepare(sql).all(...params);
    res.json(users);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load users' });
  }
});

/* ============================================================
 * PUT /api/admin/users/:id/role — change a user's role
 * ============================================================ */
router.put('/users/:id/role', (req, res) => {
  const { role } = req.body;
  if (!['student', 'manager'].includes(role)) {
    return res.status(400).json({ error: 'Role can only be set to student or manager' });
  }

  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!target) return res.status(404).json({ error: 'User not found' });

  // Guard the admin population: don't touch admin accounts from here.
  if (target.role === 'admin') {
    return res.status(400).json({ error: 'Admin accounts are managed separately' });
  }
  if (req.user.id === target.id) {
    return res.status(400).json({ error: 'You cannot change your own role' });
  }

  db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, req.params.id);
  res.json({ message: 'Role updated', id: target.id, role });
});

/* ============================================================
 * DELETE /api/admin/users/:id — remove a user (cascades hostels/rooms/bookings/messages)
 * ============================================================ */
router.delete('/users/:id', (req, res) => {
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!target) return res.status(404).json({ error: 'User not found' });

  // Never let an admin delete themselves or another admin through this endpoint.
  if (target.role === 'admin') {
    return res.status(400).json({ error: 'Admin accounts cannot be removed here' });
  }
  if (req.user.id === target.id) {
    return res.status(400).json({ error: 'You cannot delete yourself' });
  }

  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ message: 'User removed' });
});

/* ============================================================
 * GET /api/admin/hostels — all hostels with manager + room counts
 * ============================================================ */
router.get('/hostels', (req, res) => {
  try {
    const hostels = db.prepare(`
      SELECT h.*, u.name AS manager_name, u.email AS manager_email,
             COUNT(r.id) AS total_rooms,
             SUM(CASE WHEN r.is_available = 1 THEN 1 ELSE 0 END) AS available_rooms
      FROM hostels h
      JOIN users u ON h.manager_id = u.id
      LEFT JOIN rooms r ON r.hostel_id = h.id
      GROUP BY h.id
      ORDER BY h.created_at DESC
    `).all();
    res.json(hostels);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load hostels' });
  }
});

/* ============================================================
 * DELETE /api/admin/hostels/:id — remove any hostel (admin override)
 * ============================================================ */
router.delete('/hostels/:id', (req, res) => {
  const hostel = db.prepare('SELECT id FROM hostels WHERE id = ?').get(req.params.id);
  if (!hostel) return res.status(404).json({ error: 'Hostel not found' });
  db.prepare('DELETE FROM hostels WHERE id = ?').run(req.params.id);
  res.json({ message: 'Hostel removed' });
});

/* ============================================================
 * GET /api/admin/bookings — every booking across the platform
 * ============================================================ */
router.get('/bookings', (req, res) => {
  try {
    const bookings = db.prepare(`
      SELECT b.*, r.room_number, r.room_type, r.price_per_month,
             h.name AS hostel_name, h.city AS hostel_city,
             s.name AS student_name, s.email AS student_email, s.phone AS student_phone,
             m.name AS manager_name, m.email AS manager_email
      FROM bookings b
      JOIN rooms r   ON b.room_id = r.id
      JOIN hostels h ON b.hostel_id = h.id
      JOIN users s   ON b.student_id = s.id
      JOIN users m   ON h.manager_id = m.id
      ORDER BY b.created_at DESC
    `).all();
    res.json(bookings);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load bookings' });
  }
});

/* ============================================================
 * PUT /api/admin/bookings/:id — admin force-approve/reject a booking
 * ============================================================ */
router.put('/bookings/:id', (req, res) => {
  const { status } = req.body;
  if (!['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'Status must be approved or rejected' });
  }
  const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });

  db.prepare('UPDATE bookings SET status = ? WHERE id = ?').run(status, req.params.id);
  if (status === 'approved') {
    db.prepare('UPDATE rooms SET is_available = 0 WHERE id = ?').run(booking.room_id);
  }
  res.json({ message: `Booking ${status}` });
});

/* ============================================================
 * GET /api/admin/activity — recent platform activity (merged timeline)
 * ============================================================ */
router.get('/activity', (req, res) => {
  try {
    const recentUsers = db.prepare(`
      SELECT 'signup' AS type, id, name AS label, email AS sub, role, created_at
      FROM users ORDER BY created_at DESC LIMIT 6
    `).all();

    const recentBookings = db.prepare(`
      SELECT 'booking' AS type, b.id, s.name AS label, h.name AS sub, b.status, b.created_at
      FROM bookings b
      JOIN users s   ON b.student_id = s.id
      JOIN hostels h ON b.hostel_id = h.id
      ORDER BY b.created_at DESC LIMIT 6
    `).all();

    const recentHostels = db.prepare(`
      SELECT 'hostel' AS type, h.id, h.name AS label, u.name AS sub, h.created_at
      FROM hostels h
      JOIN users u ON h.manager_id = u.id
      ORDER BY h.created_at DESC LIMIT 6
    `).all();

    const merged = [...recentUsers, ...recentBookings, ...recentHostels]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 12);

    res.json(merged);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load activity' });
  }
});

/* ============================================================
 * GET /api/admin/messages/stats — message volume overview (no content)
 * ============================================================ */
router.get('/messages/stats', (req, res) => {
  try {
    const totals = db.prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN is_read = 0 THEN 1 ELSE 0 END) AS unread,
        COUNT(DISTINCT sender_id) AS active_senders
      FROM messages
    `).get();
    const byPair = db.prepare(`
      SELECT
        s.name AS sender, r.name AS receiver,
        COUNT(*) AS messages,
        MAX(m.created_at) AS last_at
      FROM messages m
      JOIN users s ON m.sender_id = s.id
      JOIN users r ON m.receiver_id = r.id
      GROUP BY m.sender_id, m.receiver_id
      ORDER BY last_at DESC
      LIMIT 8
    `).all();
    res.json({ totals, conversations: byPair });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load message stats' });
  }
});

/* ============================================================
 * PUT /api/admin/password — admin changes own password
 * ============================================================ */
router.put('/password', async (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) {
    return res.status(400).json({ error: 'Current and new passwords are required' });
  }
  if (new_password.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters' });
  }

  try {
    const user = db.prepare('SELECT password FROM users WHERE id = ?').get(req.user.id);
    const valid = await bcrypt.compare(current_password, user.password);
    if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });

    const hashed = await bcrypt.hash(new_password, 10);
    db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashed, req.user.id);
    res.json({ message: 'Password updated' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update password' });
  }
});

module.exports = router;
