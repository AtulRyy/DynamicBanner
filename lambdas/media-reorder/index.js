'use strict';

const { TransactWriteCommand } = require('@aws-sdk/lib-dynamodb');
const { ddb, MAIN_TABLE, keys } = require('@ammas/db');
const { resolveUser, assertClientAccess } = require('@ammas/auth');
const { ok, forbidden, badRequest } = require('@ammas/response');

exports.handler = async (event) => {
  const user     = await resolveUser(event);
  const clientId = event.pathParameters?.clientId;
  const branchId = event.pathParameters?.branchId;
  if (!user || !clientId || !branchId || !assertClientAccess(user, clientId)) return forbidden();

  const body = JSON.parse(event.body ?? '{}');
  if (!Array.isArray(body.order) || !body.order.length) return badRequest('order array is required');

  const now = new Date().toISOString();

  await ddb.send(new TransactWriteCommand({
    TransactItems: [
      ...body.order.map((mediaId, index) => ({
        Update: {
          TableName: MAIN_TABLE,
          Key: keys.media(branchId, mediaId),
          UpdateExpression: 'SET sortOrder = :order, updatedAt = :now',
          ExpressionAttributeValues: { ':order': index, ':now': now },
        },
      })),
      {
        Update: {
          TableName: MAIN_TABLE,
          Key: keys.carouselConfig(branchId),
          UpdateExpression: 'SET updatedAt = :now',
          ExpressionAttributeValues: { ':now': now },
        },
      },
    ],
  }));

  return ok({ branchId, reordered: true });
};
