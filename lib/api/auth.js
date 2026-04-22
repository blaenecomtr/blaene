const {
  ROLE_ADMIN,
  ROLE_VIEWER,
  SUBSCRIPTION_PRIORITY,
  ROLE_PRIORITY,
} = require('./constants');
const { extractBearerToken } = require('./request');
const { normalizeRole, normalizeTier } = require('./validation');
const { fetchAuthUser, restSelect, restInsert } = require('./supabase');

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
  const metadataRole = normalizeRole(user?.app_metadata?.role || user?.user_metadata?.role, '');
  const metadataTier = normalizeTier(user?.app_metadata?.subscription_tier || user?.user_metadata?.subscription_tier, '');
  const metadataIsActive = user?.app_metadata?.is_active ?? user?.user_metadata?.is_active;

  return {
    id: user.id,
    email: user.email || null,
    role: metadataRole || ROLE_VIEWER,
    subscription_tier: metadataTier || 'free',
    is_active: metadataIsActive === false ? false : true,
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
  let profileFoundInTable = false;
  let profileStoreAvailable = true;
  try {
    profile = await fetchUserProfile(config, user.id);
    profileFoundInTable = Boolean(profile);
  } catch (error) {
    profileStoreAvailable = false;
    if (process.env.NODE_ENV !== 'production') {
      console.error('[auth] profile fetch fallback:', error?.message || error);
    }
  }
  const fallbackProfile = deriveProfileFallback(user);
  if (!profile) {
    profile = fallbackProfile;
  } else {
    const metadataRole = normalizeRole(user?.app_metadata?.role || user?.user_metadata?.role, '');
    const metadataTier = normalizeTier(user?.app_metadata?.subscription_tier || user?.user_metadata?.subscription_tier, '');
    const metadataIsActive = user?.app_metadata?.is_active ?? user?.user_metadata?.is_active;

    profile = {
      ...fallbackProfile,
      ...profile,
      // Login flow already accepts metadata role. Keep effective role aligned here
      // so write APIs don't fail with AUTH_FORBIDDEN_ROLE for the same session.
      role: metadataRole || profile.role || fallbackProfile.role,
      subscription_tier: metadataTier || profile.subscription_tier || fallbackProfile.subscription_tier,
      // If either profile or metadata marks user disabled, keep disabled.
      is_active:
        metadataIsActive === false ||
        profile.is_active === false
          ? false
          : true,
    };
  }

  // If schema is initialized but profile row is missing, seed it from auth metadata
  // to keep role/tier checks consistent across requests.
  if (profileStoreAvailable && !profileFoundInTable) {
    const seedProfile = {
      id: user.id,
      email: user.email || null,
      full_name: user?.user_metadata?.full_name || null,
      role: normalizeRole(profile.role, ROLE_VIEWER),
      subscription_tier: normalizeTier(profile.subscription_tier, 'free'),
      is_active: profile.is_active === false ? false : true,
    };
    try {
      await restInsert(config, 'user_profiles', seedProfile, { prefer: 'return=minimal' });
      profile = { ...profile, ...seedProfile };
    } catch {
      // Ignore: row may already exist or table constraints may differ.
    }
  }

  if (profile.is_active === false) {
    const error = new Error('Account disabled');
    error.httpStatus = 403;
    error.code = 'AUTH_ACCOUNT_DISABLED';
    throw error;
  }

  let effectiveRole = normalizeRole(profile.role, ROLE_VIEWER);
  if (!profileStoreAvailable) {
    const error = new Error('Profil servisi erisilemez durumda. Erisim reddedildi.');
    error.httpStatus = 503;
    error.code = 'AUTH_PROFILE_STORE_UNAVAILABLE';
    throw error;
  }

  return {
    accessToken,
    user,
    profile: {
      ...profile,
      role: effectiveRole,
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
