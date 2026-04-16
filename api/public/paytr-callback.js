const { createApiHandler } = require('../../lib/api/handler');
const paytrCallback = require('../../lib/payments/paytr-callback');

module.exports = createApiHandler(
  {
    methods: ['POST'],
    requireAuth: false,
    rateLimit: 240,
  },
  async (req, res) => {
    await paytrCallback(req, res);
  }
);
