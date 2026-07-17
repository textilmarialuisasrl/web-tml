import { prisma } from "../db/prisma";
import { env } from "../config/env";
import { TipoDeposito, RolUsuario, TipoProducto, TipoTrabajoTaller, PresentacionProducto, CalidadProducto, CanalStock } from "../../generated/prisma/client";
import bcrypt from "bcrypt";

const FAMILIAS = [
  { id: "FAM001", codigo: "FAM001", nombre: "Trapos" },
  { id: "FAM002", codigo: "FAM002", nombre: "Rejillas" },
  { id: "FAM003", codigo: "FAM003", nombre: "Franelas" },
  { id: "FAM004", codigo: "FAM004", nombre: "Repasadores" },
  { id: "FAM005", codigo: "FAM005", nombre: "Paños" },
  { id: "FAM006", codigo: "FAM006", nombre: "Alfombras" },
  { id: "FAM007", codigo: "FAM007", nombre: "Insumos" }
];

const DEPOSITOS = [
  { id: "DEP001", nombre: "Zona de Corte", tipo: TipoDeposito.PRODUCCION, descripcion: "Zona de corte de bobinas y fraccionamiento" },
  { id: "DEP002", nombre: "Galpón Central", tipo: TipoDeposito.STOCK, descripcion: "Stock principal de productos embolsados" },
  { id: "DEP003", nombre: "Casa", tipo: TipoDeposito.STOCK, descripcion: "Stock comercial + insumos" },
  { id: "DEP004", nombre: "Contenedor", tipo: TipoDeposito.STOCK, descripcion: "Almacenamiento de excedentes" },
  { id: "DEP005", nombre: "Galpón Secundario", tipo: TipoDeposito.STOCK, descripcion: "Mercadería comprada sin terminar" },
  { id: "DEP006", nombre: "Depósito Eve", tipo: TipoDeposito.TALLER, descripcion: "Depósito del taller Evelina" },
  { id: "DEP007", nombre: "Depósito Vanesa", tipo: TipoDeposito.TALLER, descripcion: "Depósito del taller Vanesa" }
];

const TALLERES = [
  { id: "TAL001", nombre: "Evelina", observaciones: "Taller externo de costura", depositoAsociadoId: "DEP006" },
  { id: "TAL002", nombre: "Vanesa", observaciones: "Taller externo de confección", depositoAsociadoId: "DEP007" },
  { id: "TAL003", nombre: "Mary", observaciones: "Taller externo especialista", depositoAsociadoId: null },
  { id: "TAL004", nombre: "Fernanda", observaciones: "Taller externo prendas", depositoAsociadoId: null },
  { id: "TAL005", nombre: "Silvia", observaciones: "Taller externo estampas", depositoAsociadoId: null },
  { id: "TAL006", nombre: "Taller Propio", observaciones: "Línea de producción interna", depositoAsociadoId: null }
];

const TARIFAS = [
  { tallerId: "TAL001", tipoTrabajo: TipoTrabajoTaller.TRAPOS, precioFardo: 3100 },
  { tallerId: "TAL002", tipoTrabajo: TipoTrabajoTaller.TRAPOS, precioFardo: 3100 },
  { tallerId: "TAL002", tipoTrabajo: TipoTrabajoTaller.REJILLAS, precioFardo: 3500 },
  { tallerId: "TAL003", tipoTrabajo: TipoTrabajoTaller.TRAPOS, precioFardo: 3000 },
  { tallerId: "TAL004", tipoTrabajo: TipoTrabajoTaller.TRAPOS, precioFardo: 3000 },
  { tallerId: "TAL005", tipoTrabajo: TipoTrabajoTaller.TRAPOS, precioFardo: 2700 }
];

