document.addEventListener("DOMContentLoaded", () => {
  const lista = document.getElementById("lista-carrito");
  const totalUnidades = document.getElementById("total-unidades");
  const form = document.getElementById("form-cotizacion");

  function obtenerCarrito() {
    if (window.Carrito) return window.Carrito.obtener();
    const raw = localStorage.getItem("carrito");
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function calcularUnidades(item) {
    const cantidad = parseInt(item.cantidad) || 1;
    const fardo = parseInt(item.unidadesPorFardo) || 0;

    if (item.unidad === "Unidad") return cantidad;
    if (item.unidad === "Docena") return cantidad * 12;
    if (item.unidad === "Fardo") return cantidad * fardo;
    return 0;
  }

  function textoEquivalencia(item) {
    const unidades = calcularUnidades(item);
    if (unidades === 0) return "—";

    const docenas = (unidades / 12).toFixed(2).replace(".00", "");
    const fardos = item.unidadesPorFardo
      ? (unidades / item.unidadesPorFardo).toFixed(2).replace(".00", "")
      : null;

    let texto = `${unidades} unidades`;
    if (docenas) texto += ` · ${docenas} docenas`;
    if (fardos) texto += ` · ${fardos} fardos`;
    return texto;
  }

  function renderCarrito() {
    if (!lista) return;

    const carrito = obtenerCarrito();

    // Regla exclusiva para OFERTAS/COMBOS:
    // siempre se cotiza como "Unidad" y no debe depender del estado previo guardado.
    let hayCambios = false;
    carrito.forEach((item) => {
      if (item.categoria === "Ofertas" && item.unidad !== "Unidad") {
        item.unidad = "Unidad";
        hayCambios = true;
      }
    });

    if (hayCambios) {
      if (window.Carrito && typeof window.Carrito.guardar === "function") {
        window.Carrito.guardar(carrito);
      } else {
        localStorage.setItem("carrito", JSON.stringify(carrito));
      }
    }

    lista.innerHTML = "";

    let total = 0;

    if (carrito.length === 0) {
      lista.innerHTML = `
        <div class="text-center py-20 text-gray-500">
          No hay productos en el presupuesto
        </div>
      `;

      if (totalUnidades) {
        totalUnidades.textContent = "";
      }

      return;
    }

    carrito.forEach((item, index) => {
      const esOferta = item.categoria === "Ofertas";
      const unidades = calcularUnidades(item);
      total += unidades;

      let opcionesUnidad = "";
      if (esOferta) {
        opcionesUnidad = `<option value="Unidad" selected>Unidad</option>`;
      } else {
        if (item.permiteUnidad) {
          opcionesUnidad += `<option value="Unidad" ${
            item.unidad === "Unidad" ? "selected" : ""
          }>Unidad</option>`;
        }
        opcionesUnidad += `<option value="Docena" ${
          item.unidad === "Docena" ? "selected" : ""
        }>Docena</option>`;
        opcionesUnidad += `<option value="Fardo" ${
          item.unidad === "Fardo" ? "selected" : ""
        }>Fardo</option>`;
      }

      const card = document.createElement("div");
      card.className =
        "bg-white rounded-xl shadow-sm p-6 flex gap-6 items-center border border-gray-100";

      card.innerHTML = `
        <img src="${item.imagen}"
          loading="lazy"
          decoding="async"
          class="w-20 h-20 min-w-[80px] object-cover rounded-lg border">

        <div class="flex-1">
          <h3 class="font-semibold text-lg">
            ${item.producto}
          </h3>

          <p class="text-gray-500 text-sm mb-4">
            ${item.presentacion}
          </p>

          <div class="flex flex-wrap gap-4 items-center">
            <select
              data-index="${index}"
              class="select-unidad border rounded-lg px-3 py-2 bg-white"
              ${esOferta ? "disabled" : ""}>
              ${opcionesUnidad}
            </select>

            <input
              type="number"
              min="1"
              value="${item.cantidad}"
              data-index="${index}"
              class="input-cantidad w-24 border rounded-lg px-3 py-2">
          </div>

          ${
            esOferta
              ? ""
              : `<p class="text-sm text-gray-500 mt-3">
                  Equivale a
                  <span class="font-semibold text-gray-700">
                    ${textoEquivalencia(item)}
                  </span>
                </p>`
          }
        </div>

        <button
          data-index="${index}"
          class="btn-eliminar text-red-500 hover:text-red-700 font-semibold">
          Quitar
        </button>
      `;

      lista.appendChild(card);
    });

    if (totalUnidades) {
      totalUnidades.textContent = `Total del pedido: ${total} unidades`;
    }

    activarEventos();
  }

  function activarEventos() {
    document.querySelectorAll(".btn-eliminar").forEach((btn) => {
      btn.addEventListener("click", () => {
        const index = btn.dataset.index;
        if (window.Carrito) {
          window.Carrito.eliminar(index);
        }
        notificar("Producto eliminado del presupuesto", "warning");
        renderCarrito();
      });
    });

    document.querySelectorAll(".input-cantidad").forEach((input) => {
      input.addEventListener("change", () => {
        const index = input.dataset.index;
        let cantidad = parseInt(input.value);
        if (!cantidad || cantidad < 1) cantidad = 1;

        if (window.Carrito) {
          window.Carrito.actualizarCantidad(index, cantidad);
        }

        renderCarrito();
      });
    });

    document.querySelectorAll(".select-unidad").forEach((select) => {
      select.addEventListener("change", () => {
        const index = select.dataset.index;
        const carrito = obtenerCarrito();
        if (!carrito[index]) return;

        carrito[index].unidad = select.value;

        if (window.Carrito) {
          window.Carrito.guardar(carrito);
        } else {
          localStorage.setItem("carrito", JSON.stringify(carrito));
        }

        if (window.actualizarContador) {
          window.actualizarContador();
        }

        renderCarrito();
      });
    });
  }

  renderCarrito();

  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const submitBtn = form.querySelector('button[type="submit"]');

      const carrito = obtenerCarrito();
      if (!carrito.length) {
        notificar("No hay productos en el presupuesto.", "warning");
        return;
      }

      const formData = new FormData(form);
      const payload = {
        nombre: (formData.get("nombre") || "").toString().trim(),
        email: (formData.get("email") || "").toString().trim(),
        provincia: (formData.get("provincia") || "").toString().trim(),
        localidad: (formData.get("localidad") || "").toString().trim(),
        mensaje: (formData.get("mensaje") || "").toString().trim(),
        items: carrito.map((item) => ({
          id: item.id,
          producto: item.producto,
          unidad: item.unidad,
          cantidad: parseInt(item.cantidad) || 1,
          presentacion: item.presentacion,
          unidadesPorFardo: parseInt(item.unidadesPorFardo) || 0,
        })),
      };

      if (
        !payload.nombre ||
        !payload.email ||
        !payload.provincia ||
        !payload.localidad
      ) {
        notificar("Complete los campos obligatorios del formulario.", "warning");
        return;
      }

      try {
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.classList.add("opacity-80");
        }

        const res = await fetch("/api/cotizacion", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          throw new Error(data.mensaje || "Error al enviar la cotización");
        }

        notificar("Solicitud enviada correctamente. Nos contactaremos a la brevedad.", "success");

        if (window.Carrito) {
          window.Carrito.vaciar();
        } else {
          localStorage.removeItem("carrito");
        }

        if (typeof window.actualizarContador === "function") {
          window.actualizarContador();
        }

        renderCarrito();
        form.reset();
      } catch (error) {
        console.error("Error enviando cotización:", error);
        notificar(
          error?.message || "No se pudo enviar la cotización. Intente nuevamente.",
          "error"
        );
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.classList.remove("opacity-80");
        }
      }
    });
  }
});
