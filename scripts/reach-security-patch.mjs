#!/usr/bin/env node
/**
 * REACH staging-only security overlay.
 * Applies only to disposable pinned GoHyperLevel checkouts.
 * Never changes upstream GitHub or REACH production.
 */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root=resolve(process.argv[2] || '_upstream/gohyperlevel');
function patch(relativePath, changes) {
  const path=join(root,relativePath);
  let code=readFileSync(path,'utf8');
  for (const [before,after] of changes) {
    const matches=code.split(before).length-1;
    assert.equal(matches,1,relativePath+': expected exactly one original match, found '+matches);
    code=code.replace(before,after);
  }
  writeFileSync(path,code);
  console.log('REACH staging-only security overlay applied: '+relativePath);
}

patch('server/services/record-access.ts',[
  [
    "if (who.via === 'api_key' || who.via === 'agency_key') return null;",
    "if (who.via === 'agency_key') return null;"
  ],
  [
    'Admins, API keys and automations are not people with a team – they see everything; the agent and the app act as the person.',
    'Admins and unbound API keys retain broad access. Keys bound to a member follow that member’s field and record limits, including for direct REST.'
  ],
  [
    'The rules that apply to a request, or null when nothing is narrowed (rules off, an admin, a key or the MCP endpoint,',
    'The rules that apply to a request, or null when nothing is narrowed (rules off, an admin or an unbound key,'
  ],
  [
    "// Keys act for the sub-account, not for a person. Everything that acts for a member – the browser, the app, the HyperLevel Agent\n  // working for them, an AI app they connected – follows their rules.",
    "// Unbound integration keys act administratively. A key bound to a real member must follow\n  // that member’s records/fields both via MCP and direct REST, never silently elevate."
  ]
]);

patch('server/modules/record-access.ts',[
  [
    'Off by default. Admins, API keys, MCP connections and automations are not people with a team and see everything; so that a',
    'Off by default. Admins, unbound API keys and agency integrations have broad access. Keys bound to a'
  ],
  [
    'restricted person cannot hand themselves such a key, creating keys, webhooks and bulk exports is refused to them.',
    'restricted member respect that person’s record limits. Creating keys, webhooks and bulk exports is refused to restricted members.'
  ],
  [
    'Schlüssel und MCP sehen unabhängig davon alle Datensätze.',
    'Nutzergebundene API-Schlüssel folgen den Rechtebeschränkungen der Nutzer; ungebundene und Agentur-Schlüssel haben umfassenden Zugriff.'
  ]
]);
