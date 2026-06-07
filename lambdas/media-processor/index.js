'use strict';

const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const { PutCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { ddb, MAIN_TABLE, keys } = require('@ammas/db');

// Sharp is provided via Lambda Layer — not bundled
const sharp = require('sharp');

const s3           = new S3Client({});
const MEDIA_BUCKET = process.env.MEDIA_BUCKET;
const CDN_DOMAIN   = process.env.CDN_DOMAIN;

exports.handler = async (event) => {
  for (const record of event.Records) {
    const s3Key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));

    const match = s3Key.match(
      /^clients\/([^/]+)\/branches\/([^/]+)\/carousel\/([^/]+)\.(\w+)$/
    );
    if (!match) continue;

    const [, clientId, branchId, mediaId, ext] = match;
    const thumbKey = `clients/${clientId}/branches/${branchId}/thumbnails/${mediaId}_thumb.jpg`;
    const now      = new Date().toISOString();

    const obj    = await s3.send(new GetObjectCommand({ Bucket: MEDIA_BUCKET, Key: s3Key }));
    const buffer = Buffer.from(await obj.Body.transformToByteArray());

    const thumb = await sharp(buffer)
      .resize(320, 180, { fit: 'cover' })
      .jpeg({ quality: 70 })
      .toBuffer();

    await s3.send(new PutObjectCommand({
      Bucket: MEDIA_BUCKET, Key: thumbKey, Body: thumb, ContentType: 'image/jpeg',
    }));

    const cfUrl    = `https://${CDN_DOMAIN}/${s3Key}`;
    const thumbUrl = `https://${CDN_DOMAIN}/${thumbKey}`;

    await ddb.send(new PutCommand({
      TableName: MAIN_TABLE,
      Item: {
        ...keys.media(branchId, mediaId),
        mediaId, branchId, clientId, s3Key, cfUrl, thumbUrl,
        fileName: `${mediaId}.${ext}`,
        mimeType: obj.ContentType ?? 'image/jpeg',
        sortOrder: Date.now(),
        active: true,
        durationSec: 5,
        uploadedAt: now,
      },
      ConditionExpression: 'attribute_not_exists(PK)',
    }));

    await ddb.send(new UpdateCommand({
      TableName: MAIN_TABLE,
      Key: keys.carouselConfig(branchId),
      UpdateExpression: 'SET updatedAt = :now',
      ExpressionAttributeValues: { ':now': now },
    }));
  }
};
