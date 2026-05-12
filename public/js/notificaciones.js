function notificar(texto, tipo = "info") {
  const rootId = "tml-toast-root";
  let root = document.getElementById(rootId);

  if (!root) {
    root = document.createElement("div");
    root.id = rootId;
    root.className = "fixed bottom-8 right-8 z-[100] flex flex-col gap-3 items-end pointer-events-none";
    document.body.appendChild(root);
  }

  const config = {
    success: { bg: "bg-emerald-50", border: "border-emerald-100", text: "text-emerald-900", icon: "✓", accent: "bg-emerald-500" },
    error: { bg: "bg-rose-50", border: "border-rose-100", text: "text-rose-900", icon: "✕", accent: "bg-rose-500" },
    warning: { bg: "bg-amber-50", border: "border-amber-100", text: "text-amber-900", icon: "!", accent: "bg-amber-500" },
    info: { bg: "bg-slate-50", border: "border-slate-100", text: "text-slate-900", icon: "i", accent: "bg-slate-500" }
  };

  const c = config[tipo] || config.info;
  const toast = document.createElement("div");
  
  toast.className = `
    pointer-events-auto ${c.bg} ${c.border} border ${c.text} 
    shadow-xl rounded-2xl px-5 py-4 text-sm font-semibold
    flex items-center gap-4 transition-all duration-500 ease-out
    translate-x-12 opacity-0 transform-gpu
  `;

  toast.innerHTML = `
    <div class="flex items-center justify-center w-6 h-6 rounded-full ${c.accent} text-white text-[10px] shadow-sm">
      ${c.icon}
    </div>
    <div class="pr-2">${texto}</div>
  `;

  root.appendChild(toast);

  // Trigger animation
  requestAnimationFrame(() => {
    toast.classList.remove("translate-x-12", "opacity-0");
  });

  const hide = () => {
    toast.classList.add("translate-x-12", "opacity-0");
    setTimeout(() => {
      toast.remove();
      if (root.childElementCount === 0) root.remove();
    }, 500);
  };

  setTimeout(hide, 3000);
}
