'use strict';

const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { v4: uuid } = require('uuid');
const { resolveUser, assertClientAccess } = require('@ammas/auth');
const { ok, forbidden, badRequest } = require('@ammas/response');

const s3           = new S3Client({});
const MEDIA_BUCKET = process.env.MEDIA_BUCKET;

exports.handler = async (event) => {
  const user     = await resolveUser(event);
  const clientId = event.pathParameters?.clientId;
  const branchId = event.pathParameters?.branchId;
  if (!user || !clientId || !branchId || !assertClientAccess(user, clientId)) return forbidden();

  const body = JSON.parse(event.body ?? '{}');
  if (!body.fileName || !body.mimeType) return badRequest('fileName and mimeType are required');

  const mediaId = uuid();
  const ext     = (body.fileName.split('.').pop() ?? 'jpg').toLowerCase();
  const s3Key   = `clients/${clientId}/branches/${branchId}/carousel/${mediaId}.${ext}`;

  const uploadUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: MEDIA_BUCKET, Key: s3Key, ContentType: body.mimeType }),
    { expiresIn: 300 }
  );

  return ok({ mediaId, uploadUrl, s3Key });
};
