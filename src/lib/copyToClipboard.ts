// Robust clipboard copy with fallback for iframes / lost user-gesture contexts.
export async function copyTextToClipboard(text: string): Promise<void> {
  // Try modern API first
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch (_) {
    // fall through to legacy
  }

  // Legacy fallback using a hidden textarea + execCommand("copy")
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  textarea.style.left = "0";
  textarea.style.width = "1px";
  textarea.style.height = "1px";
  textarea.style.padding = "0";
  textarea.style.border = "none";
  textarea.style.outline = "none";
  textarea.style.boxShadow = "none";
  textarea.style.background = "transparent";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);

  const selection = document.getSelection();
  const savedRange = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;

  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, text.length);

  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch (_) {
    ok = false;
  }

  document.body.removeChild(textarea);
  if (savedRange && selection) {
    selection.removeAllRanges();
    selection.addRange(savedRange);
  }

  if (!ok) {
    throw new Error(
      "No se pudo copiar al portapapeles. Abre la app en una pestaña nueva (botón ↗) o usa la opción de descargar XLSX."
    );
  }
}