const PRODUCTOS_BASE = [
  { codigo: "PB001", nombre: "Cortada Trapo Blanco 80x60", familiaId: "FAM001", medida: "80x60", color: "Blanco", estadoActual: "Cortado", procesoSiguiente: "Taller Trapos", origen: "Producto final" },
  { codigo: "PB002", nombre: "Cortada Trapo Blanco 70x60", familiaId: "FAM001", medida: "70x60", color: "Blanco", estadoActual: "Cortado", procesoSiguiente: "Taller Trapos", origen: "Producto final" },
  { codigo: "PB003", nombre: "Cortada Trapo Gris 70x60", familiaId: "FAM001", medida: "70x60", color: "Gris", estadoActual: "Cortado", procesoSiguiente: "Taller Trapos", origen: "Producto final" },
  { codigo: "PB004", nombre: "Cortada Trapo Rayado Tradicional 70x60", familiaId: "FAM001", medida: "70x60", color: "Gris y Blanco", estadoActual: "Cortado", procesoSiguiente: "Taller Trapos", origen: "Producto final" },
  { codigo: "PB005", nombre: "Cortada Trapo Nido 70x50", familiaId: "FAM001", medida: "70x50", color: "Blanco", estadoActual: "Cortado", procesoSiguiente: "Taller Trapos", origen: "Producto final" },
  { codigo: "PB006", nombre: "Cortada Trapo Blanco 60x60", familiaId: "FAM001", medida: "60x60", color: "Blanco", estadoActual: "Cortado", procesoSiguiente: "Taller Trapos", origen: "Producto final" },
  { codigo: "PB007", nombre: "Cortada Trapo Gris 60x60", familiaId: "FAM001", medida: "60x60", color: "Gris", estadoActual: "Cortado", procesoSiguiente: "Taller Trapos", origen: "Producto final" },
  { codigo: "PB008", nombre: "Cortada Trapo Color 60x60", familiaId: "FAM001", medida: "60x60", color: "Color", estadoActual: "Cortado", procesoSiguiente: "Taller Trapos", origen: "Producto final" },
  { codigo: "PB009", nombre: "Cortada Trapo Blanco 50x60", familiaId: "FAM001", medida: "50x60", color: "Blanco", estadoActual: "Cortado", procesoSiguiente: "Taller Trapos", origen: "Producto final" },
  { codigo: "PB010", nombre: "Cortada Trapo Gris 50x60", familiaId: "FAM001", medida: "50x60", color: "Gris", estadoActual: "Cortado", procesoSiguiente: "Taller Trapos", origen: "Producto final" },
  { codigo: "PB011", nombre: "Cortada Trapo Rayado Tradicional 50x60", familiaId: "FAM001", medida: "50x60", color: "Gris y Blanco", estadoActual: "Cortado", procesoSiguiente: "Taller Trapos", origen: "Producto final" },
  { codigo: "PB012", nombre: "Cortada Trapo Rayado Color 50x60", familiaId: "FAM001", medida: "50x60", color: "Color", estadoActual: "Cortado", procesoSiguiente: "Taller Trapos", origen: "Producto final" },
  { codigo: "PB013", nombre: "Cortada Trapo Nido 60x50", familiaId: "FAM001", medida: "60x50", color: "Blanco", estadoActual: "Cortado", procesoSiguiente: "Taller Trapos", origen: "Producto final" },
  { codigo: "PB014", nombre: "Cortada Trapo Dura Más 50x60 - B", familiaId: "FAM001", medida: "50x60", color: "Blanco", estadoActual: "Cortado", procesoSiguiente: "Taller Trapos", origen: "Producto final" },
  { codigo: "PB015", nombre: "Cortada Trapo Dura Más 50x60 - G", familiaId: "FAM001", medida: "50x60", color: "Gris", estadoActual: "Cortado", procesoSiguiente: "Taller Trapos", origen: "Producto final" },
  { codigo: "PB016", nombre: "Cortada Trapo Dura Más Rayado Tradicional 50x60", familiaId: "FAM001", medida: "50x60", color: "Gris y Blanco", estadoActual: "Cortado", procesoSiguiente: "Taller Trapos", origen: "Producto final" },
  { codigo: "PB017", nombre: "Cortada Trapo Dura Más Rayado Color 50x60", familiaId: "FAM001", medida: "50x60", color: "Color", estadoActual: "Cortado", procesoSiguiente: "Taller Trapos", origen: "Producto final" },
  { codigo: "PB018", nombre: "Cortada Trapo Blanco 45x60", familiaId: "FAM001", medida: "45x60", color: "Blanco", estadoActual: "Cortado", procesoSiguiente: "Taller Trapos", origen: "Producto final" },
  { codigo: "PB019", nombre: "Cortada Trapo Gris 45x60", familiaId: "FAM001", medida: "45x60", color: "Gris", estadoActual: "Cortado", procesoSiguiente: "Taller Trapos", origen: "Producto final" },
  { codigo: "PB020", nombre: "Cortada Trapo Rayado Tradicional 45x60", familiaId: "FAM001", medida: "45x60", color: "Gris y Blanco", estadoActual: "Cortado", procesoSiguiente: "Taller Trapos", origen: "Producto final" },
  { codigo: "PB021", nombre: "Cortada Trapo Color 45x60", familiaId: "FAM001", medida: "45x60", color: "Color", estadoActual: "Cortado", procesoSiguiente: "Taller Trapos", origen: "Producto final" },
  { codigo: "PB022", nombre: "Cortada Trapo Nido 45x50", familiaId: "FAM001", medida: "45x50", color: "Blanco", estadoActual: "Cortado", procesoSiguiente: "Taller Trapos", origen: "Producto final" },
  { codigo: "PB023", nombre: "Rejilla Triple Rollo", familiaId: "FAM002", medida: "-", color: "Crudo", estadoActual: "En Rollo", procesoSiguiente: "Taller Rejillas", origen: "Compra", unidadMedida: "Kg" },
  { codigo: "PB024", nombre: "Rejilla Doble Pesada Rollo", familiaId: "FAM002", medida: "-", color: "Crudo", estadoActual: "En Rollo", procesoSiguiente: "Taller Rejillas", origen: "Compra", unidadMedida: "Kg" },
  { codigo: "PB025", nombre: "Rejilla Doble Liviana Rollo", familiaId: "FAM002", medida: "-", color: "Crudo", estadoActual: "En Rollo", procesoSiguiente: "Taller Rejillas", origen: "Compra", unidadMedida: "Kg" },
  { codigo: "PB026", nombre: "Rejilla Profesional Rollo", familiaId: "FAM002", medida: "-", color: "Crudo", estadoActual: "En Rollo", procesoSiguiente: "Taller Rejillas", origen: "Compra", unidadMedida: "Kg" },
  { codigo: "PB027", nombre: "Rejilla Americana S/Etiqueta", familiaId: "FAM002", medida: "38x40", color: "Crudo", estadoActual: "Sin Etiqueta", procesoSiguiente: "Etiquetado", origen: "Compra" },
  { codigo: "PB028", nombre: "Rejilla Pabilo S/Etiqueta", familiaId: "FAM002", medida: "38x40", color: "Crudo", estadoActual: "Sin Etiqueta", procesoSiguiente: "Etiquetado", origen: "Compra" },
  { codigo: "PB029", nombre: "Rejilla Tubular S/Etiqueta", familiaId: "FAM002", medida: "40x45", color: "Crudo", estadoActual: "Sin Etiqueta", procesoSiguiente: "Etiquetado", origen: "Compra" },
  { codigo: "PB030", nombre: "Franela 45x60 S/Etiqueta", familiaId: "FAM003", medida: "45x60", color: "Naranja", estadoActual: "Sin Etiqueta", procesoSiguiente: "Etiquetado", origen: "Compra" },
  { codigo: "PB031", nombre: "Franela 50x50 S/Etiqueta", familiaId: "FAM003", medida: "50x50", color: "Naranja", estadoActual: "Sin Etiqueta", procesoSiguiente: "Etiquetado", origen: "Compra" },
  { codigo: "PB032", nombre: "Repasador Sarga S/Etiqueta", familiaId: "FAM004", medida: "40x60", color: "Varios", estadoActual: "Sin Etiqueta", procesoSiguiente: "Etiquetado", origen: "Compra" },
  { codigo: "PB033", nombre: "Repasador Toalla S/Etiqueta", familiaId: "FAM004", medida: "42x60", color: "Varios", estadoActual: "Recepcionado", procesoSiguiente: "Etiquetado", origen: "Compra" },
  { codigo: "PB034", nombre: "Paño Absorvente S/Etiqueta", familiaId: "FAM005", medida: "38x40", color: "Varios", estadoActual: "Sin Etiqueta", procesoSiguiente: "Etiquetado", origen: "Compra" }
];

