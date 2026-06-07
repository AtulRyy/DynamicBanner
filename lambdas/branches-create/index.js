'use strict';

const { TransactWriteCommand } = require('@aws-sdk/lib-dynamodb');
const {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminAddUserToGroupCommand,
} = require('@aws-sdk/client-cognito-identity-provider');
const { v4: uuid } = require('uuid');
const { ddb, MAIN_TABLE, keys } = require('@ammas/db');
const { resolveUser, assertClientAccess, UserRole } = require('@ammas/auth');
const { created, forbidden, badRequest, internalError } = require('@ammas/response');

const cognito = new CognitoIdentityProviderClient({});
const USER_POOL_ID = process.env.USER_POOL_ID;

exports.handler = async (event) => {
  const user     = await resolveUser(event);
  const clientId = event.pathParameters?.clientId;
  if (!user || !clientId || !assertClientAccess(user, clientId)) return forbidden();

  const body = JSON.parse(event.body ?? '{}');
  if (!body.name || !body.storeEmail) return badRequest('name and storeEmail are required');

  const branchId = uuid();
  const now      = new Date().toISOString();

  await ddb.send(new TransactWriteCommand({
    TransactItems: [
      {
        Put: {
          TableName: MAIN_TABLE,
          Item: {
            ...keys.branch(clientId, branchId),
            branchId, clientId,
            name: body.name,
            location: body.location ?? '',
            storeLoginEmail: body.storeEmail,
            status: 'active',
            entityType: 'BRANCH',
            createdAt: now,
          },
        },
      },
      {
        Put: {
          TableName: MAIN_TABLE,
          Item: {
            ...keys.carouselConfig(branchId),
            branchId, transitionSec: 5, orderMode: 'manual', updatedAt: now,
          },
          ConditionExpression: 'attribute_not_exists(PK)',
        },
      },
    ],
  }));

  try {
    await cognito.send(new AdminCreateUserCommand({
      UserPoolId: USER_POOL_ID,
      Username: body.storeEmail,
      UserAttributes: [
        { Name: 'email',           Value: body.storeEmail },
        { Name: 'email_verified',  Value: 'true' },
        { Name: 'custom:clientId', Value: clientId },
        { Name: 'custom:branchId', Value: branchId },
        { Name: 'custom:role',     Value: UserRole.STORE },
      ],
      DesiredDeliveryMediums: ['EMAIL'],
    }));
    await cognito.send(new AdminAddUserToGroupCommand({
      UserPoolId: USER_POOL_ID, Username: body.storeEmail, GroupName: UserRole.STORE,
    }));
  } catch (err) {
    if (err.name !== 'UsernameExistsException') {
      console.error('Cognito error', err);
      return internalError();
    }
  }

  return created({ branchId, clientId, name: body.name, location: body.location ?? '', createdAt: now });
};
