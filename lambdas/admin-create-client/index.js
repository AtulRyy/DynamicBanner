'use strict';

const { PutCommand } = require('@aws-sdk/lib-dynamodb');
const {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminAddUserToGroupCommand,
} = require('@aws-sdk/client-cognito-identity-provider');
const { v4: uuid } = require('uuid');
const { ddb, MAIN_TABLE, keys } = require('@ammas/db');
const { resolveUser, assertSuperAdmin, UserRole } = require('@ammas/auth');
const { created, forbidden, badRequest, internalError } = require('@ammas/response');

const cognito = new CognitoIdentityProviderClient({});
const USER_POOL_ID = process.env.USER_POOL_ID;

exports.handler = async (event) => {
  const user = await resolveUser(event);
  if (!user || !assertSuperAdmin(user)) return forbidden();

  const body = JSON.parse(event.body ?? '{}');
  const { name, adminEmail } = body;
  if (!name || !adminEmail) return badRequest('name and adminEmail are required');

  const clientId  = uuid();
  const slug      = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  const now       = new Date().toISOString();

  await ddb.send(
    new PutCommand({
      TableName: MAIN_TABLE,
      Item: {
        ...keys.client(clientId),
        clientId, name, slug,
        status: 'active',
        adminEmail,
        entityType: 'CLIENT',
        createdAt: now,
      },
    })
  );

  try {
    await cognito.send(new AdminCreateUserCommand({
      UserPoolId: USER_POOL_ID,
      Username: adminEmail,
      UserAttributes: [
        { Name: 'email',             Value: adminEmail },
        { Name: 'email_verified',    Value: 'true' },
        { Name: 'custom:clientId',   Value: clientId },
        { Name: 'custom:role',       Value: UserRole.CLIENT_ADMIN },
      ],
      DesiredDeliveryMediums: ['EMAIL'],
    }));

    await cognito.send(new AdminAddUserToGroupCommand({
      UserPoolId: USER_POOL_ID,
      Username: adminEmail,
      GroupName: UserRole.CLIENT_ADMIN,
    }));
  } catch (err) {
    if (err.name !== 'UsernameExistsException') {
      console.error('Cognito error', err);
      return internalError();
    }
  }

  return created({ clientId, name, slug, adminEmail, status: 'active', createdAt: now });
};
