const {
  ROLE_VIEWER,
  SUBSCRIPTION_PRIORITY,
  ROLE_PRIORITY,
} = require('./constants');
const { extractBearerToken } = require('./request');
const { normalizeRole, normalizeTier } = require('./validation');
const { fetchAuthUser, restSelect } = require('./supabase');

function hasRole(profileRole, acceptedRoles) {
  if (!acceptedRoles || !acceptedRoles.length) return true;
  const normalizedRole = normalizeRole(profileRole, ROLE_VIEWER);
  return acceptedRoles.includes(normalizedRole);
}

function hasTierAtLeast(currentTier, requiredTier) {
  if (!requiredTier) return true;
  const current = SUBSCRIPTION_PRIORITY[normalizeTier(currentTier, 'free')] || 0;
  const required = SUBSCRIPTION_PRIORITY[normalizeTier(requiredTier, 'free')] || 0;
  return current >= required;
}

function canManageRole(actorRole, targetRole) {
  const actor = ROLE_PRIORITY[normalizeRole(actorRole, ROLE_VIEWER)] || 0;
  const target = ROLE_PRIORITY[normalizeRole(targetRole, ROLE_VIEWER)] || 0;
  return actor > target;
}

async function fetchUserProfile(config, userId) {
  const rows = await restSelect(config, 'user_profiles', {
    select: 'id,email,full_name,role,subscription_tier,is_active,last_seen_at',
    id: `eq.${userId}`,
    limit: 1,
  });
  return rows[0] || null;
}

function deriveProfileFallback(user) {
  return {
    id: user.id,
    email: user.email || null,
    role: ROLE_VIEWER,
    subscription_tier: 'free',
    is_active: true,
  };
}

async function requireUser(req, config) {
  const accessToken = extractBearerToken(req);
  if (!accessToken) {
    const error = new Error('Unauthorized');
    error.httpStatus = 401;
    error.code = 'AUTH_REQUIRED';
    throw error;
  }

  const user = await fetchAuthUser(config, accessToken);
  if (!user) {
    const error = new Error('Invalid token');
    error.httpStatus = 401;
    error.code = 'AUTH_INVALID_TOKEN';
    throw error;
  }

  let profile = null;
  try {
    profile = await fetchUserProfile(config, user.id);
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[auth] profile fetch fallback:', error?.message || error);
    }
  }
  profile = profile || deriveProfileFallback(user);

  if (profile.is_active === false) {
    const error = new Error('Account disabled');
    error.httpStatus = 403;
    error.code = 'AUTH_ACCOUNT_DISABLED';
    throw error;
  }

  return {
    accessToken,
    user,
    profile: {
      ...profile,
      role: normalizeRole(profile.role, ROLE_VIEWER),
      subscription_tier: normalizeTier(profile.subscription_tier, 'free'),
    },
  };
}

function assertPermissions(profile, options = {}) {
  const role = normalizeRole(profile?.role, ROLE_VIEWER);
  if (options.roles && options.roles.length && !hasRole(role, options.roles)) {
    const error = new Error('Forbidden');
    error.httpStatus = 403;
    error.code = 'AUTH_FORBIDDEN_ROLE';
    throw error;
  }

  if (!hasTierAtLeast(profile?.subscription_tier, options.requiredTier)) {
    const error = new Error('Subscription tier required');
    error.httpStatus = 403;
    error.code = 'SUBSCRIPTION_TIER_REQUIRED';
    throw error;
  }
}

module.exports = {
  hasRole,
  hasTierAtLeast,
  canManageRole,
  requireUser,
  assertPermissions,
  fetchUserProfile,
};
