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

  await ddb.send(new UpdateCommand({
    TableName: MAIN_TABLE,
    Key: keys.client(clientId),
    UpdateExpression: 'SET #s = :deleted, updatedAt = :ua',
    ExpressionAttributeNames: { '#s': 'status' },
    ExpressionAttributeValues: { ':deleted': 'deleted', ':ua': new Date().toISOString() },
  }));

  return ok({ clientId, deleted: true });
};
