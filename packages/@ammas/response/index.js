'use strict';

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

const ok       = (data)    => json(200, { data });
const created  = (data)    => json(201, { data });
const noContent = ()       => ({ statusCode: 204, body: '' });
const forbidden = ()       => json(403, { message: 'Forbidden' });
const notFound  = (msg)    => json(404, { message: msg ?? 'Not found' });
const badRequest = (msg)   => json(400, { message: msg });
const internalError = ()   => json(500, { message: 'Internal server error' });

module.exports = { ok, created, noContent, forbidden, notFound, badRequest, internalError };
