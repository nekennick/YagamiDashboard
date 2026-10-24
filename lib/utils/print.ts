/**
 * Isolated HTML Element Printing via Direct DOM Portal
 * Solves browser iframe culling/opacity bugs and eliminates blank trailing pages.
 * Hides all surrounding dashboard UI via @media print while printing only the target sheet.
 */
export function printHtmlElement(element: HTMLElement, title = "In phiếu chứng từ"): void {
  if (typeof window === "undefined" || !element) return;

  const prevTitle = document.title;
  if (title) {
    document.title = title;
  }

  // Remove any preexisting portal
  let portal = document.getElementById("print-portal");
  if (portal && portal.parentNode) {
    portal.parentNode.removeChild(portal);
  }

  portal = document.createElement("div");
  portal.id = "print-portal";

  // Deep clone the printable element
  const clone = element.cloneNode(true) as HTMLElement;

  // Strip fixed preview heights and large screen paddings that cause extra blank pages in print
  clone.classList.remove("min-h-[297mm]", "w-[210mm]", "p-10", "p-8", "sm:p-12", "shadow-2xl", "shadow-sm");
  clone.style.minHeight = "0";
  clone.style.height = "auto";
  clone.style.padding = "0";
  clone.style.margin = "0";
  clone.style.boxShadow = "none";

  portal.appendChild(clone);
  document.body.appendChild(portal);

  const cleanup = () => {
    document.title = prevTitle;
    if (portal && portal.parentNode) {
      portal.parentNode.removeChild(portal);
    }
    window.removeEventListener("afterprint", cleanup);
  };

  window.addEventListener("afterprint", cleanup);

  // Allow DOM to settle, then open print dialog
  setTimeout(() => {
    try {
      window.print();
    } catch (e) {
      console.error("Lỗi khi gọi window.print():", e);
    } finally {
      setTimeout(cleanup, 2000);
    }
  }, 100);
}
