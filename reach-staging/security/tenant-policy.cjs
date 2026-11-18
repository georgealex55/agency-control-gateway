'use strict';
// REACH 2.2 STAGING ONLY: deny-by-default tenant authorization boundary.
// Call at every repository/API entry point before resolving any resource.
const ID = /^[A-Za-z0-9_-]{1,80}$/;
const PERMISSIONS = Object.freeze({
  owner: Object.freeze(['read','create','update','delete']),
  staff: Object.freeze(['read','create','update'])
});
function assertTenantAccess({ session, tenantId, action, resourceTenantId, requiredRole } = {}) {
  if (!session || typeof session !== 'object' || !Object.isFrozen(session) ||
      !ID.test(session.userId || '') || !ID.test(session.tenantId || '') ||
      !ID.test(tenantId || '') || session.tenantId !== tenantId ||
      !Object.hasOwn(PERMISSIONS, session.role) ||
      !PERMISSIONS[session.role].includes(action) ||
      (requiredRole && session.role !== requiredRole) ||
      (resourceTenantId !== undefined && (!ID.test(resourceTenantId || '') || resourceTenantId !== tenantId))) {
    const error = new Error('Forbidden');
    error.code = 'FORBIDDEN';
    error.status = 403;
    throw error;
  }
  return Object.freeze({ tenantId, userId: session.userId, role: session.role, action });
}
// Enforces tenant filtering before invoking a data-access callback; never trusts
// caller-supplied resource IDs or client-provided tenant ownership.
function withTenantRepository(session, tenantId, operation, callback, options = {}) {
  const scope = assertTenantAccess({session, tenantId, action: operation, ...options});
  if (typeof callback !== 'function') throw new TypeError('Repository callback required');
  return callback(scope);
}
module.exports = { assertTenantAccess, withTenantRepository };
