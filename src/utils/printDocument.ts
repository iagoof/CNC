/** Print only a generated, escaped document; never the application's navigation. */
export async function printDocument(html: string): Promise<void> {
  const frame = document.createElement('iframe');
  frame.title = 'Documento para impressão';
  frame.style.cssText = 'position:fixed;width:1px;height:1px;left:-10000px;border:0';
  frame.setAttribute('aria-hidden', 'true');
  let cleanupTimer: ReturnType<typeof setTimeout>;
  const cleanup = () => { clearTimeout(cleanupTimer); frame.remove(); };
  return new Promise((resolve, reject) => {
    const loadTimer = setTimeout(() => { cleanup(); reject(new Error('A preparação da impressão demorou demais. Tente novamente.')); }, 10000);
    frame.onload = async () => {
      clearTimeout(loadTimer);
      try {
        if (!frame.contentWindow) throw new Error('O navegador não disponibilizou a impressão.');
        await frame.contentDocument?.fonts.ready;
        frame.contentWindow.addEventListener('afterprint', cleanup, { once: true });
        cleanupTimer = setTimeout(cleanup, 300000);
        frame.contentWindow.focus();
        frame.contentWindow.print();
        resolve();
      } catch (error) { cleanup(); reject(error); }
    };
    frame.srcdoc = html;
    document.body.appendChild(frame);
  });
}
