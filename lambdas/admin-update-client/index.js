'use strict';

const { UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { ddb, MAIN_TABLE, keys } = require('@ammas/db');
const { resolveUser, assertSuperAdmin } = require('@ammas/auth');
const { ok, forbidden, badRequest } = require('@ammas/response');

exports.handler = async (event) => {
  const user = await resolveUser(event);
  if (!user || !assertSuperAdmin(user)) return forbidden();

  const clientId = event.pathParameters?.clientId;
  if (!clientId) return badRequest('clientId is required');

  const body = JSON.parse(event.body ?? '{}');
  const updates = ['updatedAt = :ua'];
  const values  = { ':ua': new Date().toISOString() };
  const names   = {};

  if (body.name)   { updates.push('#n = :name');   values[':name']   = body.name;   names['#n'] = 'name'; }
  if (body.status) { updates.push('#s = :status'); values[':status'] = body.status; names['#s'] = 'status'; }
  if (updates.length === 1) return badRequest('No updatable fields provided');

  await ddb.send(new UpdateCommand({
    TableName: MAIN_TABLE,
    Key: keys.client(clientId),
    UpdateExpression: `SET ${updates.join(', ')}`,
    ExpressionAttributeValues: values,
    ...(Object.keys(names).length && { ExpressionAttributeNames: names }),
  }));

  return ok({ clientId, updated: true });
};