const PRODUCTOS_COMERCIALES = [
  { codigo: "PF001", nombre: "TRAPO P/PISO SURTIDO TML 45x60", familiaId: "FAM001", marca: "TML", medida: "45x60", unidadesPorFardo: 60, vendeUnidad: false, vendeDocena: true, vendeFardo: true, requiereTaller: true, requiereEtiqueta: false, tipoTrabajo: TipoTrabajoTaller.TRAPOS },
  { codigo: "PF002", nombre: "TRAPO P/PISO BLANCO MILLENIAN 45x60", familiaId: "FAM001", marca: "MILLENIAN", medida: "45x60", unidadesPorFardo: 60, vendeUnidad: false, vendeDocena: false, vendeFardo: true, requiereTaller: true, requiereEtiqueta: false, tipoTrabajo: TipoTrabajoTaller.TRAPOS },
  { codigo: "PF003", nombre: "TRAPO P/PISO GRIS MILLENIAN 45x60", familiaId: "FAM001", marca: "MILLENIAN", medida: "45x60", unidadesPorFardo: 60, vendeUnidad: false, vendeDocena: false, vendeFardo: true, requiereTaller: true, requiereEtiqueta: false, tipoTrabajo: TipoTrabajoTaller.TRAPOS },
  { codigo: "PF004", nombre: "TRAPO P/PISO RAYADO MILLENIAN 45x60", familiaId: "FAM001", marca: "MILLENIAN", medida: "45x60", unidadesPorFardo: 60, vendeUnidad: false, vendeDocena: false, vendeFardo: true, requiereTaller: true, requiereEtiqueta: false, tipoTrabajo: TipoTrabajoTaller.TRAPOS },
  { codigo: "PF005", nombre: "TRAPO P/PISO NIDO MILLENIAN 45x50", familiaId: "FAM001", marca: "MILLENIAN", medida: "45x50", unidadesPorFardo: 60, vendeUnidad: false, vendeDocena: false, vendeFardo: true, requiereTaller: true, requiereEtiqueta: false, tipoTrabajo: TipoTrabajoTaller.TRAPOS },
  { codigo: "PF006", nombre: "TRAPO P/PISO BLANCO USO DIARIO 45x60", familiaId: "FAM001", marca: "USO DIARIO", medida: "45x60", unidadesPorFardo: 60, vendeUnidad: false, vendeDocena: false, vendeFardo: true, requiereTaller: true, requiereEtiqueta: false, tipoTrabajo: TipoTrabajoTaller.TRAPOS },
  { codigo: "PF007", nombre: "TRAPO P/PISO GRIS USO DIARIO 45x60", familiaId: "FAM001", marca: "USO DIARIO", medida: "45x60", unidadesPorFardo: 60, vendeUnidad: false, vendeDocena: false, vendeFardo: true, requiereTaller: true, requiereEtiqueta: false, tipoTrabajo: TipoTrabajoTaller.TRAPOS },
  { codigo: "PF008", nombre: "TRAPO P/PISO RAYADO USO DIARIO 45x60", familiaId: "FAM001", marca: "USO DIARIO", medida: "45x60", unidadesPorFardo: 60, vendeUnidad: false, vendeDocena: false, vendeFardo: true, requiereTaller: true, requiereEtiqueta: false, tipoTrabajo: TipoTrabajoTaller.TRAPOS },
  { codigo: "PF009", nombre: "TRAPO P/PISO NIDO USO DIARIO 45x50", familiaId: "FAM001", marca: "USO DIARIO", medida: "45x50", unidadesPorFardo: 60, vendeUnidad: false, vendeDocena: false, vendeFardo: true, requiereTaller: true, requiereEtiqueta: false, tipoTrabajo: TipoTrabajoTaller.TRAPOS },
  { codigo: "PF010", nombre: "TRAPO P/PISO BLANCO TML 50x60", familiaId: "FAM001", marca: "TML", medida: "50x60", unidadesPorFardo: 60, vendeUnidad: true, vendeDocena: true, vendeFardo: true, requiereTaller: true, requiereEtiqueta: false, tipoTrabajo: TipoTrabajoTaller.TRAPOS },
  { codigo: "PF011", nombre: "TRAPO P/PISO GRIS TML 50x60", familiaId: "FAM001", marca: "TML", medida: "50x60", unidadesPorFardo: 60, vendeUnidad: true, vendeDocena: true, vendeFardo: true, requiereTaller: true, requiereEtiqueta: false, tipoTrabajo: TipoTrabajoTaller.TRAPOS },
  { codigo: "PF012", nombre: "TRAPO P/PISO RAYADO TML 50x60", familiaId: "FAM001", marca: "TML", medida: "50x60", unidadesPorFardo: 60, vendeUnidad: true, vendeDocena: true, vendeFardo: true, requiereTaller: true, requiereEtiqueta: false, tipoTrabajo: TipoTrabajoTaller.TRAPOS },
  { codigo: "PF013", nombre: "TRAPO P/PISO RAYADO TML 50x60 xUNIDAD", familiaId: "FAM001", marca: "TML", medida: "50x60", unidadesPorFardo: 60, vendeUnidad: false, vendeDocena: false, vendeFardo: true, requiereTaller: true, requiereEtiqueta: false, tipoTrabajo: TipoTrabajoTaller.TRAPOS },
  { codigo: "PF014", nombre: "TRAPO P/PISO NIDO TML 60x50", familiaId: "FAM001", marca: "TML", medida: "60x50", unidadesPorFardo: 60, vendeUnidad: true, vendeDocena: true, vendeFardo: true, requiereTaller: true, requiereEtiqueta: false, tipoTrabajo: TipoTrabajoTaller.TRAPOS },
  { codigo: "PF015", nombre: "TRAPO P/PISO BLANCO DURA MÁS 50x60", familiaId: "FAM001", marca: "DURA MÁS", medida: "50x60", unidadesPorFardo: 60, vendeUnidad: true, vendeDocena: true, vendeFardo: true, requiereTaller: true, requiereEtiqueta: false, tipoTrabajo: TipoTrabajoTaller.TRAPOS },
  { codigo: "PF016", nombre: "TRAPO P/PISO GRIS DURA MÁS 50x60", familiaId: "FAM001", marca: "DURA MÁS", medida: "50x60", unidadesPorFardo: 60, vendeUnidad: true, vendeDocena: true, vendeFardo: true, requiereTaller: true, requiereEtiqueta: false, tipoTrabajo: TipoTrabajoTaller.TRAPOS },
  { codigo: "PF017", nombre: "TRAPO P/PISO RAYADO TURQUESA DURA MÁS 50x60", familiaId: "FAM001", marca: "DURA MÁS", medida: "50x60", unidadesPorFardo: 60, vendeUnidad: true, vendeDocena: true, vendeFardo: true, requiereTaller: true, requiereEtiqueta: false, tipoTrabajo: TipoTrabajoTaller.TRAPOS },
  { codigo: "PF018", nombre: "TRAPO P/PISO RAYADO GRIS DURA MÁS 50x60", familiaId: "FAM001", marca: "DURA MÁS", medida: "50x60", unidadesPorFardo: 60, vendeUnidad: true, vendeDocena: true, vendeFardo: true, requiereTaller: true, requiereEtiqueta: false, tipoTrabajo: TipoTrabajoTaller.TRAPOS },
  { codigo: "PF019", nombre: "TRAPO P/PISO BLANCO EMME 50x60", familiaId: "FAM001", marca: "EMME", medida: "50x60", unidadesPorFardo: 60, vendeUnidad: false, vendeDocena: false, vendeFardo: true, requiereTaller: true, requiereEtiqueta: false, tipoTrabajo: TipoTrabajoTaller.TRAPOS },
  { codigo: "PF020", nombre: "TRAPO P/PISO GRIS EMME 50x60", familiaId: "FAM001", marca: "EMME", medida: "50x60", unidadesPorFardo: 60, vendeUnidad: false, vendeDocena: false, vendeFardo: true, requiereTaller: true, requiereEtiqueta: false, tipoTrabajo: TipoTrabajoTaller.TRAPOS },
  { codigo: "PF021", nombre: "TRAPO P/PISO BLANCO FX 50x60", familiaId: "FAM001", marca: "FX", medida: "50x60", unidadesPorFardo: 60, vendeUnidad: false, vendeDocena: false, vendeFardo: true, requiereTaller: true, requiereEtiqueta: false, tipoTrabajo: TipoTrabajoTaller.TRAPOS },
  { codigo: "PF022", nombre: "TRAPO P/PISO GRIS FX 50x60", familiaId: "FAM001", marca: "FX", medida: "50x60", unidadesPorFardo: 60, vendeUnidad: false, vendeDocena: false, vendeFardo: true, requiereTaller: true, requiereEtiqueta: false, tipoTrabajo: TipoTrabajoTaller.TRAPOS },
  { codigo: "PF023", nombre: "TRAPO P/PISO RAYADO TRADICIONAL FX 50x60", familiaId: "FAM001", marca: "FX", medida: "50x60", unidadesPorFardo: 60, vendeUnidad: false, vendeDocena: false, vendeFardo: true, requiereTaller: true, requiereEtiqueta: false, tipoTrabajo: TipoTrabajoTaller.TRAPOS },
  { codigo: "PF024", nombre: "TRAPO P/PISO RAYADO COLOR FX 50x60", familiaId: "FAM001", marca: "FX", medida: "50x60", unidadesPorFardo: 60, vendeUnidad: false, vendeDocena: false, vendeFardo: true, requiereTaller: true, requiereEtiqueta: false, tipoTrabajo: TipoTrabajoTaller.TRAPOS },
  { codigo: "PF025", nombre: "TRAPO P/PISO NIDO FX 60x50", familiaId: "FAM001", marca: "FX", medida: "60x50", unidadesPorFardo: 60, vendeUnidad: false, vendeDocena: false, vendeFardo: true, requiereTaller: true, requiereEtiqueta: false, tipoTrabajo: TipoTrabajoTaller.TRAPOS },
  { codigo: "PF026", nombre: "TRAPO P/PISO BLANCO TML 60x60", familiaId: "FAM001", marca: "TML", medida: "60x60", unidadesPorFardo: 60, vendeUnidad: true, vendeDocena: true, vendeFardo: true, requiereTaller: true, requiereEtiqueta: false, tipoTrabajo: TipoTrabajoTaller.TRAPOS },
  { codigo: "PF027", nombre: "TRAPO P/PISO GRIS TML 60x60", familiaId: "FAM001", marca: "TML", medida: "60x60", unidadesPorFardo: 60, vendeUnidad: true, vendeDocena: true, vendeFardo: true, requiereTaller: true, requiereEtiqueta: false, tipoTrabajo: TipoTrabajoTaller.TRAPOS },
  { codigo: "PF028", nombre: "TRAPO P/PISO BLANCO TML 60x60 xUNIDAD", familiaId: "FAM001", marca: "TML", medida: "60x60", unidadesPorFardo: 60, vendeUnidad: false, vendeDocena: false, vendeFardo: true, requiereTaller: true, requiereEtiqueta: false, tipoTrabajo: TipoTrabajoTaller.TRAPOS },
  { codigo: "PF029", nombre: "TRAPO P/PISO SURTIDO TML 60x60", familiaId: "FAM001", marca: "TML", medida: "60x60", unidadesPorFardo: 60, vendeUnidad: false, vendeDocena: true, vendeFardo: true, requiereTaller: true, requiereEtiqueta: false, tipoTrabajo: TipoTrabajoTaller.TRAPOS },
  { codigo: "PF030", nombre: "TRAPO P/PISO BLANCO TML 70x60", familiaId: "FAM001", marca: "TML", medida: "70x60", unidadesPorFardo: 60, vendeUnidad: true, vendeDocena: true, vendeFardo: true, requiereTaller: true, requiereEtiqueta: false, tipoTrabajo: TipoTrabajoTaller.TRAPOS },
  { codigo: "PF031", nombre: "TRAPO P/PISO GRIS TML 70x60", familiaId: "FAM001", marca: "TML", medida: "70x60", unidadesPorFardo: 60, vendeUnidad: true, vendeDocena: true, vendeFardo: true, requiereTaller: true, requiereEtiqueta: false, tipoTrabajo: TipoTrabajoTaller.TRAPOS },
  { codigo: "PF032", nombre: "TRAPO P/PISO BLANCO TML 70x60 xUNIDAD", familiaId: "FAM001", marca: "TML", medida: "70x60", unidadesPorFardo: 60, vendeUnidad: false, vendeDocena: false, vendeFardo: true, requiereTaller: true, requiereEtiqueta: false, tipoTrabajo: TipoTrabajoTaller.TRAPOS },
  { codigo: "PF033", nombre: "TRAPO P/PISO BLANCO CONSORCIO FX 70x60", familiaId: "FAM001", marca: "FX", medida: "70x60", unidadesPorFardo: 60, vendeUnidad: false, vendeDocena: false, vendeFardo: true, requiereTaller: true, requiereEtiqueta: false, tipoTrabajo: TipoTrabajoTaller.TRAPOS },
  { codigo: "PF034", nombre: "TRAPO P/PISO GRIS CONSORCIO FX 70x60", familiaId: "FAM001", marca: "FX", medida: "70x60", unidadesPorFardo: 60, vendeUnidad: false, vendeDocena: false, vendeFardo: true, requiereTaller: true, requiereEtiqueta: false, tipoTrabajo: TipoTrabajoTaller.TRAPOS },
  { codigo: "PF035", nombre: "TRAPO P/PISO RAYADO CONSORCIO FX 70x60", familiaId: "FAM001", marca: "FX", medida: "70x60", unidadesPorFardo: 60, vendeUnidad: false, vendeDocena: false, vendeFardo: true, requiereTaller: true, requiereEtiqueta: false, tipoTrabajo: TipoTrabajoTaller.TRAPOS },
  { codigo: "PF036", nombre: "TRAPO P/PISO NIDO CONSORCIO FX 70x50", familiaId: "FAM001", marca: "FX", medida: "70x50", unidadesPorFardo: 60, vendeUnidad: false, vendeDocena: false, vendeFardo: true, requiereTaller: true, requiereEtiqueta: false, tipoTrabajo: TipoTrabajoTaller.TRAPOS },
  { codigo: "PF037", nombre: "TRAPO P/PISO PORTERO FX 70x60", familiaId: "FAM001", marca: "FX", medida: "70x60", unidadesPorFardo: 60, vendeUnidad: false, vendeDocena: false, vendeFardo: true, requiereTaller: true, requiereEtiqueta: false, tipoTrabajo: TipoTrabajoTaller.TRAPOS },
  { codigo: "PF038", nombre: "TRAPO P/PISO BLANCO EMME 70x60", familiaId: "FAM001", marca: "EMME", medida: "70x60", unidadesPorFardo: 60, vendeUnidad: false, vendeDocena: false, vendeFardo: true, requiereTaller: true, requiereEtiqueta: false, tipoTrabajo: TipoTrabajoTaller.TRAPOS },
  { codigo: "PF039", nombre: "TRAPO P/PISO BLANCO EMME 80x60", familiaId: "FAM001", marca: "EMME", medida: "80x60", unidadesPorFardo: 60, vendeUnidad: false, vendeDocena: true, vendeFardo: true, requiereTaller: true, requiereEtiqueta: false, tipoTrabajo: TipoTrabajoTaller.TRAPOS },

  // Rejillas TML (requiereTaller: SI, requiereEtiqueta: NO, tipoTrabajo: REJILLAS)
  { codigo: "PF040", nombre: "REJILLA TRIPLE TML 45x50", familiaId: "FAM002", marca: "TML", medida: "45x50", unidadesPorFardo: 60, vendeUnidad: true, vendeDocena: true, vendeFardo: true, requiereTaller: true, requiereEtiqueta: false, tipoTrabajo: TipoTrabajoTaller.REJILLAS },
  { codigo: "PF041", nombre: "REJILLA DOBLE PESADA TML 40x45", familiaId: "FAM002", marca: "TML", medida: "40x45", unidadesPorFardo: 60, vendeUnidad: true, vendeDocena: true, vendeFardo: true, requiereTaller: true, requiereEtiqueta: false, tipoTrabajo: TipoTrabajoTaller.REJILLAS },
  { codigo: "PF042", nombre: "REJILLA DOBLE LIVIANA TML 38x40", familiaId: "FAM002", marca: "TML", medida: "38x40", unidadesPorFardo: 60, vendeUnidad: true, vendeDocena: true, vendeFardo: true, requiereTaller: true, requiereEtiqueta: false, tipoTrabajo: TipoTrabajoTaller.REJILLAS },
  { codigo: "PF043", nombre: "REJILLA PROFESIONAL TML 40x45", familiaId: "FAM002", marca: "TML", medida: "40x45", unidadesPorFardo: 60, vendeUnidad: true, vendeDocena: true, vendeFardo: true, requiereTaller: true, requiereEtiqueta: false, tipoTrabajo: TipoTrabajoTaller.REJILLAS },

  // Rejillas compradas (requiereTaller: NO, requiereEtiqueta: SI)
  { codigo: "PF044", nombre: "REJILLA AMERICANA TML 38x40", familiaId: "FAM002", marca: "TML", medida: "38x40", unidadesPorFardo: 120, vendeUnidad: true, vendeDocena: true, vendeFardo: true, requiereTaller: false, requiereEtiqueta: true, tipoTrabajo: null },
  { codigo: "PF045", nombre: "REJILLA PABILO TML 38x40", familiaId: "FAM002", marca: "TML", medida: "38x40", unidadesPorFardo: 120, vendeUnidad: true, vendeDocena: true, vendeFardo: true, requiereTaller: false, requiereEtiqueta: true, tipoTrabajo: null },
  { codigo: "PF046", nombre: "REJILLA TUBULAR TML 40x45", familiaId: "FAM002", marca: "TML", medida: "40x45", unidadesPorFardo: 60, vendeUnidad: true, vendeDocena: true, vendeFardo: true, requiereTaller: false, requiereEtiqueta: true, tipoTrabajo: null },

  // Franelas, Repasadores, Paños, Alfombras (requiereTaller: NO, requiereEtiqueta: SI)
  { codigo: "PF047", nombre: "FRANELA TML 45x60", familiaId: "FAM003", marca: "TML", medida: "45x60", unidadesPorFardo: 60, vendeUnidad: true, vendeDocena: true, vendeFardo: true, requiereTaller: false, requiereEtiqueta: true, tipoTrabajo: null },
  { codigo: "PF048", nombre: "FRANELA TML 50x50", familiaId: "FAM003", marca: "TML", medida: "50x50", unidadesPorFardo: 60, vendeUnidad: true, vendeDocena: true, vendeFardo: true, requiereTaller: false, requiereEtiqueta: true, tipoTrabajo: null },
  { codigo: "PF049", nombre: "REPASADOR SARGA TML 40x60", familiaId: "FAM004", marca: "TML", medida: "40x60", unidadesPorFardo: 60, vendeUnidad: true, vendeDocena: true, vendeFardo: true, requiereTaller: false, requiereEtiqueta: true, tipoTrabajo: null },
  { codigo: "PF050", nombre: "REPASADOR TOALLA TML 42x60", familiaId: "FAM004", marca: "TML", medida: "42x60", unidadesPorFardo: 36, vendeUnidad: true, vendeDocena: true, vendeFardo: true, requiereTaller: false, requiereEtiqueta: true, tipoTrabajo: null },
  { codigo: "PF051", nombre: "PAÑO ABSORVENTE TML 38x40", familiaId: "FAM005", marca: "TML", medida: "38x40", unidadesPorFardo: 120, vendeUnidad: true, vendeDocena: true, vendeFardo: true, requiereTaller: false, requiereEtiqueta: true, tipoTrabajo: null },
  { codigo: "PF052", nombre: "ALFOMBRA ESTAMPADA TML 50x60", familiaId: "FAM006", marca: "TML", medida: "50x60", unidadesPorFardo: 36, vendeUnidad: true, vendeDocena: true, vendeFardo: true, requiereTaller: false, requiereEtiqueta: true, tipoTrabajo: null }
];

