const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { prisma } = require('../utils/prisma');
const { v4: uuid } = require('uuid');
const SECRET = process.env.JWT_SECRET || 'secret';
const SALT = 10;

async function register(req, res, next) {
  try {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password) return res.status(400).json({ message: 'Missing fields' });
    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) return res.status(400).json({ message: 'Email already registered' });
    const hash = await bcrypt.hash(password, SALT);
    const id = uuid();
    const user = await prisma.user.create({ data: { id, name, email, passwordHash: hash, role: role || 'PATIENT' } });
    const token = jwt.sign({ sub: user.id, role: user.role }, SECRET, { expiresIn: '8h' });
    res.json({ token, profile: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (err) { next(err); }
}

async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(401).json({ message: 'Invalid credentials' });
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ message: 'Invalid credentials' });
    const token = jwt.sign({ sub: user.id, role: user.role }, SECRET, { expiresIn: '8h' });
    res.json({ token, profile: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (err) { next(err); }
}

module.exports = { register, login };
