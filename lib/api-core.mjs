export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function uuid(value) {
  if (typeof value !== 'string' || !uuidPattern.test(value))
    throw new HttpError(400, 'Invalid record identifier.');
  return value;
}
export function text(value, max = 400, min = 1) {
  if (typeof value !== 'string' || value.trim().length < min || value.length > max)
    throw new HttpError(400, `Enter between ${min} and ${max} characters.`);
  return value.trim();
}
export function validateMutation(req, origin) {
  if (req.headers.origin !== origin || req.headers['sec-fetch-site'] === 'cross-site')
    throw new HttpError(403, 'Request origin rejected.');
  if (req.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json')
    throw new HttpError(415, 'Send a JSON request.');
}
export async function readBody(req) {
  let body = req.body;
  if (body === undefined) {
    const chunks = [];
    let bytes = 0;
    for await (const chunk of req) {
      bytes += Buffer.byteLength(chunk);
      if (bytes > 8192) throw new HttpError(413, 'Request is too large.');
      chunks.push(Buffer.from(chunk));
    }
    body = Buffer.concat(chunks).toString('utf8');
  }
  if (typeof body === 'string' || Buffer.isBuffer(body)) {
    if (Buffer.byteLength(body) > 8192) throw new HttpError(413, 'Request is too large.');
    try {
      body = JSON.parse(body.toString());
    } catch {
      throw new HttpError(400, 'Invalid JSON.');
    }
  }
  if (!body || Array.isArray(body) || typeof body !== 'object')
    throw new HttpError(400, 'Invalid request.');
  if (Buffer.byteLength(JSON.stringify(body)) > 8192)
    throw new HttpError(413, 'Request is too large.');
  return body;
}
export function email(value) {
  const result = text(value, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result))
    throw new HttpError(400, 'Enter a valid email address.');
  return result;
}

function timestamp(value) {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T/.test(value) ||
    !Number.isFinite(Date.parse(value))
  )
    throw new HttpError(400, 'Choose a valid date and time.');
  return new Date(value).toISOString();
}

function outcome(value) {
  if (!['taken', 'skipped', 'uncertain'].includes(value))
    throw new HttpError(400, 'Choose a valid dose outcome.');
  return value;
}
function integer(value, min, max, message) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new HttpError(400, message);
  return value;
}
const optionalId = (value) => (value ? uuid(value) : null);
function observedAt(value) {
  const result = timestamp(value),
    time = Date.parse(result);
  if (time > Date.now() + 300000 || time < Date.now() - 366 * 86400000)
    throw new HttpError(400, 'Choose a reported time within the past year.');
  return result;
}
/** Each action has one validator and one normalized payload contract. */
const actionValidators = {
  'create-circle': (body) => ({
    name: text(body.name, 80),
    displayName: text(body.displayName, 80),
    timezone: text(body.timezone, 80),
  }),
  join: (body) => ({ token: text(body.token, 64, 64), displayName: text(body.displayName, 80) }),
  invite: (body) => {
    if (!['caregiver', 'viewer'].includes(body.role))
      throw new HttpError(400, 'Choose caregiver or viewer.');
    return { role: body.role, email: email(body.email) };
  },
  'revoke-invitation': (body) => ({ invitation: uuid(body.invitation) }),
  'revoke-member': (body) => ({ member: uuid(body.member) }),
  'add-dose': (body) => ({
    label: text(body.label, 100),
    instructions: text(body.instructions ?? '', 400, 0),
    scheduled: timestamp(body.scheduled),
    assigned: optionalId(body.assigned),
  }),
  report: (body) => ({
    dose: uuid(body.dose),
    outcome: outcome(body.outcome),
    occurred: observedAt(body.occurred),
  }),
  correct: (body) => ({
    dose: uuid(body.dose),
    outcome: outcome(body.outcome),
    reason: text(body.reason, 400, 5),
    previous: integer(body.previous, 1, Number.MAX_SAFE_INTEGER, 'Review the previous report.'),
    occurred: observedAt(body.occurred),
  }),
  claim: (body) => ({ dose: uuid(body.dose) }),
  question: (body) => ({ body: text(body.body, 400) }),
  'approve-brief': (body) => ({
    revision: integer(
      body.revision,
      0,
      Number.MAX_SAFE_INTEGER,
      'Refresh the brief and try again.',
    ),
  }),
  propose: (body) => ({
    label: text(body.label, 100),
    instructions: text(body.instructions ?? '', 400, 0),
    scheduled: timestamp(body.scheduled),
    days: integer(body.days, 1, 30, 'Choose between 1 and 30 daily occurrences.'),
    assigned: optionalId(body.assigned),
    backup: optionalId(body.backup),
    replaces: optionalId(body.replaces),
  }),
  'decide-plan': (body) => {
    if (typeof body.approve !== 'boolean') throw new HttpError(400, 'Choose approve or reject.');
    return { plan: uuid(body.plan), approve: body.approve };
  },
  'read-notification': (body) => ({ notification: uuid(body.notification) }),
};
/** Client identity and role fields are never forwarded to the database. */
export function rpcFor(body) {
  const action = text(body.action, 32);
  if (!Object.hasOwn(actionValidators, action)) throw new HttpError(400, 'Unknown action.');
  const scope = ['create-circle', 'join'].includes(action) ? {} : { circle: uuid(body.circle) };
  return [
    'care_mutate',
    {
      p_request: uuid(body.requestId),
      p_action: action,
      p_body: { ...scope, ...actionValidators[action](body) },
    },
  ];
}

export function databaseError(error) {
  if (error.code === '42501')
    return new HttpError(403, 'You do not have access to this circle or action.');
  if (error.code === '23505')
    return new HttpError(
      409,
      'This record changed or already has an outcome. Refresh and review it.',
    );
  if (error.code === 'P0001') return new HttpError(400, error.message);
  return new HttpError(500, 'Unable to save or load care records. Please try again.');
}