const PRODUCTOS_FALLADOS = [
  { codigo: "FL001", nombre: "Trapo P/Piso Blanco Fallado 45x60", familiaId: "FAM001", medida: "45x60" },
  { codigo: "FL002", nombre: "Trapo P/Piso Gris Fallado 45x60", familiaId: "FAM001", medida: "45x60" },
  { codigo: "FL003", nombre: "Trapo P/Piso Color Fallado 45x60", familiaId: "FAM001", medida: "45x60" },
  { codigo: "FL004", nombre: "Trapo P/Piso Rayado Fallado 45x60", familiaId: "FAM001", medida: "45x60" },
  { codigo: "FL005", nombre: "Trapo P/Piso Nido Fallado 45x60", familiaId: "FAM001", medida: "45x60" },
  { codigo: "FL006", nombre: "Trapo P/Piso Blanco Fallado 50x60", familiaId: "FAM001", medida: "50x60" },
  { codigo: "FL007", nombre: "Trapo P/Piso Gris Fallado 50x60", familiaId: "FAM001", medida: "50x60" },
  { codigo: "FL008", nombre: "Trapo P/Piso Rayado Fallado 50x60", familiaId: "FAM001", medida: "50x60" },
  { codigo: "FL009", nombre: "Trapo P/Piso Nido Fallado 60x50", familiaId: "FAM001", medida: "60x50" },
  { codigo: "FL010", nombre: "Trapo P/Piso Blanco Fallado 60x60", familiaId: "FAM001", medida: "60x60" },
  { codigo: "FL011", nombre: "Trapo P/Piso Gris Fallado 60x60", familiaId: "FAM001", medida: "60x60" },
  { codigo: "FL012", nombre: "Trapo P/Piso Color Fallado 60x60", familiaId: "FAM001", medida: "60x60" },
  { codigo: "FL013", nombre: "Trapo P/Piso Blanco Fallado 70x60", familiaId: "FAM001", medida: "70x60" },
  { codigo: "FL014", nombre: "Trapo P/Piso Gris Fallado 70x60", familiaId: "FAM001", medida: "70x60" },
  { codigo: "FL015", nombre: "Trapo P/Piso Rayado Fallado 70x60", familiaId: "FAM001", medida: "70x60" },
  { codigo: "FL016", nombre: "Trapo P/Piso Nido Fallado 60x70", familiaId: "FAM001", medida: "60x70" },
  { codigo: "FL017", nombre: "Trapo P/Piso Blanco Fallado 80x60", familiaId: "FAM001", medida: "80x60" }
];

