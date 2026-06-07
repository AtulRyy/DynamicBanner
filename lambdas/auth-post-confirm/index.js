'use strict';

const { PutCommand } = require('@aws-sdk/lib-dynamodb');
const { v4: uuid } = require('uuid');
const { ddb, MAIN_TABLE, keys } = require('@ammas/db');
const { UserRole } = require('@ammas/auth');

exports.handler = async (event) => {
  const attrs = event.request.userAttributes;
  const sub   = attrs['sub'];
  const email = attrs['email'];

  const groupsRaw = attrs['cognito:groups'] ?? '';
  const groups = groupsRaw.split(',').filter(Boolean);

  const role = groups.includes(UserRole.SUPER_ADMIN)  ? UserRole.SUPER_ADMIN
             : groups.includes(UserRole.CLIENT_ADMIN) ? UserRole.CLIENT_ADMIN
             : UserRole.STORE;

  const clientId = attrs['custom:clientId'];
  const branchId = attrs['custom:branchId'];

  await ddb.send(
    new PutCommand({
      TableName: MAIN_TABLE,
      Item: {
        ...keys.user(sub),
        userId: uuid(),
        cognitoSub: sub,
        email,
        role,
        ...(clientId && { clientId }),
        ...(branchId && { branchId }),
        createdAt: new Date().toISOString(),
      },
      ConditionExpression: 'attribute_not_exists(PK)',
    })
  );

  return event;
};
