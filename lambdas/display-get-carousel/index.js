'use strict';

const { QueryCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');
const { ddb, MAIN_TABLE, keys } = require('@ammas/db');
const { resolveUser, assertBranchAccess } = require('@ammas/auth');
const { forbidden } = require('@ammas/response');

exports.handler = async (event) => {
  const user     = await resolveUser(event);
  const branchId = event.pathParameters?.branchId;
  if (!user || !branchId || !assertBranchAccess(user, branchId)) return forbidden();

  const [configResult, mediaResult] = await Promise.all([
    ddb.send(new GetCommand({ TableName: MAIN_TABLE, Key: keys.carouselConfig(branchId) })),
    ddb.send(new QueryCommand({
      TableName: MAIN_TABLE,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
      FilterExpression: 'active = :active',
      ExpressionAttributeValues: {
        ':pk':     `BRANCH#${branchId}`,
        ':prefix': 'MEDIA#',
        ':active': true,
      },
    })),
  ]);

  const config = configResult.Item ?? { branchId, transitionSec: 5, updatedAt: new Date().toISOString() };
  const media  = (mediaResult.Items ?? []).sort((a, b) => a.sortOrder - b.sortOrder);

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=55, s-maxage=55',
    },
    body: JSON.stringify({
      data: { branchId, config, media, lastUpdatedAt: config.updatedAt },
    }),
  };
};