const INSUMOS = [
  { codigo: "INS001", nombre: "Cono Blanco", categoriaInsumo: "Conos de Hilo", unidadMedida: "Cono", stockMinimo: 3 },
  { codigo: "INS003", nombre: "Cono Negro", categoriaInsumo: "Conos de Hilo", unidadMedida: "Cono", stockMinimo: 3 },
  { codigo: "INS004", nombre: "Cono Azul", categoriaInsumo: "Conos de Hilo", unidadMedida: "Cono", stockMinimo: 3 },
  { codigo: "INS005", nombre: "Cono Verde", categoriaInsumo: "Conos de Hilo", unidadMedida: "Cono", stockMinimo: 3 },
  { codigo: "INS006", nombre: "Cono Rojo", categoriaInsumo: "Conos de Hilo", unidadMedida: "Cono", stockMinimo: 3 },
  { codigo: "INS007", nombre: "Hilo de Enfardar", categoriaInsumo: "Enfardado", unidadMedida: "Rollo", stockMinimo: 2 },
  { codigo: "INS008", nombre: "Bolsa Rosada", categoriaInsumo: "Bolsas", unidadMedida: "Unidad", stockMinimo: 60 },
  { codigo: "INS009", nombre: "Bolsa Naranja", categoriaInsumo: "Bolsas", unidadMedida: "Unidad", stockMinimo: 60 },
  { codigo: "INS010", nombre: "Bolsa Azul", categoriaInsumo: "Bolsas", unidadMedida: "Unidad", stockMinimo: 60 },
  { codigo: "INS011", nombre: "Bolsa Negra", categoriaInsumo: "Bolsas", unidadMedida: "Unidad", stockMinimo: 60 },
  { codigo: "INS012", nombre: "Bolsa Roja", categoriaInsumo: "Bolsas", unidadMedida: "Unidad", stockMinimo: 60 },
  { codigo: "INS013", nombre: "Bolsa Verde", categoriaInsumo: "Bolsas", unidadMedida: "Unidad", stockMinimo: 60 },
  { codigo: "INS014", nombre: "Bolsa Negra xUnidad", categoriaInsumo: "Bolsas", unidadMedida: "Unidad", stockMinimo: 60 },
  { codigo: "INS015", nombre: "Bolsa Roja xUnidad", categoriaInsumo: "Bolsas", unidadMedida: "Unidad", stockMinimo: 60 },
  { codigo: "INS016", nombre: "Bolsa Verde xUnidad", categoriaInsumo: "Bolsas", unidadMedida: "Unidad", stockMinimo: 60 },
  { codigo: "INS017", nombre: "Bolsa Tradicional", categoriaInsumo: "Bolsas", unidadMedida: "Unidad", stockMinimo: 60 },
  { codigo: "INS018", nombre: "Bolsa Consorcio", categoriaInsumo: "Bolsas", unidadMedida: "Unidad", stockMinimo: 60 },
  { codigo: "INS019", nombre: "Bolsa Extra Consorcio", categoriaInsumo: "Bolsas", unidadMedida: "Unidad", stockMinimo: 60 },
  { codigo: "INS020", nombre: "Bolsa 60x80", categoriaInsumo: "Bolsas", unidadMedida: "Unidad", stockMinimo: 60 }
];

