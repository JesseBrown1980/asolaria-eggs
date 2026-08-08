// Research Contacts identification — per Google AI Co-Scientist §3.3.6 Meta-review research contacts.
// Per operator 2026-05-29 closing 13-gap item 3 of 3.
// Suggests qualified domain experts from literature reference author names. Pure function, deterministic.

import { createHash } from 'node:crypto';

function sha16(s) { return createHash('sha256').update(String(s)).digest('hex').slice(0, 16); }
function pipeRow(...p) { return p.join('|'); }

export function identifyResearchContacts({ topHypotheses, literatureRefs = [] }) {
  if (!Array.isArray(topHypotheses)) throw new TypeError('identifyResearchContacts: topHypotheses array required');
  if (literatureRefs.length === 0) {
    return {
      contacts: [],
      note: 'NO_LITERATURE_REFS_PROVIDED — cannot identify contacts without source citations',
      suggested_action: 'invoke_crow_rapid_lit_review_first_to_populate_literatureRefs',
    };
  }
  // Extract authors + score by relevance to top hypotheses
  const contactsMap = new Map();
  for (const ref of literatureRefs) {
    const authors = ref.authors || [];
    for (const author of authors) {
      const relevance = topHypotheses.length > 0
        ? Math.min(1, (ref.relevance || 0.5) + (author === ref.firstAuthor ? 0.2 : 0))
        : 0.5;
      const contactPid = sha16(`contact|${author}|${ref.affiliation || ''}`);
      if (contactsMap.has(contactPid)) {
        const existing = contactsMap.get(contactPid);
        existing.relevance = Math.max(existing.relevance, relevance);
        existing.ref_count++;
      } else {
        contactsMap.set(contactPid, {
          expertPid: contactPid,
          expertName: author,
          affiliation: ref.affiliation || 'unknown',
          relevance,
          ref_count: 1,
          rationale: `Cited in ref "${ref.title}" with relevance ${(ref.relevance || 0).toFixed(2)}`,
        });
      }
    }
  }
  const contacts = Array.from(contactsMap.values()).sort((a, b) => b.relevance - a.relevance);
  return { contacts, count: contacts.length };
}

export function toContactRow(contact) {
  return pipeRow('RESEARCH-CONTACT', `expert_pid=${contact.expertPid}`, `name=${contact.expertName}`, `affiliation=${contact.affiliation}`, `relevance=${contact.relevance.toFixed(4)}`, `refs=${contact.ref_count}`, `rationale_sha16=${sha16(contact.rationale)}`);
}
