import { expect, test } from "bun:test";

import { render } from "./test-render";

const processMarkdown = async (markdown: string) => (await render(markdown)).html;
const paragraph = (html: string, id: string) => html.match(new RegExp(`<p id="${id}"[^>]*>[\\s\\S]*?</p>`))?.[0];
const compactCount = (html: string) => html.match(/data-kind="(?:ack|nod)"/g)?.length;

test("provisional speakers keep visible acknowledgment attribution", async () => {
  for (const [lead, reply] of [["Speaker 0", "Speaker 1"], ["Henry", "Speaker unknown"], ["Unconfirmed voice", "Henry"]]) {
    const result = await processMarkdown(`[00:01] **${lead}:** A complete thought.\n\n[00:04] **${reply}:** Yeah.`);
    expect(result).not.toContain('data-kind="nod"');
    expect(result).not.toContain('data-kind="ack"');
    expect(result).toContain(`<b>${reply}</b>`);
    expect(result).toContain('href="#t=4"');
  }
});

test("removed filler retains anchors and same-second occurrence IDs without an empty bubble", async () => {
  const result = await processMarkdown(`[00:01] **Henry:** A thought.\n\n[00:02] **Guest:** <span id="msg-2.4"></span>\n\n[00:02] **Henry:** Another thought.`);
  expect(result).toMatch(/<span id="msg-2" class="transcript-anchor">\s*<span id="msg-2.4"><\/span><\/span>/);
  expect(result).toContain('id="msg-2-2"');
  expect(result.match(/class="message"/g)?.length).toBe(2);
  expect(result).not.toContain('<b>Guest</b>');
});

test('a reviewed occurrence override preserves a distinct passage after duplicate deletion', async () => {
  const result = await processMarkdown('[24:47] **Michael:** <span id="msg-1533"></span>Limits can be beautiful.\n\n'
    + '[25:06] **Michael:** Roots matter.\n\n'
    + '[25:33] **Michael:** <span data-message-id="msg-1533-2"></span>A different smaller scale.');
  expect(result).toContain('<p id="msg-1487"');
  expect(result).toContain('<span id="msg-1533"></span>Limits can be beautiful.');
  expect(result).toContain('<p id="msg-1533-2"');
  expect(result).toContain('href="#t=1533"');
  expect(result).not.toContain('data-message-id');
  expect(result.match(/id="msg-1533"/g)).toHaveLength(1);
  expect(result.match(/id="msg-1533-2"/g)).toHaveLength(1);
});

test('occurrence overrides consume only the marker and keep default counting and reply rendering', async () => {
  const result = await processMarkdown('[00:01] **Henry:** A complete thought.\n\n'
    + '[00:02] **Guest:** <span data-message-id="msg-2-3"></span><span id="alias"></span>Yeah.\n\n'
    + '[00:02] **Henry:** A different thought.');
  expect(result).toContain('<p id="msg-2-3"');
  expect(result).toContain('data-kind="nod"');
  expect(result).toContain('<span id="alias"></span>Yeah.');
  expect(result).toContain('<p id="msg-2-2"');
  expect(result).not.toContain('data-message-id');
});

test('invalid, misplaced, nonempty, untimed, and conflicting occurrence overrides fail visibly', async () => {
  const invalid = [
    '[00:02] **Henry:** <span data-message-id="msg-3-2"></span>Wrong time.',
    '[00:02] **Henry:** <span data-message-id="msg-2-1"></span>First occurrence.',
    '[00:02] **Henry:** <span data-message-id="msg-2-02"></span>Noncanonical count.',
    '[00:02] **Henry:** <span data-message-id="msg-2"></span>Missing count.',
    '[00:02] **Henry:** <span data-message-id="msg-2-2">Nonempty.</span>',
    '[00:02] **Henry:** Text first. <span data-message-id="msg-2-2"></span>',
    '[00:02] **Henry:** <span data-message-id="msg-2-2"></span><span data-message-id="msg-2-3"></span>Two markers.',
    '**Henry:** <span data-message-id="msg-0-2"></span>Untimed.',
    '[00:02] **Henry:** <span data-message-id="msg-2-2"></span>First.\n\n[00:02] **Guest:** Second.',
  ];
  for (const markdown of invalid) {
    const result = await processMarkdown(markdown).catch((error: unknown) => error);
    expect(result).toBeInstanceOf(Error);
  }
});