const RETAZOS = [
  { codigo: "RET001", nombre: "Retazo 80 cm" },
  { codigo: "RET002", nombre: "Retazo 70 cm" },
  { codigo: "RET003", nombre: "Retazo 60 cm" },
  { codigo: "RET004", nombre: "Retazo 50 cm" },
  { codigo: "RET005", nombre: "Retazo 45 cm" },
  { codigo: "RET006", nombre: "Retazo Varios" }
];

const USUARIOS = [
  { id: "US001", nombre: "Leonel", email: "leoneltml", passwordRaw: "Leonelalejandro5", rol: RolUsuario.ADMINISTRADOR, area: "Administración", accesoStock: true, tallerId: null },
  { id: "US002", nombre: "Ariel", email: "arieltml", passwordRaw: "TML2026", rol: RolUsuario.DUENO, area: "Administración", accesoStock: true, tallerId: null },
  { id: "US003", nombre: "Diego", email: "diegotml", passwordRaw: "TML2026", rol: RolUsuario.DUENO, area: "Administración", accesoStock: true, tallerId: null },
  { id: "US004", nombre: "Nacho", email: "nachotml", passwordRaw: "TMLSUP2026", rol: RolUsuario.SUPERVISOR, area: "Producción", accesoStock: true, tallerId: null },
  { id: "US005", nombre: "Daniel", email: "danieltml", passwordRaw: "TMLSUP2026", rol: RolUsuario.SUPERVISOR, area: "Producción", accesoStock: true, tallerId: null },
  { id: "US006", nombre: "Rolando", email: "rolandotml", passwordRaw: "TMLOP2026", rol: RolUsuario.OPERARIO, area: "Corte", accesoStock: false, tallerId: null },
  { id: "US007", nombre: "Walter", email: "waltertml", passwordRaw: "TMLOP2026", rol: RolUsuario.OPERARIO, area: "Corte", accesoStock: false, tallerId: null },
  { id: "US008", nombre: "Evelina", email: "evelinatml", passwordRaw: "TMLTALLER2026", rol: RolUsuario.TALLER, area: "Taller", accesoStock: false, tallerId: "TAL001" },
  { id: "US009", nombre: "Vanesa", email: "vanesatml", passwordRaw: "TMLTALLER2026", rol: RolUsuario.TALLER, area: "Taller", accesoStock: false, tallerId: "TAL002" },
  { id: "US010", nombre: "Mary", email: "marytml", passwordRaw: "TMLTALLER2026", rol: RolUsuario.TALLER, area: "Taller", accesoStock: false, tallerId: "TAL003" },
  { id: "US011", nombre: "Fernanda", email: "fernandatml", passwordRaw: "TMLTALLER2026", rol: RolUsuario.TALLER, area: "Taller", accesoStock: false, tallerId: "TAL004" },
  { id: "US012", nombre: "Silvia", email: "silviatml", passwordRaw: "TMLTALLER2026", rol: RolUsuario.TALLER, area: "Taller", accesoStock: false, tallerId: "TAL005" }
];

