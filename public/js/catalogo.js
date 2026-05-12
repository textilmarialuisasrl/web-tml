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
    
    // Configuración Modal
    let productoModalActual = null;
    let indiceImagenModal = 0;
    
    const modal = document.getElementById("modal-producto");
    const modalImg = document.getElementById("modal-img");
    const modalSkeleton = document.getElementById("modal-skeleton");
    const modalPrev = document.getElementById("modal-prev");
    const modalNext = document.getElementById("modal-next");
    const btnCerrarModal = document.getElementById("modal-close");
    const btnAgregarModal = document.getElementById("modal-agregar");
    const modalUnidadSelector = document.getElementById("modal-unidad-selector");
    const modalThumbTrack = document.getElementById("modal-thumb-track");

    // Función de estabilización de imágenes
    const setupImage = (img) => {
      const skeleton = img.previousElementSibling;
      
      const finalize = () => {
        img.classList.remove("opacity-0");
        img.classList.add("opacity-100");
        if (skeleton && skeleton.classList.contains("tml-skeleton")) {
          skeleton.style.opacity = "0";
          setTimeout(() => skeleton.style.display = "none", 500);
        }
      };

      if (img.complete) {
        finalize();
      } else {
        img.addEventListener("load", finalize);
        img.addEventListener("error", () => {
          img.src = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="; // Transparente fallback
          finalize();
        });
      }
    };

    const observer = new IntersectionObserver((entries, obs) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.remove("opacity-0", "translate-y-6");
          entry.target.classList.add("opacity-100", "translate-y-0");
          obs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.05, rootMargin: "0px 0px 100px 0px" });

    productos.forEach((producto) => {

      const esMasVendido = [
        "Trapo Mediano",
        "Rejilla Doble Pesada",
        "Alfombrita Estampada",
        "Franela"
      ].includes(producto.nombre);

      const esOferta = producto.categoria === "Ofertas";

      const card = document.createElement("div");
      card.className = "tml-card opacity-0 translate-y-6";
      if (esOferta) card.style.borderColor = "var(--tml-primary)";

      observer.observe(card);

      let badge = "";
      if (esOferta) {
        badge = `<span class="absolute top-3 left-3 tml-badge tml-badge-primary z-10">Oferta</span>`;
      } else if (esMasVendido) {
        badge = `<span class="absolute top-3 left-3 tml-badge z-10">Más Vendido</span>`;
      }

      card.innerHTML = `
        <div class="cursor-pointer flex flex-col flex-1" onclick="abrirModal(${producto.id})">
          <div class="tml-card-img-container">
            ${badge}
            <div class="absolute inset-0 tml-skeleton skeleton-img transition-opacity duration-500"></div>
            <img
              src="${producto.imagenes[0]}"
              alt="${producto.nombre}"
              loading="lazy"
              class="w-full h-full object-cover opacity-0 transition-opacity duration-500 ease-in-out card-img"
            >
          </div>

          ${producto.imagenes.length > 1 ? `
            <div class="tml-card-nav" data-current-idx="0">
              <button class="tml-card-arrow prev" title="Anterior">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M15 18l-6-6 6-6"/></svg>
              </button>
              <div class="tml-card-dots">
                ${producto.imagenes.slice(0, 5).map((_, i) => `
                  <span class="tml-dot ${i === 0 ? 'active' : ''}" data-idx="${i}"></span>
                `).join('')}
              </div>
              <button class="tml-card-arrow next" title="Siguiente">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 5l6 7-6 7"/></svg>
              </button>
            </div>
          ` : '<div class="tml-card-nav placeholder"></div>'}
          
          <div class="tml-card-content">
            <h3 class="tml-card-title">${producto.nombre}</h3>
            <p class="tml-card-info">${producto.medida}</p>
          </div>
        </div>
        
        <div class="tml-card-footer">
          <span class="text-[10px] font-bold text-gray-400 uppercase tracking-tight">${producto.presentacion}</span>
          <button
            class="tml-btn-quick-add btn-agregar-rapido"
            data-id="${producto.id}"
            title="Agregar rápido">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg>
          </button>
        </div>
      `;

      if (contenedores[producto.categoria]) {
        contenedores[producto.categoria].appendChild(card);
        
        // Setup de imagen para esta card
        const img = card.querySelector(".card-img");
        if (img) setupImage(img);

        // Listeners para Navegación de Imágenes en Card
        if (producto.imagenes.length > 1) {
          const nav = card.querySelector(".tml-card-nav");
          const dots = card.querySelectorAll(".tml-dot");
          const arrowPrev = card.querySelector(".tml-card-arrow.prev");
          const arrowNext = card.querySelector(".tml-card-arrow.next");
          
          const updateIdx = (newIdx) => {
            nav.dataset.currentIdx = newIdx;
            cambiarImagenCard(card, producto, newIdx);
          };

          dots.forEach(dot => {
            dot.addEventListener("click", (e) => {
              e.stopPropagation();
              updateIdx(parseInt(dot.dataset.idx));
            });
          });

          arrowPrev.addEventListener("click", (e) => {
            e.stopPropagation();
            const current = parseInt(nav.dataset.currentIdx);
            const total = producto.imagenes.length;
            updateIdx((current - 1 + total) % total);
          });

          arrowNext.addEventListener("click", (e) => {
            e.stopPropagation();
            const current = parseInt(nav.dataset.currentIdx);
            const total = producto.imagenes.length;
            updateIdx((current + 1) % total);
          });
        }

        const btnAgregar = card.querySelector(".btn-agregar-rapido");
        btnAgregar.addEventListener("click", function (e) {
          e.stopPropagation();
          const id = parseInt(this.dataset.id);
          agregarAlCarritoConAnimacion(id, this);
        });
      }

    });

    function cambiarImagenCard(card, producto, idx) {
      const img = card.querySelector(".card-img");
      const dots = card.querySelectorAll(".tml-dot");
      
      dots.forEach((d, i) => {
        if (i === idx) d.classList.add("active");
        else d.classList.remove("active");
      });

      const url = producto.imagenes[idx];
      img.style.opacity = "0.3";
      
      const imgCarga = new Image();
      imgCarga.onload = () => {
        img.src = url;
        img.style.opacity = "1";
        
        // Preload next
        const nextIdx = (idx + 1) % producto.imagenes.length;
        const preload = new Image();
        preload.src = producto.imagenes[nextIdx];
      };
      imgCarga.src = url;
    }

    // LÓGICA DEL MODAL
    
    window.abrirModal = function(id) {
      const producto = window.productosGlobal.find(p => p.id === id);
      if (!producto) return;
      
      productoModalActual = producto;
      indiceImagenModal = 0;
      
      // Llenar datos
      document.getElementById("modal-nombre").textContent = producto.nombre;
      document.getElementById("modal-desc").innerHTML = producto.descripcion.replace(/\n/g, '<br>');
      document.getElementById("modal-medida").textContent = producto.medida;
      document.getElementById("modal-presentacion").textContent = producto.presentacion;
      
      const badgeContainer = document.getElementById("modal-badge-container");
      badgeContainer.innerHTML = "";
      if (producto.categoria === "Ofertas") {
        badgeContainer.innerHTML = `<span class="tml-badge tml-badge-primary">Oferta Especial</span>`;
      } else {
        badgeContainer.innerHTML = `<span class="tml-badge">Línea ${producto.categoria}</span>`;
      }
      
      // Selector de Unidad
      modalUnidadSelector.innerHTML = "";
      let unidadesHTML = "";
      const radioClass = "peer sr-only";
      const labelClass = "flex-1 cursor-pointer group";
      const divClass = "border border-gray-100 rounded-xl px-4 py-3 text-center peer-checked:border-emerald-600 peer-checked:bg-emerald-50 peer-checked:text-emerald-700 transition-all duration-300 font-bold text-xs text-gray-500 group-hover:border-gray-300 group-hover:bg-gray-50";

      if (producto.permiteUnidad || producto.permiteUnidad === undefined) {
        unidadesHTML += `<label class="${labelClass}">
          <input type="radio" name="modal-unidad" value="Unidad" class="${radioClass}" checked>
          <div class="${divClass}">Unidad</div>
        </label>`;
      }
      unidadesHTML += `<label class="${labelClass}">
        <input type="radio" name="modal-unidad" value="Docena" class="${radioClass}" ${!producto.permiteUnidad ? 'checked' : ''}>
        <div class="${divClass}">Docena</div>
      </label>`;
      
      if (producto.unidadesPorFardo) {
        unidadesHTML += `<label class="${labelClass}">
          <input type="radio" name="modal-unidad" value="Fardo" class="${radioClass}">
          <div class="${divClass}">Fardo</div>
        </label>`;
      }
      modalUnidadSelector.innerHTML = unidadesHTML;
      
      // Setup Gallery
      modalThumbTrack.innerHTML = "";
      if (producto.imagenes.length > 1) {
        producto.imagenes.forEach((img, idx) => {
          const thumb = document.createElement("img");
          thumb.src = img;
          thumb.className = `tml-modal-thumb ${idx === 0 ? 'active' : ''}`;
          thumb.onclick = () => cambiarImagenModal(idx);
          modalThumbTrack.appendChild(thumb);
        });
        modalPrev.classList.remove("hidden");
        modalNext.classList.remove("hidden");
      } else {
        modalPrev.classList.add("hidden");
        modalNext.classList.add("hidden");
      }
      
      actualizarImagenModal();
      
      // Mostrar Modal
      document.body.style.overflow = "hidden";
      modal.classList.remove("hidden");
      void modal.offsetWidth;
      modal.classList.add("active");
    };
    
    function cerrarModal() {
      modal.classList.remove("active");
      document.body.style.overflow = "";
      setTimeout(() => {
        if (!modal.classList.contains("active")) {
          modal.classList.add("hidden");
          productoModalActual = null;
        }
      }, 400);
    }
    
    btnCerrarModal.addEventListener("click", cerrarModal);
    modal.addEventListener("mousedown", (e) => {
      if (e.target === modal) cerrarModal();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !modal.classList.contains("hidden")) {
        cerrarModal();
      }
    });
    
    function cambiarImagenModal(idx) {
      indiceImagenModal = idx;
      actualizarImagenModal();
      
      // Actualizar thumbs
      const thumbs = modalThumbTrack.querySelectorAll(".tml-modal-thumb");
      thumbs.forEach((t, i) => {
        if (i === idx) {
          t.classList.add("active");
          t.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        } else {
          t.classList.remove("active");
        }
      });
    }

    function actualizarImagenModal() {
      if (!productoModalActual) return;
      const url = productoModalActual.imagenes[indiceImagenModal];
      
      modalImg.style.opacity = 0;
      modalSkeleton.style.opacity = 1;
      modalSkeleton.style.display = "block";
      
      const imgCarga = new Image();
      imgCarga.onload = () => {
        modalImg.src = url;
        modalImg.style.opacity = 1;
        modalSkeleton.style.opacity = 0;
        setTimeout(() => modalSkeleton.style.display = "none", 500);
      };
      imgCarga.onerror = () => {
        modalImg.src = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
        modalImg.style.opacity = 1;
        modalSkeleton.style.opacity = 0;
      };
      imgCarga.src = url;
    }
    
    modalPrev.addEventListener("click", () => {
      if (!productoModalActual) return;
      const total = productoModalActual.imagenes.length;
      cambiarImagenModal((indiceImagenModal - 1 + total) % total);
    });
    
    modalNext.addEventListener("click", () => {
      if (!productoModalActual) return;
      const total = productoModalActual.imagenes.length;
      cambiarImagenModal((indiceImagenModal + 1) % total);
    });
    
    btnAgregarModal.addEventListener("click", function() {
      if (!productoModalActual) return;
      
      const inputSeleccionado = document.querySelector('input[name="modal-unidad"]:checked');
      const unidad = inputSeleccionado ? inputSeleccionado.value : "Unidad";
      
      const itemParaCarrito = {
        id: productoModalActual.id,
        producto: productoModalActual.nombre,
        imagen: productoModalActual.imagenes[0],
        presentacion: productoModalActual.presentacion,
        categoria: productoModalActual.categoria,
        cantidad: 1,
        unidad: unidad,
        unidadesPorFardo: productoModalActual.unidadesPorFardo || 0,
        permiteUnidad: productoModalActual.permiteUnidad ?? true
      };
      
      const agregado = window.Carrito ? Carrito.agregar(itemParaCarrito) : false;
      
      if (agregado) {
        const originalContent = this.innerHTML;
        this.innerHTML = `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg> Agregado`;
        this.style.background = "#0f172a";
        
        setTimeout(() => {
          this.innerHTML = originalContent;
          this.style.background = "";
          cerrarModal();
        }, 800);
      }
    });

  } catch (error) {
    console.error("Error cargando productos:", error);
  }

});

