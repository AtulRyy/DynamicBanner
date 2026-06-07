'use strict';

const { QueryCommand } = require('@aws-sdk/lib-dynamodb');
const { ddb, MAIN_TABLE } = require('@ammas/db');
const { resolveUser, assertClientAccess } = require('@ammas/auth');
const { ok, forbidden } = require('@ammas/response');

exports.handler = async (event) => {
  const user     = await resolveUser(event);
  const clientId = event.pathParameters?.clientId;
  if (!user || !clientId || !assertClientAccess(user, clientId)) return forbidden();

  const result = await ddb.send(new QueryCommand({
    TableName: MAIN_TABLE,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
    ExpressionAttributeValues: { ':pk': `CLIENT#${clientId}`, ':prefix': 'BRANCH#' },
  }));

  return ok(result.Items ?? []);
};