test("remarkTranscriptPlugin transforms markdown correctly", async () => {
  const input = `
[00:28] **Speaker 1**: Hello, this is a test.

[01:15] **Speaker 2**: This is another test line.

**Speaker 1**: This is a line without a timestamp.
`;

  const result = await processMarkdown(input);
  
  expect(result).toContain('id="msg-28"');
  expect(result).toContain('data-side="sent"');
  expect(result).toContain('<b>Speaker 1</b><span class="message-bubble">: Hello, this is a test.<a href="#t=28">0:28</a></span>');

  expect(result).toContain('id="msg-75"');
  expect(result).toContain('data-side="received"');
  expect(result).toContain('<a href="#t=75">1:15</a>');

  expect(result).toContain('id="msg-0"');
  expect(result).not.toContain('href="#t=0"');
});

test("remarkTranscriptPlugin handles timestamps longer than 1 hour", async () => {
  const input = "[01:00:03] **Henry**: Yeah, always. Yeah.";
  const result = await processMarkdown(input);
  
  expect(result).toContain('id="msg-3603"');
  expect(result).toContain('<a href="#t=3603">1:00:03</a>');
  expect(result).toContain('<b>Henry</b>');
});

test("remarkTranscriptPlugin groups consecutive speaker-only messages", async () => {
  const result = await processMarkdown(`
**Henry:** First thought.

**Henry:** Second thought with **emphasis**.

[00:30] **Xiq:** Reply.
`);

  expect(result).toContain('<p id="msg-0" class="message" data-side="sent" data-kind="brief" data-run="start"><b>Henry</b>');
  expect(result).toContain('<p id="msg-0-2" class="message" data-side="sent" data-kind="brief" data-run="end"><span class="message-bubble"> Second thought with <strong>emphasis</strong>.</span></p>');
  expect(result.match(/<b>Henry<\/b>/g)).toHaveLength(1);
});

test('speaker attribution resets across structural and timing boundaries', async () => {
  for (const separator of ['---', '```js\nconst example = true;\n```', '<div>An editorial note.</div>']) {
    const result = await processMarkdown(`[00:01] **Henry:** A complete thought.\n\n${separator}\n\n[00:02] **Henry:** Another complete thought.`);
    expect(paragraph(result, 'msg-2')).toContain('<b>Henry</b>');
  }
  for (const [lead, reply, id] of [
    ['[00:01] **Henry:** A thought.', '[02:00] **Henry:** After a pause.', 'msg-120'],
    ['[00:03] **Henry:** A thought.', '[00:02] **Henry:** Earlier time.', 'msg-2'],
    ['[00:01] **Henry:** A thought.', '**Henry:** Untimed thought.', 'msg-0'],
    ['**Henry:** An untimed thought.', '[00:02] **Henry:** Timed thought.', 'msg-2'],
  ]) {
    const result = await processMarkdown(`${lead}\n\n${reply}`);
    expect(paragraph(result, id)).toContain('<b>Henry</b>');
    expect(result).not.toContain('data-run');
  }
});

test('provisional and third speakers retain attribution on consecutive turns', async () => {
  for (const speaker of ['Speaker 0', 'Unconfirmed voice', 'Guest']) {
    const prefix = speaker === 'Guest' ? '[00:00] **Henry:** First voice.\n\n[00:01] **Nadia:** Second voice.\n\n' : '';
    const result = await processMarkdown(`${prefix}[00:02] **${speaker}:** A complete thought.\n\n[00:03] **${speaker}:** Another complete thought.`);
    expect(paragraph(result, 'msg-3')).toContain(`<b>${speaker}</b>`);
  }
});

test("remarkTranscriptPlugin disambiguates duplicate same-second message ids", async () => {
  const input = `
[00:28] **Speaker 1**: First line.

[00:28] **Speaker 2**: Second line same second.

[00:28] **Speaker 1**: Third line same second.
`;

  const result = await processMarkdown(input);

  expect(result).toContain('id="msg-28"');
  expect(result).toContain('id="msg-28-2"');
  expect(result).toContain('id="msg-28-3"');
});

test("remarkTranscriptPlugin handles empty input", async () => {
  const input = "";
  const result = await processMarkdown(input);
  expect(result).toBe("");
});

test("remarkTranscriptPlugin ignores non-transcript paragraphs", async () => {
  const input = "This is a regular paragraph without timestamps or speakers.";
  const result = await processMarkdown(input);
  expect(result.trim()).toBe(`<p>${input}</p>`);
});

test('episode section headings follow the page title without changing their text or aliases', async () => {
  const result = await processMarkdown('#### A topic <span id="old-topic"></span>\n\n[00:01] **Henry:** A thought.\n\n### Show Notes');
  expect(result).toContain('<h2>A topic <span id="old-topic"></span></h2>');
  expect(result).toContain('<h2>Show Notes</h2>');
  expect(result).toContain('id="msg-1"');
  expect(result).not.toContain('<h4>');
});

