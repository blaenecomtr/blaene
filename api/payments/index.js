const { createApiHandler } = require('../../lib/api/handler');
const { sendError } = require('../../lib/api/response');

module.exports = createApiHandler(
  {
    methods: ['GET', 'POST'],
    requireAuth: true,
    rateLimit: 80,
    requiredTier: 'pro',
  },
  async (req, res) => {
    return sendError(
      res,
      501,
      'Payment provider integration is not active yet. This namespace is reserved for future live payments.',
      'PAYMENTS_NOT_IMPLEMENTED'
    );
  }
);
