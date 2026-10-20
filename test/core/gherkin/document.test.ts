import { describe, expect, it } from 'vitest';
import { dedent, parseFeature, ruleSource } from '../../../src/core/gherkin/document.js';

const SPEC = [
  '@capability',
  'Feature: Billing',
  '  Issue invoices and credit notes.',
  '',
  '  # Why this rule exists.',
  '  @REQ-0001 @notrace',
  '  Rule: Invoices',
  '    The system SHALL issue an invoice for each order.',
  '',
  '    Scenario: Order placed',
  '      When an order is placed',
  '      Then an invoice is issued',
  '',
  '  # A note about the rules below.',
  '',
  '  @added @REQ-0002',
  '  Rule: Credit notes',
  '    The system SHALL issue a credit note when an invoice is voided.',
  '',
  '    @smoke',
  '    Scenario: Invoice voided',
  '      Given an issued invoice',
  '      When the invoice is voided',
  '      Then a credit note reads:',
  '        """',
  '        Credit for invoice 42',
  '        """',
  '      And the ledger has these rows:',
  '        | account | amount |',
  '        | sales   | -42    |',
  '',
].join('\n');

describe('parseFeature', () => {
  const document = parseFeature(SPEC);

  it('reads the feature name, description and tags', () => {
    expect(document.errors).toEqual([]);
    expect(document.feature).toMatchObject({
      name: 'Billing',
      description: 'Issue invoices and credit notes.',
      tags: ['capability'],
      language: 'en',
      line: 2,
      looseScenarios: [],
    });
  });

  it('reads each rule as a requirement with its ID, tags and statement', () => {
    expect(document.rules.map((rule) => rule.name)).toEqual(['Invoices', 'Credit notes']);
    const [invoices, credit] = document.rules;
    expect(invoices).toMatchObject({
      id: 'REQ-0001',
      ids: ['REQ-0001'],
      tags: ['REQ-0001', 'notrace'],
      operations: [],
      tagLines: [6],
      description: 'The system SHALL issue an invoice for each order.',
      keywordLine: 7,
      keywordColumn: 3,
    });
    expect(credit).toMatchObject({ id: 'REQ-0002', operations: ['added'], tagLines: [16] });
  });

  it('reads scenarios with their steps, tags and step arguments', () => {
    const [scenario] = document.rules[1].scenarios;
    expect(scenario).toMatchObject({ keyword: 'Scenario', name: 'Invoice voided', tags: ['smoke'], line: 21 });
    expect(scenario.steps.map((step) => `${step.keyword} ${step.text}`)).toEqual([
      'Given an issued invoice',
      'When the invoice is voided',
      'Then a credit note reads:',
      'And the ledger has these rows:',
    ]);
    expect(scenario.steps[2].argument).toBe('Credit for invoice 42');
    expect(scenario.steps[3].argument).toBe('| account | amount |\n| sales | -42 |');
  });

  it('gives each rule the line range archive splices', () => {
    const [invoices, credit] = document.rules;
    // A comment directly above the tags belongs to the rule.
    expect(invoices.startLine).toBe(5);
    // A comment after a blank line does not: it stays between the rules.
    expect(invoices.endLine).toBe(12);
    expect(credit.startLine).toBe(16);
    expect(credit.endLine).toBe(30);
    expect(ruleSource(document, invoices).split('\n')[0]).toBe('  # Why this rule exists.');
  });

  it('keeps a comment written directly under the last step inside the rule', () => {
    const parsed = parseFeature(
      ['Feature: F', '', '  @REQ-0001', '  Rule: R', '', '    Scenario: S', '      Then it works', '      # TODO: one more case', ''].join('\n')
    );
    expect(parsed.rules[0].endLine).toBe(8);
  });

  it('reports syntax errors with a line instead of throwing', () => {
    const parsed = parseFeature('Feature: One\n\n  Scenario: S\n    When it runs\n\nFeature: Two\n');
    expect(parsed.feature).toBeUndefined();
    expect(parsed.errors[0].line).toBe(6);
    expect(parsed.errors[0].message).not.toMatch(/^\(\d+:\d+\)/);
  });

  it('returns no feature for an empty file or a file with only comments', () => {
    for (const content of ['', '# just a note\n']) {
      const parsed = parseFeature(content);
      expect(parsed.feature).toBeUndefined();
      expect(parsed).toMatchObject({ rules: [], errors: [] });
    }
  });

  it('strips a byte order mark and reads CRLF line endings', () => {
    const parsed = parseFeature(`﻿${SPEC.replace(/\n/g, '\r\n')}`);
    expect(parsed.errors).toEqual([]);
    expect(parsed.lines[1]).toBe('Feature: Billing');
    expect(parsed.rules.map((rule) => rule.keywordLine)).toEqual([7, 17]);
  });

  it('records loose scenarios and a background on the feature', () => {
    const parsed = parseFeature(
      ['Feature: F', '  Background:', '    Given a user', '', '  Scenario: Loose', '    Then it is outside every rule', ''].join('\n')
    );
    expect(parsed.feature?.backgroundLine).toBe(2);
    expect(parsed.feature?.looseScenarios.map((scenario) => scenario.name)).toEqual(['Loose']);
    expect(parsed.rules).toEqual([]);
  });

  it('reads a feature written in another language', () => {
    const parsed = parseFeature(
      [
        '# language: fr',
        'Fonctionnalité: Facturation',
        '  Émettre des factures.',
        '',
        '  @REQ-0001',
        '  Règle: Factures',
        '    Le système DOIT émettre une facture.',
        '',
        '    Scénario: Commande passée',
        '      Quand une commande est passée',
        '      Alors une facture est émise',
        '',
      ].join('\n')
    );
    expect(parsed.errors).toEqual([]);
    expect(parsed.feature).toMatchObject({ name: 'Facturation', language: 'fr' });
    expect(parsed.rules[0]).toMatchObject({ id: 'REQ-0001', name: 'Factures' });
    expect(parsed.rules[0].scenarios[0].steps).toHaveLength(2);
  });

  it('leaves the id undefined when a rule has several ID tags', () => {
    const parsed = parseFeature('Feature: F\n\n  @REQ-0001 @REQ-0002\n  Rule: R\n');
    expect(parsed.rules[0]).toMatchObject({ id: undefined, ids: ['REQ-0001', 'REQ-0002'] });
  });
});

describe('dedent', () => {
  it('removes the common indentation and the blank lines around the text', () => {
    expect(dedent('\n    first\n      second\n\n    third\n\n')).toBe('first\n  second\n\nthird');
  });

  it('returns an empty string for nothing', () => {
    expect(dedent(undefined)).toBe('');
    expect(dedent('   \n  ')).toBe('');
  });
});
