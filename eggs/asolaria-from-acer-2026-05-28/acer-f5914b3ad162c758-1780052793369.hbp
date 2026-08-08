// NIH Aims Page overview generator — per Google AI Co-Scientist §3.3.6 Meta-review research overview.
// Per operator 2026-05-29 closing 13-gap item 2 of 3.
// Emits constrained-decoded NIH-Aims-Page format. Pure text generator.

import { createHash } from 'node:crypto';

function sha16(s) { return createHash('sha256').update(String(s)).digest('hex').slice(0, 16); }
function pipeRow(...p) { return p.join('|'); }

const SECTIONS = ['Background_and_Significance', 'Innovation', 'Approach_Aim_1', 'Approach_Aim_2', 'Approach_Aim_3', 'Expected_Outcomes', 'Pitfalls_and_Alternatives'];

export function generateNIHAimsPage({ researchGoal, topHypotheses, format = 'text' }) {
  if (!researchGoal || typeof researchGoal !== 'string') throw new TypeError('generateNIHAimsPage: researchGoal required');
  if (!Array.isArray(topHypotheses)) throw new TypeError('generateNIHAimsPage: topHypotheses array required');
  // Pad to exactly 3 aims (NIH norm)
  const aims = topHypotheses.slice(0, 3);
  while (aims.length < 3) aims.push({ pid: sha16(`placeholder-aim-${aims.length}`), text: `[Placeholder Aim ${aims.length + 1} — operator/PI to specify]` });

  const docPid = sha16(`nih-aims|${researchGoal}|${aims.map(a => a.pid).join(',')}`);

  if (format === 'hbpv1') {
    const rows = [];
    rows.push(pipeRow('NIH-AIMS-DOC', `pid=${docPid}`, `goal_sha16=${sha16(researchGoal)}`, `aims_count=${aims.length}`, `sections=${SECTIONS.length}`));
    for (let i = 0; i < aims.length; i++) {
      rows.push(pipeRow('NIH-AIM', `idx=${i + 1}`, `hyp_pid=${aims[i].pid}`, `text_sha16=${sha16(aims[i].text || '')}`));
    }
    return { docPid, format: 'hbpv1', content: rows.join('\n') + '\n' };
  }

  // Default text format — NIH Aims Page constrained decoding
  const text = [
    `## SPECIFIC AIMS`,
    ``,
    `### Background and Significance`,
    `Research goal: ${researchGoal}`,
    `Document PID: ${docPid}`,
    ``,
    `### Innovation`,
    `This research integrates ${aims.length} hypotheses identified via federation hypothesis-discovery loop.`,
    ``,
    `### Specific Aim 1`,
    `Hypothesis PID: ${aims[0].pid}`,
    `${aims[0].text || '[hypothesis text placeholder]'}`,
    ``,
    `### Specific Aim 2`,
    `Hypothesis PID: ${aims[1].pid}`,
    `${aims[1].text || '[hypothesis text placeholder]'}`,
    ``,
    `### Specific Aim 3`,
    `Hypothesis PID: ${aims[2].pid}`,
    `${aims[2].text || '[hypothesis text placeholder]'}`,
    ``,
    `### Expected Outcomes`,
    `Federation-validated hypotheses with HBPv1 quintet audit-trace per output.`,
    ``,
    `### Pitfalls and Alternatives`,
    `Per Foundation v3 LAW vote-not-pass rule, significant decisions undergo quorum review.`,
    ``,
  ].join('\n');

  return { docPid, format: 'text', content: text };
}

export function toNIHOverviewRow({ docPid, format, sha16: contentSha }) {
  return pipeRow('NIH-AIMS-OVERVIEW', `doc_pid=${docPid}`, `format=${format}`, `sha16=${contentSha || sha16(docPid)}`, 'constrained_decoded=true');
}
