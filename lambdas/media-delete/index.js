'use strict';

const { GetCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { S3Client, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { ddb, MAIN_TABLE, keys } = require('@ammas/db');
const { resolveUser, assertClientAccess } = require('@ammas/auth');
const { ok, forbidden, notFound } = require('@ammas/response');

const s3           = new S3Client({});
const MEDIA_BUCKET = process.env.MEDIA_BUCKET;

exports.handler = async (event) => {
  const user     = await resolveUser(event);
  const clientId = event.pathParameters?.clientId;
  const branchId = event.pathParameters?.branchId;
  const mediaId  = event.pathParameters?.mediaId;
  if (!user || !clientId || !branchId || !mediaId || !assertClientAccess(user, clientId)) return forbidden();

  const item = await ddb.send(
    new GetCommand({ TableName: MAIN_TABLE, Key: keys.media(branchId, mediaId) })
  );
  if (!item.Item) return notFound('Media not found');

  await Promise.all([
    s3.send(new DeleteObjectCommand({ Bucket: MEDIA_BUCKET, Key: item.Item.s3Key })),
    ddb.send(new UpdateCommand({
      TableName: MAIN_TABLE,
      Key: keys.media(branchId, mediaId),
      UpdateExpression: 'SET active = :false, deletedAt = :now',
      ExpressionAttributeValues: { ':false': false, ':now': new Date().toISOString() },
    })),
  ]);

  return ok({ mediaId, deleted: true });
};
