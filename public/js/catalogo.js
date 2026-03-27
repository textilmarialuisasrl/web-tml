document.addEventListener("DOMContentLoaded", async () => {

  try {

    const res = await fetch("/api/productos");
    const productos = await res.json();

    const contenedores = {
      Trapos: document.getElementById("contenedor-productos-trapos"),
      Rejillas: document.getElementById("contenedor-productos-rejillas"),
      Limpieza: document.getElementById("contenedor-productos-limpieza"),
      Ofertas: document.getElementById("contenedor-productos-ofertas")
    };

    window.productosGlobal = productos;
    window.indiceImagenes = {};

    productos.forEach((producto, index) => {

      const esMasVendido = [
        "Trapo Mediano",
        "Rejilla Doble Pesada",
        "Alfombrita Estampada",
        "Franela"
      ].includes(producto.nombre);

      const esOferta = producto.categoria === "Ofertas";

      const card = document.createElement("div");
      card.className =
        "group rounded-2xl border overflow-hidden shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex flex-col h-full opacity-0 translate-y-6 " +
        (esOferta ? "bg-gray-900 border-primary text-white" : "bg-white border-gray-200");

      setTimeout(() => {
        card.classList.remove("opacity-0", "translate-y-6");
        card.classList.add("opacity-100", "translate-y-0");
      }, index * 80);

      let badge = "";
      if (esOferta) {
        badge = `<span class="absolute top-4 left-4 bg-primary text-white text-xs px-3 py-1 rounded-full tracking-wide shadow">Oferta</span>`;
      } else if (esMasVendido) {
        badge = `<span class="absolute top-4 left-4 bg-gray-900 text-white text-xs px-3 py-1 rounded-full tracking-wide shadow">Más Vendido</span>`;
      }

      const notaTecnica = producto.categoria === "Trapos"
        ? `<p class="text-xs text-gray-400 mt-3">Para máxima absorción, sumergir en agua antes del primer uso.</p>`
        : "";

      card.innerHTML = `

        <div class="h-full ${esOferta ? "bg-gray-900 text-white" : "bg-white"} rounded-2xl overflow-hidden">
                
          <div class="relative overflow-hidden h-72 bg-gradient-to-b from-gray-100 to-gray-50">
        
            ${badge}
        
            <img
              src="${producto.imagenes[0]}"
              alt="${producto.nombre}"
              loading="lazy"
              decoding="async"
              class="w-full h-72 object-contain p-4"
              id="img-${producto.id}"
            >

            ${producto.imagenes.length > 1 ? `
              <button
                class="btn-img-prev absolute left-3 top-1/2 -translate-y-1/2
                bg-white/85 text-gray-900 border border-gray-200
                w-8 h-8 rounded-full flex items-center justify-center
                shadow-lg backdrop-blur transition-opacity duration-200 opacity-80 hover:opacity-100"
                data-id="${producto.id}">
                <span class="text-lg font-bold leading-none">&lsaquo;</span>
              </button>

              <button
                class="btn-img-next absolute right-3 top-1/2 -translate-y-1/2
                bg-white/85 text-gray-900 border border-gray-200
                w-8 h-8 rounded-full flex items-center justify-center
                shadow-lg backdrop-blur transition-opacity duration-200 opacity-80 hover:opacity-100"
                data-id="${producto.id}">
                <span class="text-lg font-bold leading-none">&rsaquo;</span>
              </button>
            ` : ""}
        
            <div class="absolute bottom-3 right-3 text-[11px] text-white bg-gray-900/70 px-2 py-1 rounded-full backdrop-blur-sm">
              ${producto.imagenes.length > 1 ? `${producto.imagenes.length} fotos` : ""}
            </div>
        
          </div>
        
          <div class="p-6 flex flex-col flex-1 ${esOferta ? "bg-gray-900 text-white" : ""}">
        
            <h3 class="text-lg font-bold mb-2 tracking-tight ${esOferta ? "text-white" : "text-gray-900"}">
              ${producto.nombre}
            </h3>
        
            <p class="text-sm ${esOferta ? "text-gray-200" : "text-gray-600"} mb-4 line-clamp-2">
              ${producto.descripcion}
            </p>
        
            <div class="text-xs ${esOferta ? "text-gray-300" : "text-gray-500"} space-y-1 mb-4">
              <p><strong>Medida:</strong> ${producto.medida}</p>
              <p><strong>Presentación:</strong> ${producto.presentacion}</p>
            </div>
        
            ${notaTecnica}

            ${esOferta ? `
              <p class="mt-2 text-[11px] uppercase tracking-wide text-primary font-semibold">
                Venta exclusiva por unidad / combo
              </p>
            ` : ""}
        
            <div class="mt-auto pt-4">
              <button
                class="btn-agregar cursor-pointer w-full mt-auto bg-primary hover:bg-green-800 text-white py-3 rounded-lg font-semibold tracking-wide transition shadow-md"
                data-id="${producto.id}">
                Agregar al presupuesto
              </button>
            </div>
        
          </div>
        
        </div>
        
      `;

      const img = card.querySelector(`#img-${producto.id}`);

      if (contenedores[producto.categoria]) {

        contenedores[producto.categoria].appendChild(card);

        const btnAgregar = card.querySelector(".btn-agregar");

        btnAgregar.addEventListener("click", function () {
          const id = parseInt(this.dataset.id);
          agregarAlCarritoConAnimacion(id, this);
        });

        const prev = card.querySelector(".btn-img-prev");

        if (prev) {
          prev.addEventListener("click", () => cambiarImagen(producto.id, -1));
        }

        const next = card.querySelector(".btn-img-next");

        if (next) {
          next.addEventListener("click", () => cambiarImagen(producto.id, 1));
        }

      }

    });

  } catch (error) {

    console.error("Error cargando productos:", error);
    notificar("No se pudieron cargar los productos", "error");

  }

});


