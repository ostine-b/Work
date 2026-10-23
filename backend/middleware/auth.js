const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'hostel_secret_key_2024';

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired token' });
    req.user = user;
    next();
  });
}

function requireRole(role) {
  return (req, res, next) => {
    if (req.user.role !== role) {
      return res.status(403).json({ error: `Access restricted to ${role}s only` });
    }
    next();
  };
}

module.exports = { authenticateToken, requireRole, JWT_SECRET };