window.agregarAlCarritoConAnimacion = function(id, boton) {
  const producto = window.productosGlobal.find(p => p.id === id);
  if(!producto) return;

  const itemParaCarrito = {
    id: producto.id,
    producto: producto.nombre,
    imagen: producto.imagenes[0],
    presentacion: producto.presentacion,
    categoria: producto.categoria,
    cantidad: 1,
    unidad: producto.permiteUnidad !== false ? "Unidad" : "Docena",
    unidadesPorFardo: producto.unidadesPorFardo || 0,
    permiteUnidad: producto.permiteUnidad ?? true
  };

  const agregado = window.Carrito ? Carrito.agregar(itemParaCarrito) : false;
  if(!agregado) return;

  animarProductoAlCarrito(boton);

  const originalContent = boton.innerHTML;
  boton.innerHTML = `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>`;
  boton.style.background = "var(--tml-primary)";
  boton.style.color = "white";
  
  setTimeout(() => {
    boton.innerHTML = originalContent;
    boton.style.background = "";
    boton.style.color = "";
  }, 1000);
};

function animarProductoAlCarrito(boton){
  const card = boton.closest(".tml-card");
  const img = card.querySelector(".card-img");
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
  clon.style.transition = "all 0.6s cubic-bezier(0.16, 1, 0.3, 1)";
  clon.style.zIndex = "9999";
  clon.style.borderRadius = "50%";
  clon.style.pointerEvents = "none";
  clon.style.objectFit = "cover";

  document.body.appendChild(clon);

  setTimeout(()=>{
    clon.style.top = cartRect.top + "px";
    clon.style.left = cartRect.left + "px";
    clon.style.width = "20px";
    clon.style.height = "20px";
    clon.style.opacity = "0";
    clon.style.transform = "scale(0.1)";
  },10);

  setTimeout(()=>clon.remove(),600);
}

document.addEventListener("visibilitychange", () => {
  if (!document.hidden && typeof actualizarContador === "function") {
    actualizarContador();
  }
});