window.agregarAlCarritoConAnimacion = function(id, boton) {

  const producto = window.productosGlobal.find(p => p.id === id);

  if(!producto){
    notificar("No se encontró el producto seleccionado","error");
    return;
  }

  const agregado = Carrito.agregar({

    id: producto.id,
    producto: producto.nombre,
    imagen: producto.imagenes[0],
    presentacion: producto.presentacion,
    categoria: producto.categoria,
    cantidad: 1,
    unidad: producto.permiteUnidad ? "Unidad" : "Docena",
    unidadesPorFardo: producto.unidadesPorFardo || 0,
    permiteUnidad: producto.permiteUnidad ?? true

  });

  if(!agregado) return;

  animarProductoAlCarrito(boton);

  boton.textContent = "Agregado ✓";
  boton.classList.remove("bg-gray-900");
  boton.classList.add("bg-green-700");

  setTimeout(() => {

    boton.textContent = "Agregar al presupuesto";
    boton.classList.remove("bg-green-700");
    boton.classList.add("bg-gray-900");

  },1500);

};


window.cambiarImagen = function(id, direccion) {

  const producto = window.productosGlobal.find(p => p.id === id);

  if(!producto){
    notificar("No se encontró el producto seleccionado", "error");
    return;
  }

  if (!window.indiceImagenes[id]) {
    window.indiceImagenes[id] = 0;
  }

  window.indiceImagenes[id] += direccion;

  if (window.indiceImagenes[id] < 0) {
    window.indiceImagenes[id] = producto.imagenes.length - 1;
  }

  if (window.indiceImagenes[id] >= producto.imagenes.length) {
    window.indiceImagenes[id] = 0;
  }

  const img = document.getElementById(`img-${id}`);

  if (!img) return;

  img.classList.add("opacity-0");

  setTimeout(() => {
    img.src = producto.imagenes[window.indiceImagenes[id]];
    img.classList.remove("opacity-0");
  }, 180);

};
function animarProductoAlCarrito(boton){

  const card = boton.closest(".group");
  const img = card.querySelector("img");
  const carrito = document.querySelector("#contador-carrito");

  if(!img || !carrito) return;

  const imgRect = img.getBoundingClientRect();
  const cartRect = carrito.getBoundingClientRect();

  const clon = img.cloneNode(true);

  clon.style.position = "fixed";
  clon.style.top = imgRect.top + "px";
  clon.style.left = imgRect.left + "px";
  clon.style.width = imgRect.width + "px";
  clon.style.height = imgRect.height + "px";
  clon.style.transition = "all 0.7s ease-in-out";
  clon.style.zIndex = "9999";
  clon.style.borderRadius = "12px";
  clon.style.pointerEvents = "none";

  document.body.appendChild(clon);

  setTimeout(()=>{

    clon.style.top = cartRect.top + "px";
    clon.style.left = cartRect.left + "px";
    clon.style.width = "20px";
    clon.style.height = "20px";
    clon.style.opacity = "0.3";

  },10);

  setTimeout(()=>clon.remove(),700);

}

document.addEventListener("visibilitychange", () => {

  if (!document.hidden) {
    if (typeof actualizarContador === "function") {
      actualizarContador();
    }
  }

});