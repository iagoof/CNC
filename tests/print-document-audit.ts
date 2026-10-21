import { printDocument } from '../src/utils/printDocument';

/** Verify the real iframe print pipeline while replacing only the device dialog. */
export async function auditPrintPreparation(html: string, expectedText: string, expectedPage: string) {
  let printed = false;
  let printedFrame: HTMLIFrameElement | undefined;
  const observer = new MutationObserver(records => {
    for (const record of records) for (const node of record.addedNodes) {
      if (!(node instanceof HTMLIFrameElement) || node.title !== 'Documento para impressão') continue;
      printedFrame = node;
      node.addEventListener('load', () => {
        node.contentWindow!.print = () => {
          const document = node.contentDocument!;
          if (!document.body.textContent?.includes(expectedText)) throw new Error('O documento esperado não chegou à impressão.');
          if (document.body.textContent?.includes('Validação de documentos — dados isolados')) throw new Error('A navegação da aplicação foi incluída na impressão.');
          if (!document.querySelector('style')?.textContent?.includes(`size:${expectedPage}`)) throw new Error('O formato de papel não corresponde ao documento.');
          printed = true;
          node.contentWindow!.dispatchEvent(new Event('afterprint'));
        };
      }, { capture: true, once: true });
    }
  });
  observer.observe(document.body, { childList: true });
  try {
    await printDocument(html);
    if (!printed) throw new Error('O navegador não chamou a impressão do documento.');
    if (printedFrame?.isConnected) throw new Error('O quadro de impressão não foi removido.');
  } finally { observer.disconnect(); }
}
