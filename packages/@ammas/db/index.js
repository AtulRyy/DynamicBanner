'use strict';

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

const MAIN_TABLE = process.env.MAIN_TABLE;
const EVENTS_TABLE = process.env.EVENTS_TABLE;

const keys = {
  client:        (clientId)          => ({ PK: `CLIENT#${clientId}`, SK: '#METADATA' }),
  branch:        (clientId, branchId) => ({ PK: `CLIENT#${clientId}`, SK: `BRANCH#${branchId}` }),
  user:          (cognitoSub)        => ({ PK: `USER#${cognitoSub}`, SK: '#METADATA' }),
  carouselConfig:(branchId)          => ({ PK: `BRANCH#${branchId}`, SK: 'CAROUSEL#CONFIG' }),
  media:         (branchId, mediaId) => ({ PK: `BRANCH#${branchId}`, SK: `MEDIA#${mediaId}` }),
};

module.exports = { ddb, MAIN_TABLE, EVENTS_TABLE, keys };
