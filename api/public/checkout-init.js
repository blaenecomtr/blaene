const { createApiHandler } = require('../../lib/api/handler');
const checkoutCreateToken = require('../../lib/payments/create-token');

module.exports = createApiHandler(
  {
    methods: ['POST'],
    requireAuth: false,
    rateLimit: 120,
  },
  async (req, res) => {
    await checkoutCreateToken(req, res);
  }
);
