const { prisma } = require('../utils/prisma');
const { v4: uuid } = require('uuid');

async function listProviders(req, res, next) {
  try {
    const providers = await prisma.provider.findMany();
    res.json(providers);
  } catch (err) { next(err); }
}

async function createProvider(req, res, next) {
  try {
    const { name, specialty, bio, fees } = req.body;
    if (!name) return res.status(400).json({ message: 'Name required' });
    const id = uuid();
    const provider = await prisma.provider.create({ data: { id, name, specialty, bio, fees: Number(fees || 0), userId: req.user.id } });
    res.json(provider);
  } catch (err) { next(err); }
}

async function getProvider(req, res, next) {
  try {
    const id = req.params.id;
    const provider = await prisma.provider.findUnique({ where: { id } });
    if (!provider) return res.status(404).json({ message: 'Provider not found' });
    const reviews = await prisma.review.findMany({ where: { providerId: id } });
    res.json({ provider, reviews });
  } catch (err) { next(err); }
}

async function toggleVerify(req, res, next) {
  try {
    const id = req.params.id;
    const provider = await prisma.provider.update({ where: { id }, data: { verified: true } });
    res.json(provider);
  } catch (err) { next(err); }
}

module.exports = { listProviders, createProvider, getProvider, toggleVerify };
