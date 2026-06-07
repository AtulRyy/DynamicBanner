'use strict';

const { UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { ddb, MAIN_TABLE, keys } = require('@ammas/db');
const { resolveUser, assertClientAccess } = require('@ammas/auth');
const { ok, forbidden, badRequest } = require('@ammas/response');

exports.handler = async (event) => {
  const user     = await resolveUser(event);
  const clientId = event.pathParameters?.clientId;
  const branchId = event.pathParameters?.branchId;
  if (!user || !clientId || !branchId || !assertClientAccess(user, clientId)) return forbidden();

  const body    = JSON.parse(event.body ?? '{}');
  const updates = ['updatedAt = :ua'];
  const values  = { ':ua': new Date().toISOString() };
  const names   = {};

  if (body.name)     { updates.push('#n = :name'); values[':name'] = body.name; names['#n'] = 'name'; }
  if (body.location) { updates.push('loc = :loc'); values[':loc']  = body.location; }
  if (updates.length === 1) return badRequest('No updatable fields provided');

  await ddb.send(new UpdateCommand({
    TableName: MAIN_TABLE,
    Key: keys.branch(clientId, branchId),
    UpdateExpression: `SET ${updates.join(', ')}`,
    ExpressionAttributeValues: values,
    ...(Object.keys(names).length && { ExpressionAttributeNames: names }),
  }));

  return ok({ branchId, updated: true });
};
