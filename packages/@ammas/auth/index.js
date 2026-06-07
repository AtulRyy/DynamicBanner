'use strict';

const { GetCommand } = require('@aws-sdk/lib-dynamodb');
const { ddb, MAIN_TABLE, keys } = require('@ammas/db');

const UserRole = {
  SUPER_ADMIN:  'SUPER_ADMIN',
  CLIENT_ADMIN: 'CLIENT_ADMIN',
  STORE:        'STORE',
};

async function resolveUser(event) {
  const sub = event.requestContext?.authorizer?.jwt?.claims?.sub;
  if (!sub) return null;

  const result = await ddb.send(
    new GetCommand({ TableName: MAIN_TABLE, Key: keys.user(sub) })
  );
  return result.Item ?? null;
}

function assertSuperAdmin(user) {
  return user.role === UserRole.SUPER_ADMIN;
}

function assertClientAccess(user, clientId) {
  if (user.role === UserRole.SUPER_ADMIN) return true;
  return user.role === UserRole.CLIENT_ADMIN && user.clientId === clientId;
}

function assertBranchAccess(user, branchId) {
  if (user.role === UserRole.SUPER_ADMIN) return true;
  if (user.role === UserRole.CLIENT_ADMIN) return true;
  return user.role === UserRole.STORE && user.branchId === branchId;
}

module.exports = { UserRole, resolveUser, assertSuperAdmin, assertClientAccess, assertBranchAccess };