test('short replies compact by length while questions and longer replies remain separate', async () => {
  const result = await processMarkdown('[00:01] **A:** That you cannot get to it.\n\n[00:02] **B:** Yeah, yeah, yeah.\n\n[00:03] **A:** Really?\n\n[00:04] **B:** Okay.\n\n[00:05] **A:** Not yet.');
  expect(compactCount(result)).toBe(2);
  expect(result).toContain('id="msg-2"');
  expect(result).toContain('Yeah, yeah, yeah.');
  expect(result.match(/<p id="msg-2"[^>]+>/)?.[0]).not.toContain('data-kind="nod"');
  expect(result.match(/<p id="msg-3"[^>]+>/)?.[0]).not.toContain('data-kind="nod"');
  expect(result).toContain('<b>A · 0:05</b> Not yet.');
});


test('brief reactions can form a compact exchange without changing their words', async () => {
  const result = await processMarkdown('[00:01] **A:** That was the idea.\n\n[00:02] **B:** Yeah. Cool.\n\n[00:03] **A:** Cool.\n\n[00:04] **B:** Cool weather today.');
  expect(compactCount(result)).toBe(2);
  expect(result).toContain('Yeah. Cool.');
  expect(result).toContain('id="msg-3"');
});


test('compact confirmations retain uncertainty and do not swallow questions or clauses', async () => {
 const result = await processMarkdown('[00:01] **A:** The audio player?\n\n[00:02] **B:** Okay okay.\n\n[00:03] **A:** Possibly. Yeah,\n\n[00:04] **B:** Oh, yeah?\n\n[00:05] **A:** We should do that. Okay.');
 expect(compactCount(result)).toBe(2);
 expect(result).toContain('Possibly. Yeah,');
 expect(result).toContain('We should do that. Okay.');
});

test('the word-count rule preserves speaker alignment, aliases, and original uncertainty', async () => {
 const { isCompactReply } = await import('./compact-reply.js');
 for (const phrase of ['Not yet.', 'Your surroundings.', 'Possibly. Yeah,', 'Okay okay.']) expect(isCompactReply(phrase)).toBe(true);
 for (const phrase of ['Oh, yeah?', 'We should do that. Okay.', "Oh that’s neat.", 'Yeah I guess and.', 'Like that yeah.', "No that's cool but.", "Maybe. I don't know.", 'Yeah it would drain my battery.']) expect(isCompactReply(phrase)).toBe(false);
 const result=await processMarkdown('[00:01] **A:** A thought.\n\n[00:02] **B:** <span id="alias"></span>Mm-hmm.');
 expect(result).toContain('data-side="received" data-kind="nod"');
 expect(result).toContain('id="alias"');
});

test('verbal nod pills keep playable words and accessible attribution', async () => {
 const result=await processMarkdown('[00:01] **A:** A thought.\n\n[00:02] **B:** Yeah.');
 expect(result).toContain('data-kind="nod"');
 expect(result).toContain('href="#t=2"');
 expect(result).toContain('<a href="#t=2"><b>B · 0:02</b> Yeah.</a>');
});

test('one-word responses and short stage cues compact by shape without deleting their meaning', async () => {
 const { isCompactReply } = await import('./compact-reply.js');
 for (const phrase of ['Ah.', '(laughs)', '(laughs).', '(clears throat)', 'Inertia.', 'No.', 'Natalia.', 'Mhmm.', 'Non-Christian.', 'Café.', 'Yeah-', '…']) {
   expect(isCompactReply(phrase)).toBe(phrase !== '…');
 }
 for (const phrase of ['Really?', 'SDO?', '(laughs) That was funny.']) expect(isCompactReply(phrase)).toBe(false);
 const result = await processMarkdown('[00:01] **Henry:** A complete thought.\n\n[00:02] **Nadia:** Ah.\n\n[00:03] **Henry:** (laughs)\n\n[00:04] **Nadia:** Inertia.\n\n[00:05] **Henry:** Really?');
 expect(result.match(/data-kind="nod"/g)?.length).toBe(3);
 expect(result).toContain('<b>Nadia · 0:04</b> Inertia.');
 expect(result).toContain('<b>Henry · 0:03</b> (laughs)');
 expect(result.match(/<p id="msg-5"[^>]+>/)?.[0]).not.toContain('data-kind="nod"');
});