async function seed() {
  console.log("🌱 Iniciar Semilla de Datos según Final Data v1.0...");

  // 1. Limpiar todos los registros
  console.log("🧹 Limpiando registros anteriores...");
  await prisma.tallerPago.deleteMany({});
  await prisma.tallerTarifa.deleteMany({});
  await prisma.alertaStock.deleteMany({});
  await prisma.auditoria.deleteMany({});
  await prisma.movimientoInsumo.deleteMany({});
  await prisma.movimientoItem.deleteMany({});
  await prisma.movimiento.deleteMany({});
  await prisma.stockActual.deleteMany({});
  await prisma.usuarioPermiso.deleteMany({});
  await prisma.permiso.deleteMany({});
  await prisma.usuario.deleteMany({});
  await prisma.producto.deleteMany({});
  await prisma.familia.deleteMany({});
  await prisma.deposito.deleteMany({});
  await prisma.taller.deleteMany({});
  await prisma.configuracion.deleteMany({});

  // 2. Insertar Familias
  console.log("👪 Insertando Familias...");
  for (const f of FAMILIAS) {
    await prisma.familia.create({ data: f });
  }

  // 3. Insertar Depósitos
  console.log("🏪 Insertando Depósitos...");
  for (const d of DEPOSITOS) {
    await prisma.deposito.create({ data: d });
  }

  function deriveLinea(codigo: string, nombre: string): string | null {
    const nameUpper = nombre.toUpperCase();
    const codeNum = parseInt(codigo.substring(2), 10);
    
    if (codigo.startsWith("PB")) {
      if (codeNum >= 1 && codeNum <= 22) {
        if (nameUpper.includes("BLANCO")) return "Blanco";
        if (nameUpper.includes("GRIS")) return "Gris";
        if (nameUpper.includes("RAYADO TRADICIONAL")) return "Rayado Tradicional";
        if (nameUpper.includes("RAYADO COLOR")) return "Rayado Color";
        if (nameUpper.includes("COLOR")) return "Color";
        if (nameUpper.includes("NIDO")) return "Nido";
        if (nameUpper.includes("DURA MÁS BLANCO")) return "Dura Más Blanco";
        if (nameUpper.includes("DURA MÁS GRIS")) return "Dura Más Gris";
        if (nameUpper.includes("DURA MÁS RAYADO TRADICIONAL")) return "Dura Más Rayado";
        if (nameUpper.includes("DURA MÁS RAYADO COLOR")) return "Dura Más Rayado";
        return "Blanco";
      }
      if (codigo === "PB023") return "Triple";
      if (codigo === "PB024") return "Doble Pesada";
      if (codigo === "PB025") return "Doble Liviana";
      if (codigo === "PB026") return "Profesional";
      if (codigo === "PB027") return "Americana";
      if (codigo === "PB028") return "Pabilo";
      if (codigo === "PB029") return "Tubular";
      if (codigo === "PB030") return "Franela 45x60";
      if (codigo === "PB031") return "Franela 50x50";
      if (codigo === "PB032") return "Repasador Sarga";
      if (codigo === "PB033") return "Repasador Toalla";
      if (codigo === "PB034") return "Paño Absorbente";
    } else if (codigo.startsWith("PF")) {
      if (codeNum >= 1 && codeNum <= 39) {
        if (nameUpper.includes("SURTIDO")) return "Surtido";
        if (nameUpper.includes("BLANCO")) return "Blanco";
        if (nameUpper.includes("GRIS")) return "Gris";
        if (nameUpper.includes("RAYADO TURQUESA")) return "Dura Más Rayado";
        if (nameUpper.includes("RAYADO GRIS")) return "Dura Más Rayado";
        if (nameUpper.includes("RAYADO COLOR")) return "Color";
        if (nameUpper.includes("RAYADO")) return "Rayado Tradicional";
        if (nameUpper.includes("NIDO")) return "Nido";
        if (nameUpper.includes("PORTERO")) return "Gris";
        return "Blanco";
      }
      if (codigo === "PF040") return "Triple";
      if (codigo === "PF041") return "Doble Pesada";
      if (codigo === "PF042") return "Doble Liviana";
      if (codigo === "PF043") return "Profesional";
      if (codigo === "PF044") return "Americana";
      if (codigo === "PF045") return "Pabilo";
      if (codigo === "PF046") return "Tubular";
      if (codigo === "PF047") return "Franela 45x60";
      if (codigo === "PF048") return "Franela 50x50";
      if (codigo === "PF049") return "Repasador Sarga";
      if (codigo === "PF050") return "Repasador Toalla";
      if (codigo === "PF051") return "Paño Absorbente";
      if (codigo === "PF052") return "Alfombra";
    }
    return null;
  }

  // 4. Insertar Talleres
  console.log("🧵 Insertando Talleres...");
  for (const t of TALLERES) {
    await prisma.taller.create({
      data: {
        id: t.id,
        nombre: t.nombre,
        observaciones: t.observaciones,
        depositoAsociadoId: t.depositoAsociadoId
      }
    });
  }

  // 5. Insertar Tarifas simplificadas
  console.log("💰 Insertando Tarifas por Trabajo...");
  for (const tar of TARIFAS) {
    await prisma.tallerTarifa.create({
      data: {
        tallerId: tar.tallerId,
        tipoTrabajo: tar.tipoTrabajo,
        precioFardo: tar.precioFardo
      }
    });
  }

  // 6. Insertar Productos Base (PB)
  console.log("📦 Insertando Productos Base...");
  const productosMap = new Map<string, string>();
  for (const pb of PRODUCTOS_BASE) {
    const created = await prisma.producto.create({
      data: {
        codigo: pb.codigo,
        nombre: pb.nombre,
        tipoProducto: TipoProducto.BASE,
        familiaId: pb.familiaId,
        medida: pb.medida,
        color: pb.color,
        estadoActual: pb.estadoActual,
        procesoSiguiente: pb.procesoSiguiente,
        origen: pb.origen,
        unidadMedida: pb.unidadMedida || "Unidad",
        linea: deriveLinea(pb.codigo, pb.nombre)
      }
    });
    productosMap.set(pb.codigo, created.id);
  }

  // 7. Insertar Productos Comerciales (PF)
  console.log("🛍️ Insertando Productos Comerciales...");
  for (const pf of PRODUCTOS_COMERCIALES) {
    const created = await prisma.producto.create({
      data: {
        codigo: pf.codigo,
        nombre: pf.nombre,
        tipoProducto: TipoProducto.COMERCIAL,
        familiaId: pf.familiaId,
        marca: pf.marca,
        medida: pf.medida,
        unidadesPorFardo: pf.unidadesPorFardo,
        vendeUnidad: pf.vendeUnidad,
        vendeDocena: pf.vendeDocena,
        vendeFardo: pf.vendeFardo,
        requiereTaller: pf.requiereTaller,
        requiereEtiqueta: pf.requiereEtiqueta,
        tipoTrabajo: pf.tipoTrabajo,
        unidadMedida: "Unidad",
        linea: deriveLinea(pf.codigo, pf.nombre)
      }
    });
    productosMap.set(pf.codigo, created.id);
  }

  // 8. Insertar Productos Fallados (FL)
  console.log("❌ Insertando Productos Fallados...");
  for (const fl of PRODUCTOS_FALLADOS) {
    const created = await prisma.producto.create({
      data: {
        codigo: fl.codigo,
        nombre: fl.nombre,
        tipoProducto: TipoProducto.FALLADO,
        familiaId: fl.familiaId,
        medida: fl.medida,
        unidadMedida: "Unidad",
        tipoTrabajo: TipoTrabajoTaller.TRAPOS
      }
    });
    productosMap.set(fl.codigo, created.id);
  }

  // 9. Insertar Insumos (INS)
  console.log("🧵 Insertando Insumos...");
  for (const ins of INSUMOS) {
    const created = await prisma.producto.create({
      data: {
        codigo: ins.codigo,
        nombre: ins.nombre,
        tipoProducto: TipoProducto.INSUMO,
        familiaId: "FAM007",
        categoriaInsumo: ins.categoriaInsumo,
        unidadMedida: ins.unidadMedida,
        stockMinimo: ins.stockMinimo
      }
    });
    productosMap.set(ins.codigo, created.id);
  }

  // 10. Insertar Retazos (RET)
  console.log("✂️ Insertando Retazos...");
  for (const ret of RETAZOS) {
    const created = await prisma.producto.create({
      data: {
        codigo: ret.codigo,
        nombre: ret.nombre,
        tipoProducto: TipoProducto.RETAZO,
        unidadMedida: "Unidad"
      }
    });
    productosMap.set(ret.codigo, created.id);
  }

  // 11. Insertar Permisos Base
  console.log("🔑 Creando Permisos de Sistema...");
  const PERMISOS = [
    { clave: "MOVIMIENTOS_CREAR", descripcion: "Registrar nuevos movimientos de stock", modulo: "PRODUCCION" },
    { clave: "MOVIMIENTOS_VER", descripcion: "Consultar historial y auditoría de movimientos", modulo: "PRODUCCION" },
    { clave: "STOCK_VER", descripcion: "Visualizar stock en depósitos y talleres", modulo: "STOCK" },
    { clave: "STOCK_EDITAR", descripcion: "Registrar ajustes manuales de stock", modulo: "STOCK" },
    { clave: "ADMIN_SISTEMA", descripcion: "Acceso total y configuración del ERP", modulo: "ADMIN" }
  ];
  const dbPermisosMap = new Map<string, string>();
  for (const p of PERMISOS) {
    const created = await prisma.permiso.create({ data: p });
    dbPermisosMap.set(p.clave, created.id);
  }

  // 12. Insertar Usuarios con roles del Final Data v1.0
  console.log("👤 Creando Operarios y Cuentas...");
  const saltRounds = env.BCRYPT_ROUNDS || 10;
  for (const u of USUARIOS) {
    const passwordHash = await bcrypt.hash(u.passwordRaw, saltRounds);
    const createdUser = await prisma.usuario.create({
      data: {
        id: u.id,
        codigo: u.id,
        nombre: u.nombre,
        email: u.email.toLowerCase().trim(),
        passwordHash,
        rol: u.rol,
        area: u.area,
        accesoStock: u.accesoStock,
        tallerId: u.tallerId
      }
    });

    // Asignar permisos automáticos según el rol
    let asignados: string[] = [];
    if (u.rol === RolUsuario.ADMINISTRADOR || u.rol === RolUsuario.DUENO) {
      asignados = ["MOVIMIENTOS_CREAR", "MOVIMIENTOS_VER", "STOCK_VER", "STOCK_EDITAR", "ADMIN_SISTEMA"];
    } else if (u.rol === RolUsuario.SUPERVISOR) {
      asignados = ["MOVIMIENTOS_CREAR", "MOVIMIENTOS_VER", "STOCK_VER", "STOCK_EDITAR"];
    } else if (u.rol === RolUsuario.OPERARIO) {
      asignados = ["MOVIMIENTOS_CREAR", "STOCK_VER"];
    } else if (u.rol === RolUsuario.TALLER) {
      asignados = ["MOVIMIENTOS_VER", "STOCK_VER"];
    }

    for (const key of asignados) {
      await prisma.usuarioPermiso.create({
        data: {
          usuarioId: createdUser.id,
          permisoId: dbPermisosMap.get(key)!
        }
      });
    }

    // Configurar acceso de depósitos en Configuracion (mapeo legacy compatible)
    const allowedDepositos = u.rol === RolUsuario.TALLER && u.tallerId 
      ? [u.tallerId] 
      : DEPOSITOS.map(d => d.id);
    const allowedTalleres = u.rol === RolUsuario.TALLER && u.tallerId 
      ? [u.tallerId] 
      : TALLERES.map(t => t.id);

    await prisma.configuracion.create({
      data: {
        clave: `user_access:${createdUser.id}`,
        valor: JSON.stringify({ allowedTalleres, allowedDepositos }),
        descripcion: `Mapeo de accesos de depósitos para ${u.nombre}`
      }
    });
  }

  // 13. Configuración global
  await prisma.configuracion.create({
    data: {
      clave: "STOCK_MINIMO_ALERTA",
      valor: "60",
      descripcion: "Umbral mínimo para disparar alertas de productos en fardo"
    }
  });

  // 14. Stock Inicial Base (Zona de Corte)
  console.log("📊 Inicializando stock inicial de materias primas...");
  
  // Poner stock de cortadas en la Zona de Corte (DEP001)
  const cortadasCodigos = ["PB001", "PB002", "PB003", "PB009", "PB010", "PB014"];
  for (const cod of cortadasCodigos) {
    const prodId = productosMap.get(cod)!;
    await prisma.stockActual.create({
      data: {
        productoId: prodId,
        depositoId: "DEP001",
        calidad: CalidadProducto.PERFECTO,
        canal: CanalStock.MAYORISTA,
        cantidadUnidades: 400
      }
    });
  }

  // Poner stock de rollos de rejillas en Zona de Corte (DEP001)
  const rollosCodigos = ["PB023", "PB024"];
  for (const cod of rollosCodigos) {
    const prodId = productosMap.get(cod)!;
    await prisma.stockActual.create({
      data: {
        productoId: prodId,
        depositoId: "DEP001",
        calidad: CalidadProducto.PERFECTO,
        canal: CanalStock.MAYORISTA,
        cantidadUnidades: 120 // 120 kg de rejilla en rollos
      }
    });
  }

  // Poner algunos productos terminados comerciales en Galpón Central (Fardos) y Casa (Retail)
  const comercialesStock = [
    { cod: "PF001", fardosCentral: 10, fardosCasa: 2 },
    { cod: "PF010", fardosCentral: 5, fardosCasa: 1 },
    { cod: "PF015", fardosCentral: 15, fardosCasa: 3 },
    { cod: "PF040", fardosCentral: 8, fardosCasa: 2 }
  ];

  for (const cs of comercialesStock) {
    const prodId = productosMap.get(cs.cod)!;
    const unitsPerFardo = 60; // all fardos are 60 units in this seed
    
    // Central (Mayorista, presentacion FARDO)
    await prisma.stockActual.create({
      data: {
        productoId: prodId,
        depositoId: "DEP002",
        calidad: CalidadProducto.PERFECTO,
        canal: CanalStock.MAYORISTA,
        cantidadUnidades: cs.fardosCentral * unitsPerFardo
      }
    });

    // Casa (Minorista, presentacion UNIDAD)
    await prisma.stockActual.create({
      data: {
        productoId: prodId,
        depositoId: "DEP003",
        calidad: CalidadProducto.PERFECTO,
        canal: CanalStock.MINORISTA,
        cantidadUnidades: cs.fardosCasa * unitsPerFardo
      }
    });
  }

  // Poner insumos en Casa (DEP003)
  const insumosStock = [
    { cod: "INS001", qty: 24 }, // conos blanco
    { cod: "INS007", qty: 10 }, // hilo de enfardar
    { cod: "INS008", qty: 500 } // bolsas
  ];
  for (const is of insumosStock) {
    const prodId = productosMap.get(is.cod)!;
    await prisma.stockActual.create({
      data: {
        productoId: prodId,
        depositoId: "DEP003",
        calidad: CalidadProducto.PERFECTO,
        canal: CanalStock.MAYORISTA,
        cantidadUnidades: is.qty
      }
    });
  }

  console.log("🏁 Base de datos de desarrollo sembrada con éxito.");
}

seed()
  .catch(err => {
    console.error("❌ Error en el sembrado:", err);
    process.exit(1);
  });
