const { createApiHandler } = require('../api/handler');
const checkoutCreateToken = require('../payments/create-token');

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

