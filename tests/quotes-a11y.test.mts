import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

test('QuotesView contains accessible names and focus rings on deletion buttons', () => {
  const filePath = resolve(process.cwd(), 'src/components/quotes/QuotesView.tsx');
  const fileContent = readFileSync(filePath, 'utf-8');

  // Verify header delete button has aria-label and focus-visible styling
  assert.ok(
    fileContent.includes('aria-label={`Excluir orçamento ${activeQuote.quoteNumber}`}'),
    'Header delete button must have an aria-label with the active quote number'
  );
  assert.ok(
    fileContent.includes('focus-visible:ring-rose-500'),
    'Delete button must have focus-visible ring indicator'
  );

  // Verify quote list delete button has contextual aria-label
  assert.ok(
    fileContent.includes('aria-label={`Excluir orçamento ${q.quoteNumber}`}'),
    'Quotes list item delete button must have an aria-label with the proposal number'
  );

  // Verify quote item remove button has aria-label and title
  assert.ok(
    fileContent.includes('aria-label={`Remover item ${item.description || index + 1}`}'),
    'Quote item remove button must have an accessible aria-label'
  );
  assert.ok(
    fileContent.includes('title="Remover peça"'),
    'Quote item remove button must include a title for tooltip and assistive technology'
  );
});