test('two-word replies use one size rule for reactions, substantive answers, and stage cues', async () => {
 const { isCompactReply } = await import('./compact-reply.js');
 for (const phrase of ['I agree.', 'Me too.', 'Totally agreed.', 'Ah, yeah.', 'Mm-hmm, yeah.', "That's interesting.", 'Yeah (laughs).', 'Right. (laughs)', '(laughs) Yeah.', 'GitHub Sponsors.', 'Version control.', 'Your surroundings.', 'Ordinary Time.', 'Not yet.', 'In theory.', "There's a-", "They don't.", '(laughs) Fundraising.', 'Yeah, cryogenics.']) expect(isCompactReply(phrase)).toBe(true);
 for (const phrase of ['GitHub Sponsors program.', 'Version control system.', 'Your immediate surroundings.', '(laughs) I agree.', 'I agree?', 'Me too?']) expect(isCompactReply(phrase)).toBe(false);
 const result = await processMarkdown('[00:01] **Nadia:** A thought.\n\n[00:02] **Henry:** Yeah (laughs).\n\n[00:03] **Nadia:** Another thought.');
 expect(result).toContain('<b>Henry · 0:02</b> Yeah (laughs).');
 expect(result).toMatch(/<div class="message-thread[^"]*">\s*<p id="msg-1"[^]*?id="msg-2"[^]*?<\/div>\s*<\/div>/);
});

test('a speaker taking the lead after their own mini reply regains visible attribution', async () => {
 const result = await processMarkdown('[00:01] **Nadia:** A thought.\n\n[00:02] **Henry:** I agree.\n\n[00:03] **Henry:** Here is my perspective on it.\n\n[00:04] **Nadia:** Yeah.\n\n[00:05] **Henry:** And another part of that perspective.');
 const newLead = paragraph(result, 'msg-3');
 expect(newLead).toContain('<b>Henry</b>');
 expect(newLead).not.toContain('data-run');
 expect(paragraph(result, 'msg-5')).toContain('data-run="cont"');
 expect(paragraph(result, 'msg-5')).not.toContain('<b>');
});

test('mini replies stop at structural boundaries, timing gaps, and content links', async () => {
 for (const divider of ['## Next', '> A quoted passage.', '- A list item.', 'An editorial note.', '[00:02] **Nadia:**']) {
   const result = await processMarkdown('[00:01] **Henry:** A thought.\n\n' + divider + '\n\n[00:03] **Nadia:** Ah.');
   expect(result).not.toContain('data-kind="nod"');
 }
 for (const reply of ['[02:00] **Nadia:** Ah.', '[00:00] **Nadia:** Ah.', '[00:02] **Nadia:** [Incarnation](https://example.com).']) {
   const result = await processMarkdown('[00:01] **Henry:** A thought.\n\n' + reply);
   expect(result).not.toContain('data-kind="nod"');
 }
 const result = await processMarkdown('**Henry:** A thought.\n\n[00:02] **Nadia:** Ah.');
 expect(result).not.toContain('data-kind="nod"');
});


test('qualified replies use the same pill anchored to the previous speaker', async () => {
 const result=await processMarkdown('[00:01] **A:** A thought.\n\n[00:02] **B:** Possibly. Yeah.');
 expect(result).toContain('data-side="received" data-kind="nod"');
 expect(result).toContain('Possibly. Yeah.');
 expect(result).toContain('B · 0:02');
});

test('listening sounds attach to the prior message without losing speaker or audio anchors', async () => {
 const { isCompactReply } = await import('./compact-reply.js');
 for (const phrase of ['Hm.', 'Hmm.', 'Mmm.', 'Mm-hmm.']) expect(isCompactReply(phrase)).toBe(true);
 for (const phrase of ['Hm?', 'Hmm, what about trust?', 'Hmm, I disagree.']) expect(isCompactReply(phrase)).toBe(false);
 const result = await processMarkdown('[06:17] **Nadia:** To me, that’s a big part of trust.\n\n[06:33] **Henry:** Hm.\n\n[06:34] **Nadia:** You continue to trust that person anyway.');
 expect(paragraph(result, 'msg-393')).toContain('data-side="received" data-kind="nod"');
 expect(result).toMatch(/<div class="message-thread[^"]*">\s*<p id="msg-377"[^]*?id="msg-393"[^]*?<\/div>\s*<\/div>/);
 expect(result).toContain('href="#t=393"');
 expect(result).toContain('<b>Henry · 6:33</b> Hm.');
 expect(paragraph(result, 'msg-394')).toContain('data-run="cont"');
});

