export function formatHumanMovement(
  m: any,
  productMap: Record<string, string>,
  tallerMap: Record<string, string>,
  depositoMap: Record<string, string>
): string {
  const user = m.usuarioNombreSnapshot || "Usuario";
  const taller = m.tallerId && (tallerMap[m.tallerId] || m.taller?.nombre || `Taller ${m.tallerId}`);
  
  if (!m.items || m.items.length === 0) {
    return `${user} realizó un movimiento de tipo ${m.tipo} (sin ítems).`;
  }

  switch (m.tipo) {
    case "ENTREGA_TALLER": {
      const itemsText = m.items.map((it: any) => {
        const prodName = productMap[it.productoId] || it.productoNombreSnapshot || it.productoId;
        return `${it.cantidadUnidades.toLocaleString()} unidades de ${prodName}`;
      }).join(", ");
      
      const insumosText = m.insumos && m.insumos.length > 0 
        ? ` con insumos: ${m.insumos.map((i: any) => `${i.cantidad} ${i.descripcion}`).join(", ")}` 
        : "";
      
      return `${user} entregó a ${taller || "taller"}: ${itemsText}${insumosText}.`;
    }

    case "DEVOLUCION_TALLER": {
      const groups: Record<string, { perfect: number; fallado: number }> = {};
      m.items.forEach((it: any) => {
        const prodName = productMap[it.productoId] || it.productoNombreSnapshot || it.productoId;
        if (!groups[prodName]) {
          groups[prodName] = { perfect: 0, fallado: 0 };
        }
        if (it.calidad === "FALLADO") {
          groups[prodName].fallado += it.cantidadUnidades;
        } else {
          groups[prodName].perfect += it.cantidadUnidades;
        }
      });
      
      const descList = Object.entries(groups).map(([prodName, data]) => {
        const parts = [];
        if (data.perfect > 0) parts.push(`${data.perfect.toLocaleString()} perfectas`);
        if (data.fallado > 0) parts.push(`${data.fallado.toLocaleString()} falladas`);
        return `${prodName} (${parts.join(", ")})`;
      }).join(", ");
      
      return `Recibido de ${taller || "taller"}: ${descList}.`;
    }

    case "APERTURA_FARDO": {
      const it = m.items[0];
      const prodName = it ? (productMap[it.productoId] || it.productoNombreSnapshot || it.productoId) : "producto";
      const qty = it ? it.cantidadUnidades : 0;
      const origin = it?.depositoOrigenId ? (depositoMap[it.depositoOrigenId] || "depósito") : "depósito";
      const dest = it?.depositoDestinoId ? (depositoMap[it.depositoDestinoId] || "depósito") : "depósito";
      return `${user} abrió fardos de ${prodName} en ${origin} (${qty.toLocaleString()} unidades transferidas a ${dest}).`;
    }

    case "MOVIMIENTO_INTERNO": {
      const desc = m.items.map((it: any) => {
        const prodName = productMap[it.productoId] || it.productoNombreSnapshot || it.productoId;
        const origin = it.depositoOrigenId ? (depositoMap[it.depositoOrigenId] || "depósito") : "depósito";
        const dest = it.depositoDestinoId ? (depositoMap[it.depositoDestinoId] || "depósito") : "depósito";
        return `${it.cantidadUnidades.toLocaleString()} unidades de ${prodName} de ${origin} a ${dest}`;
      }).join(", ");
      return `${user} transfirió: ${desc}.`;
    }

    case "AJUSTE": {
      const desc = m.items.map((it: any) => {
        const prodName = productMap[it.productoId] || it.productoNombreSnapshot || it.productoId;
        const dep = it.depositoOrigenId ? (depositoMap[it.depositoOrigenId] || "depósito") : "depósito";
        const sign = it.direccion === "ENTRADA" ? "+" : "-";
        return `${sign}${it.cantidadUnidades.toLocaleString()} unidades de ${prodName} en ${dep}`;
      }).join(", ");
      return `Ajuste administrativo de stock realizado por ${user}: ${desc}.`;
    }

    case "INGRESO_MANUAL": {
      const desc = m.items.map((it: any) => {
        const prodName = productMap[it.productoId] || it.productoNombreSnapshot || it.productoId;
        const dep = it.depositoDestinoId ? (depositoMap[it.depositoDestinoId] || "depósito") : "depósito";
        
        // If it's in Zona de Corte, it's Production of Corte
        const isCorte = dep.toUpperCase().includes("CORTE") || (it.depositoDestinoId && it.depositoDestinoId.includes("corte"));
        if (isCorte) {
          return `${it.cantidadUnidades.toLocaleString()} unidades de ${prodName}`;
        }
        return `+${it.cantidadUnidades.toLocaleString()} unidades de ${prodName} en ${dep}`;
      }).join(", ");

      const isCorte = m.items.some((it: any) => {
        const dep = it.depositoDestinoId ? (depositoMap[it.depositoDestinoId] || "depósito") : "";
        return dep.toUpperCase().includes("CORTE") || (it.depositoDestinoId && it.depositoDestinoId.includes("corte"));
      });

      if (isCorte) {
        return `${user} registró producción de corte: ${desc}.`;
      }
      return `${user} realizó ingreso manual: ${desc}.`;
    }

    default: {
      const itemsDesc = m.items.map((it: any) => {
        const prodName = productMap[it.productoId] || it.productoNombreSnapshot || it.productoId;
        return `${it.cantidadUnidades.toLocaleString()} unidades de ${prodName}`;
      }).join(", ");
      return `${user} realizó movimiento ${m.tipo}: ${itemsDesc}.`;
    }
  }
}
