const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// POST /api/messages - send a message
router.post('/', authenticateToken, (req, res) => {
  const { receiver_id, content, hostel_id } = req.body;

  if (!receiver_id || !content) {
    return res.status(400).json({ error: 'receiver_id and content are required' });
  }

  const receiver = db.prepare('SELECT id FROM users WHERE id = ?').get(receiver_id);
  if (!receiver) return res.status(404).json({ error: 'Receiver not found' });

  const id = uuidv4();
  db.prepare(`
    INSERT INTO messages (id, sender_id, receiver_id, hostel_id, content)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, req.user.id, receiver_id, hostel_id || null, content);

  res.status(201).json({ id, message: 'Message sent' });
});

// GET /api/messages/conversations - list all conversations (grouped by other user)
router.get('/conversations', authenticateToken, (req, res) => {
  const conversations = db.prepare(`
    SELECT DISTINCT
      CASE WHEN m.sender_id = ? THEN m.receiver_id ELSE m.sender_id END AS other_user_id,
      u.name AS other_user_name, u.role AS other_user_role,
      MAX(m.created_at) AS last_message_time,
      (SELECT content FROM messages
       WHERE (sender_id = ? AND receiver_id = other_user_id)
          OR (sender_id = other_user_id AND receiver_id = ?)
       ORDER BY created_at DESC LIMIT 1) AS last_message,
      SUM(CASE WHEN m.receiver_id = ? AND m.is_read = 0 THEN 1 ELSE 0 END) AS unread_count
    FROM messages m
    JOIN users u ON u.id = CASE WHEN m.sender_id = ? THEN m.receiver_id ELSE m.sender_id END
    WHERE m.sender_id = ? OR m.receiver_id = ?
    GROUP BY other_user_id
    ORDER BY last_message_time DESC
  `).all(req.user.id, req.user.id, req.user.id, req.user.id, req.user.id, req.user.id, req.user.id);

  res.json(conversations);
});

// GET /api/messages/:userId - get conversation with a specific user
router.get('/:userId', authenticateToken, (req, res) => {
  const messages = db.prepare(`
    SELECT m.*, 
      s.name AS sender_name, s.role AS sender_role,
      r.name AS receiver_name
    FROM messages m
    JOIN users s ON m.sender_id = s.id
    JOIN users r ON m.receiver_id = r.id
    WHERE (m.sender_id = ? AND m.receiver_id = ?)
       OR (m.sender_id = ? AND m.receiver_id = ?)
    ORDER BY m.created_at ASC
  `).all(req.user.id, req.params.userId, req.params.userId, req.user.id);

  // Mark messages as read
  db.prepare(`
    UPDATE messages SET is_read = 1
    WHERE sender_id = ? AND receiver_id = ? AND is_read = 0
  `).run(req.params.userId, req.user.id);

  res.json(messages);
});

// GET /api/messages/unread/count - count unread messages
router.get('/unread/count', authenticateToken, (req, res) => {
  const result = db.prepare('SELECT COUNT(*) AS count FROM messages WHERE receiver_id = ? AND is_read = 0').get(req.user.id);
  res.json(result);
});

// GET /api/messages/managers/list - students get list of managers to contact
router.get('/managers/list', authenticateToken, (req, res) => {
  const managers = db.prepare(`
    SELECT u.id, u.name, u.email, u.phone, h.name AS hostel_name, h.id AS hostel_id
    FROM users u
    LEFT JOIN hostels h ON h.manager_id = u.id
    WHERE u.role = 'manager'
    ORDER BY u.name
  `).all();
  res.json(managers);
});

module.exports = router;
