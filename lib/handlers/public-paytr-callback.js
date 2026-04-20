const { createApiHandler } = require('../api/handler');
const paytrCallback = require('../payments/paytr-callback');

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

