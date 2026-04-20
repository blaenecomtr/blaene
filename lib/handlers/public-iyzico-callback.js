const { createApiHandler } = require('../api/handler');
const iyzicoCallback = require('../payments/iyzico-callback');

module.exports = createApiHandler(
  {
    methods: ['POST'],
    requireAuth: false,
    rateLimit: 240,
  },
  async (req, res) => {
    await iyzicoCallback(req, res);
  }
);

