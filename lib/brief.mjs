/** Deterministic, evidence-only text; preview and approved snapshot share one renderer. */
export function briefText(state) {
  const { circle, doses, questions, events } = state;
  return [
    'CARERELAY - VISIT BRIEF',
    circle.name,
    `Circle revision: ${circle.revision}. Schedule timezone: ${circle.timezone}.`,
    'Scope: up to 300 occurrences from the past 7 and next 31 days, 100 latest questions and 50 latest source events.',
    'Self-reported records, not clinical conclusions or proof of ingestion.',
    '',
    'SCHEDULED OCCURRENCES',
    ...doses.map(
      (d) =>
        `${d.scheduled_at} | ${d.label} | ${d.cancelled_at ? 'cancelled by an approved plan change' : d.status} | occurrence ${d.id}`,
    ),
    '',
    'QUESTIONS',
    ...questions.map((q) => `${q.body} | question ${q.id}`),
    '',
    'SOURCE EVENTS',
    ...events.map(
      (e) =>
        `#${e.id} | received ${e.at}${e.occurred_at ? ` | reported time ${e.occurred_at}` : ''}${e.corrects ? ` | corrects #${e.corrects}` : ''} | ${e.detail}`,
    ),
  ].join('\n');
}
