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
function legacyRpcFor(body) {
  const circle = () => uuid(body.circle);
  switch (body.action) {
    case 'create-circle':
      return [
        'care_create_circle',
        {
          p_name: text(body.name, 80),
          p_display_name: text(body.displayName, 80),
          p_timezone: text(body.timezone, 80),
        },
      ];
    case 'join':
      return [
        'care_join',
        { p_token: text(body.token, 64, 64), p_display_name: text(body.displayName, 80) },
      ];
    case 'invite': {
      if (!['caregiver', 'viewer'].includes(body.role))
        throw new HttpError(400, 'Choose caregiver or viewer.');
      return ['care_invite', { p_circle: circle(), p_role: body.role }];
    }
    case 'revoke-invitation':
      return [
        'care_revoke_invitation',
        { p_circle: circle(), p_invitation: uuid(body.invitation) },
      ];
    case 'revoke-member':
      return ['care_revoke_member', { p_circle: circle(), p_member: uuid(body.member) }];
    case 'add-dose': {
      const scheduled = new Date(body.scheduled);
      if (typeof body.scheduled !== 'string' || !Number.isFinite(scheduled.getTime()))
        throw new HttpError(400, 'Choose a scheduled date and time.');
      return [
        'care_add_dose',
        {
          p_circle: circle(),
          p_label: text(body.label, 100),
          p_instructions: text(body.instructions ?? '', 400, 0),
          p_scheduled: scheduled.toISOString(),
          p_assigned: body.assigned ? uuid(body.assigned) : null,
        },
      ];
    }
    case 'report': {
      if (!['taken', 'skipped', 'uncertain'].includes(body.outcome))
        throw new HttpError(400, 'Choose a valid dose outcome.');
      return [
        'care_report',
        {
          p_circle: circle(),
          p_dose: uuid(body.dose),
          p_outcome: body.outcome,
          p_request: uuid(body.requestId),
        },
      ];
    }
    case 'claim':
      return ['care_claim', { p_circle: circle(), p_dose: uuid(body.dose) }];
    case 'question':
      return ['care_question', { p_circle: circle(), p_body: text(body.body, 400) }];
    case 'approve-brief': {
      if (!Number.isSafeInteger(body.revision) || body.revision < 0)
        throw new HttpError(400, 'Refresh the brief and try again.');
      return ['care_approve_brief', { p_circle: circle(), p_revision: body.revision }];
    }
    default:
      throw new HttpError(400, 'Unknown action.');
  }
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

/** Whitelist the complete write payload; client-supplied actor/role fields never reach SQL. */
export function rpcFor(body) {
  const action = text(body.action, 32);
  const clean = {
    ...(action === 'create-circle' || action === 'join' ? {} : { circle: uuid(body.circle) }),
  };
  const fields = {
    'create-circle': ['name', 'displayName', 'timezone'],
    join: ['token', 'displayName'],
    invite: ['role'],
    'revoke-invitation': ['invitation'],
    'revoke-member': ['member'],
    'add-dose': ['label', 'instructions', 'scheduled', 'assigned'],
    report: ['dose', 'outcome'],
    claim: ['dose'],
    question: ['body'],
    'approve-brief': ['revision'],
  }[action];
  if (fields) {
    legacyRpcFor({ ...body, requestId: body.requestId });
    for (const key of fields) if (body[key] !== undefined) clean[key] = body[key];
    if (action === 'invite') clean.email = email(body.email);
    if (action === 'add-dose') clean.scheduled = timestamp(body.scheduled);
    if (action === 'report') {
      clean.occurred = timestamp(body.occurred);
      if (
        Date.parse(clean.occurred) > Date.now() + 300000 ||
        Date.parse(clean.occurred) < Date.now() - 366 * 86400000
      )
        throw new HttpError(400, 'Choose a reported time within the past year.');
    }
  } else if (action === 'correct') {
    if (!['taken', 'skipped', 'uncertain'].includes(body.outcome))
      throw new HttpError(400, 'Choose a valid outcome.');
    if (!Number.isSafeInteger(body.previous) || body.previous < 1)
      throw new HttpError(400, 'Review the previous report.');
    Object.assign(clean, {
      dose: uuid(body.dose),
      outcome: body.outcome,
      reason: text(body.reason, 400, 5),
      previous: body.previous,
      occurred: timestamp(body.occurred),
    });
  } else if (action === 'propose') {
    if (!Number.isInteger(body.days) || body.days < 1 || body.days > 30)
      throw new HttpError(400, 'Choose between 1 and 30 daily occurrences.');
    Object.assign(clean, {
      label: text(body.label, 100),
      instructions: text(body.instructions ?? '', 400, 0),
      scheduled: timestamp(body.scheduled),
      days: body.days,
      assigned: body.assigned ? uuid(body.assigned) : null,
      backup: body.backup ? uuid(body.backup) : null,
      replaces: body.replaces ? uuid(body.replaces) : null,
    });
  } else if (action === 'decide-plan') {
    if (typeof body.approve !== 'boolean') throw new HttpError(400, 'Choose approve or reject.');
    Object.assign(clean, { plan: uuid(body.plan), approve: body.approve });
  } else if (action === 'read-notification') clean.notification = uuid(body.notification);
  else throw new HttpError(400, 'Unknown action.');
  return ['care_mutate', { p_request: uuid(body.requestId), p_action: action, p_body: clean }];
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