test('reply groups preserve chronology and attach multiple responses to one parent', async () => {
 const result=await processMarkdown('[00:01] **A:** A thought.\n\n[00:02] **B:** Yeah.\n\n[00:03] **A:** Cool.\n\n## Next\n\n[00:04] **B:** Okay.');
 expect(result.match(/class="message-thread/g)?.length).toBe(1);
 expect(result).toMatch(/<div class="message-thread[^"]*">\s*<p id="msg-1"[^]*?id="msg-2"[^]*?id="msg-3"[^]*?<\/div>\s*<\/div>\s*<h2/);
 expect(result.indexOf('id="msg-2"')).toBeLessThan(result.indexOf('id="msg-3"'));
 expect(result).not.toContain('<blockquote');
});


test('continuing speakers share attribution across nods but reset at headings, speaker changes and pauses', async () => {
 const result = await processMarkdown('[00:01] **Henry:** A first thought.\n\n[00:02] **Laurel:** Yeah.\n\n[00:03] **Henry:** Another complete thought.\n\n[00:04] **Laurel:** Cool.\n\n## Next\n\n[00:05] **Henry:** A new section.\n\n[00:06] **Laurel:** A different perspective.\n\n[00:07] **Henry:** An actual answer.\n\n[02:00] **Henry:** After a pause.');
 expect(result.match(/data-run="cont"/g)?.length).toBe(1);
 expect(result).toContain('<div class="message-thread thread-right" data-run="cont">');
 expect(result).toContain('<b>Laurel</b>');
 expect(result).toContain('href="#t=3"');
 expect(result).toContain('<b>Laurel · 0:02</b> Yeah.');
});


test('alternating nods retain their own speaker side', async () => {
 const result = await processMarkdown('[09:33] **Laurel:** A voice note will automatically do that.\n\n[09:36] **Henry:** Yeah.\n\n[09:37] **Laurel:** Yeah and.');
 expect(paragraph(result, 'msg-576')).toContain('data-side="received" data-kind="nod"');
 expect(paragraph(result, 'msg-577')).toContain('data-side="sent" data-kind="nod"');
 expect(result).toContain('Henry · 9:36');
 expect(result).toContain('Laurel · 9:37');
});


test('reply rows pair nearby opposite speakers while preserving chronology and boundaries', async () => {
 const result = await processMarkdown('[00:01] **Laurel:** A thought.\n\n[00:02] **Henry:** Yeah.\n\n[00:03] **Laurel:** Cool.\n\n[00:04] **Henry:** Right.\n\n[00:20] **Laurel:** Okay.\n\n## Next\n\n[00:21] **Henry:** A new thought.');
 expect(result.match(/reply-row-pair/g)?.length).toBe(1);
 expect(result.match(/class="reply-row/g)?.length).toBe(3);
 expect(result.indexOf('id="msg-2"')).toBeLessThan(result.indexOf('id="msg-3"'));
 expect(result).toContain('href="#t=3"');
 expect(result).toContain('<b>Laurel · 0:03</b> Cool.');
 expect(result).not.toContain('<blockquote');
});


test('uncertain and third speakers keep visible attribution rather than becoming nods', async () => {
 const result = await processMarkdown('[00:01] **Laurel:** A thought.\n\n[00:02] **Henry:** Yeah.\n\n[00:03] **Unconfirmed:** Okay.\n\n[00:04] **Guest:** Cool.');
 expect(result.match(/data-kind="nod"/g)?.length).toBe(1);
 expect(result).toContain('<b>Unconfirmed</b>');
 expect(result).toContain('<b>Guest</b>');
});


test('short substantive replies keep accessible attribution and chronological reading order', async () => {
 const result = await processMarkdown('[00:00] **Laurel:** First thought.\n\n[00:01] **Henry:** A thought.\n\n[00:02] **Laurel:** Yeah.\n\n[00:03] **Henry:** Cool.\n\n[00:04] **Laurel:** Your surroundings.\n\n[00:05] **Henry:** What does that mean?');
 expect(result.indexOf('id="msg-2"')).toBeLessThan(result.indexOf('id="msg-3"'));
 expect(result.indexOf('id="msg-3"')).toBeLessThan(result.indexOf('id="msg-4"'));
 expect(result.match(/<p id="msg-4"[^>]+>/)?.[0]).toContain('data-kind="nod"');
 expect(result).toContain('<b>Laurel · 0:04</b> Your surroundings.');
 expect(result.match(/<p id="msg-5"[^>]+>/)?.[0]).not.toContain('data-kind="nod"');
 expect(result).toContain('<b>Laurel</b>');
 expect(result).toContain('href="#t=5"');
});
