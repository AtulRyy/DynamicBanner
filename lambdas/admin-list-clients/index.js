'use strict';

const { QueryCommand } = require('@aws-sdk/lib-dynamodb');
const { ddb, MAIN_TABLE } = require('@ammas/db');
const { resolveUser, assertSuperAdmin } = require('@ammas/auth');
const { ok, forbidden } = require('@ammas/response');

exports.handler = async (event) => {
  const user = await resolveUser(event);
  if (!user || !assertSuperAdmin(user)) return forbidden();

  const result = await ddb.send(
    new QueryCommand({
      TableName: MAIN_TABLE,
      IndexName: 'GSI-EntityType',
      KeyConditionExpression: 'entityType = :et',
      ExpressionAttributeValues: { ':et': 'CLIENT' },
    })
  );

  return ok(result.Items ?? []);
};
