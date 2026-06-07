'use strict';

const { QueryCommand } = require('@aws-sdk/lib-dynamodb');
const { ddb, MAIN_TABLE } = require('@ammas/db');
const { resolveUser, assertClientAccess } = require('@ammas/auth');
const { ok, forbidden } = require('@ammas/response');

exports.handler = async (event) => {
  const user     = await resolveUser(event);
  const clientId = event.pathParameters?.clientId;
  const branchId = event.pathParameters?.branchId;
  if (!user || !clientId || !branchId || !assertClientAccess(user, clientId)) return forbidden();

  const result = await ddb.send(new QueryCommand({
    TableName: MAIN_TABLE,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
    FilterExpression: 'active = :active',
    ExpressionAttributeValues: {
      ':pk':     `BRANCH#${branchId}`,
      ':prefix': 'MEDIA#',
      ':active': true,
    },
  }));

  const items = (result.Items ?? []).sort((a, b) => a.sortOrder - b.sortOrder);
  return ok(items);
};
