const ROLE_SUPER_ADMIN = 'super_admin';
const ROLE_ADMIN = 'admin';
const ROLE_EDITOR = 'editor';
const ROLE_VIEWER = 'viewer';

const ROLES = [
  ROLE_SUPER_ADMIN,
  ROLE_ADMIN,
  ROLE_EDITOR,
  ROLE_VIEWER,
];

const ROLE_PRIORITY = {
  [ROLE_SUPER_ADMIN]: 400,
  [ROLE_ADMIN]: 300,
  [ROLE_EDITOR]: 200,
  [ROLE_VIEWER]: 100,
};

const SUBSCRIPTION_TIERS = ['free', 'pro', 'enterprise'];
const SUBSCRIPTION_PRIORITY = {
  free: 100,
  pro: 200,
  enterprise: 300,
};

const PAYMENT_PUBLIC_PATHS = [
  '/api/public/checkout-init',
  '/api/public/paytr-callback',
  '/api/public/iyzico-callback',
];

module.exports = {
  ROLE_SUPER_ADMIN,
  ROLE_ADMIN,
  ROLE_EDITOR,
  ROLE_VIEWER,
  ROLES,
  ROLE_PRIORITY,
  SUBSCRIPTION_TIERS,
  SUBSCRIPTION_PRIORITY,
  PAYMENT_PUBLIC_PATHS,
};
