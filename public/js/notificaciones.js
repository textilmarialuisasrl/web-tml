function notificar(texto, tipo = "info") {
  const rootId = "tml-toast-root";
  let root = document.getElementById(rootId);

  if (!root) {
    root = document.createElement("div");
    root.id = rootId;
    root.className =
      "fixed top-6 right-6 z-50 flex flex-col gap-3 items-end pointer-events-none";
    document.body.appendChild(root);
  }

  const colores = {
    success: "text-green-600",
    warning: "text-yellow-600",
    error: "text-red-600",
    info: "text-gray-700",
  };

  const acentos = {
    success: "bg-green-600",
    warning: "bg-yellow-600",
    error: "bg-red-600",
    info: "bg-gray-700",
  };

  const iconos = {
    success: "✓",
    warning: "!",
    error: "✕",
    info: "i",
  };

  const contenedor = document.createElement("div");
  contenedor.className =
    "pointer-events-auto bg-white border border-gray-200 shadow-xl rounded-xl px-4 py-3 text-sm flex items-center gap-3 animate-fadeIn min-w-[260px] max-w-sm";

  contenedor.innerHTML = `
    <span class="w-1.5 h-8 rounded-full ${acentos[tipo] || acentos.info}"></span>
    <div class="flex items-center gap-2">
      <span class="inline-flex w-6 h-6 items-center justify-center rounded-full bg-gray-100 text-xs ${colores[tipo] || colores.info}">
        ${iconos[tipo] || iconos.info}
      </span>
      <span class="${colores[tipo] || colores.info} font-semibold">
        ${texto}
      </span>
    </div>
  `;

  root.appendChild(contenedor);

  setTimeout(() => {
    contenedor.style.opacity = "0";
    contenedor.style.transform = "translateY(-6px)";
  }, 2400);

  setTimeout(() => {
    contenedor.remove();
    if (root.childElementCount === 0) {
      root.remove();
    }
  }, 2800);
}
