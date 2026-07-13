const STORAGE_KEY = "carrito";

function leerCarritoSeguro() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw || raw === "undefined") return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.warn("Carrito corrupto, reiniciando");
    localStorage.removeItem(STORAGE_KEY);
    return [];
  }
}

function guardarCarritoSeguro(items) {
  if (!Array.isArray(items) || items.length === 0) {
    localStorage.removeItem(STORAGE_KEY);
  } else {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }
  if (typeof actualizarContador === "function") {
    actualizarContador();
  }
}

function normalizarItemCarrito(item) {
  const copia = { ...item };
  copia.cantidad = parseInt(copia.cantidad) || 1;
  copia.unidadesPorFardo = parseInt(copia.unidadesPorFardo) || 0;

  if (copia.permiteUnidad === undefined) {
    copia.permiteUnidad = true;
  }

  if (!copia.permiteUnidad && copia.unidad === "Unidad") {
    copia.unidad = "Docena";
  }

  if (!copia.unidad) {
    copia.unidad = copia.permiteUnidad ? "Unidad" : "Docena";
  }

  return copia;
}

function calcularUnidadesItem(item) {
  const i = normalizarItemCarrito(item);
  if (i.unidad === "Unidad") return i.cantidad;
  if (i.unidad === "Docena") return i.cantidad * 12;
  if (i.unidad === "Fardo") return i.cantidad * i.unidadesPorFardo;
  return 0;
}

const Carrito = {
  obtener() {
    return leerCarritoSeguro().map(normalizarItemCarrito);
  },

  guardar(items) {
    guardarCarritoSeguro(items.map(normalizarItemCarrito));
  },

  agregar(item) {
    const items = this.obtener();
    const existente = items.find((i) => i.id === item.id);

    if (existente) {
      if (typeof notificar === "function") {
        notificar(
          "Este producto ya está en el presupuesto. Puede modificar la cantidad desde el carrito.",
          "warning"
        );
      }
      return false;
    }

    const nuevo = normalizarItemCarrito(item);
    items.push(nuevo);
    this.guardar(items);

    if (typeof notificar === "function") {
      notificar(`${nuevo.producto} agregado al presupuesto`, "success");
    }

    return true;
  },

  eliminar(indexOrId) {
    const items = this.obtener();
    let nuevos;

    if (typeof indexOrId === "number" || /^[0-9]+$/.test(indexOrId)) {
      const idx = parseInt(indexOrId);
      nuevos = items.filter((_, i) => i !== idx);
    } else {
      nuevos = items.filter((i) => String(i.id) !== String(indexOrId));
    }

    this.guardar(nuevos);
  },

  actualizarCantidad(indexOrId, cantidad) {
    const items = this.obtener();
    const nuevaCantidad = Math.max(1, parseInt(cantidad) || 1);

    if (typeof indexOrId === "number" || /^[0-9]+$/.test(indexOrId)) {
      const idx = parseInt(indexOrId);
      if (!items[idx]) return;
      items[idx].cantidad = nuevaCantidad;
    } else {
      const item = items.find((i) => String(i.id) === String(indexOrId));
      if (!item) return;
      item.cantidad = nuevaCantidad;
    }

    this.guardar(items);
  },

  vaciar() {
    this.guardar([]);
  },

  totalProductos() {
    return this.obtener().length;
  },

  totalUnidades() {
    return this.obtener().reduce(
      (acc, item) => acc + calcularUnidadesItem(item),
      0
    );
  },
};

function actualizarContador() {
  const span = document.getElementById("numero-carrito");
  if (!span) return;
  const total = Carrito.totalProductos();
  span.textContent = total.toString();
}

document.addEventListener("DOMContentLoaded", actualizarContador);

window.Carrito = Carrito;
window.actualizarContador = actualizarContador;

function obtenerCarrito(){

  const data = localStorage.getItem("carrito");

  if(!data || data === "undefined"){
    return [];
  }

  try{
    return JSON.parse(data);
  }catch(e){
    console.warn("Carrito corrupto, reiniciando");
    localStorage.removeItem("carrito");
    return [];
  }

}

function guardarCarrito(carrito){

  if(!carrito || carrito.length === 0){
    localStorage.removeItem("carrito");
  }else{
    localStorage.setItem("carrito", JSON.stringify(carrito));
  }

  actualizarContador();

}

window.agregarAlCarrito = function(id){

  if(!window.productosGlobal){
    console.error("productosGlobal no está disponible todavía");
    return;
  }

  let carrito = obtenerCarrito();

  const producto = window.productosGlobal.find(p => p.id === id);

  if(!producto) return;

  const yaExiste = carrito.find(item => item.id === id);

  if(yaExiste){

    notificar(
      "Este producto ya está en el presupuesto. Puede modificar la cantidad desde el carrito.",
      "warning"
    );

    return false;

  }

  carrito.push({

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

  guardarCarrito(carrito);

  actualizarContador();

  notificar(producto.nombre + " agregado al presupuesto", "success");

  return true;

};

function actualizarContador(){

  const carrito = obtenerCarrito();

  const contador = document.getElementById("numero-carrito");

  if(!contador) return;

  const totalProductos = carrito.length;

  contador.textContent = `🛒 ${totalProductos}`;

}
document.addEventListener("DOMContentLoaded", actualizarContador);