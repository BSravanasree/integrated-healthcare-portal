const { prisma } = require('../utils/prisma');
const { v4: uuid } = require('uuid');

async function createReview(req, res, next) {
  try {
    const { providerId, rating, comment } = req.body;
    if (!providerId || !rating) return res.status(400).json({ message: 'Missing fields' });
    const provider = await prisma.provider.findUnique({ where: { id: providerId } });
    if (!provider) return res.status(404).json({ message: 'Provider not found' });
    const review = await prisma.review.create({ data: { id: uuid(), providerId, patientId: req.user.id, rating: Number(rating), comment } });
    const stats = await prisma.review.aggregate({ where: { providerId }, _avg: { rating: true }, _count: { _all: true } });
    await prisma.provider.update({ where: { id: providerId }, data: { rating: Number((stats._avg.rating || 0).toFixed(1)), reviewsCount: stats._count._all } });
    res.json(review);
  } catch (err) { next(err); }
}

module.exports = { createReview };
