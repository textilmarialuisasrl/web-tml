const fs = require('fs');
const path = require('path');

const productos = [];

// 1. Telas (Cut fabrics)
const telasRaw = [
  { nombre: "Tela 45x60 Blanco", medida: "45x60 cm" },
  { nombre: "Tela 45x60 Gris", medida: "45x60 cm" },
  { nombre: "Tela 45x60 Rayado", medida: "45x60 cm" },
  { nombre: "Tela 45x60 Azul", medida: "45x60 cm" },
  { nombre: "Tela 45x60 Rojo", medida: "45x60 cm" },
  { nombre: "Tela 45x60 Nido", medida: "45x60 cm" },
  { nombre: "Tela 50x60 Blanco", medida: "50x60 cm" },
  { nombre: "Tela 50x60 Gris", medida: "50x60 cm" },
  { nombre: "Tela 50x60 Rayado Turquesa", medida: "50x60 cm" },
  { nombre: "Tela 50x60 Rayado Gris", medida: "50x60 cm" },
  { nombre: "Tela 50x60 Nido", medida: "50x60 cm" },
  { nombre: "Tela 60x60 Blanco", medida: "60x60 cm" },
  { nombre: "Tela 60x60 Gris", medida: "60x60 cm" },
  { nombre: "Tela 60x60 Rayado", medida: "60x60 cm" },
  { nombre: "Tela 60x60 Azul", medida: "60x60 cm" },
  { nombre: "Tela 60x60 Rojo", medida: "60x60 cm" },
  { nombre: "Tela 70x60 Blanco", medida: "70x60 cm" },
  { nombre: "Tela 70x60 Gris", medida: "70x60 cm" },
  { nombre: "Tela 70x60 Rayado", medida: "70x60 cm" },
  { nombre: "Tela 70x60 Nido", medida: "70x60 cm" },
  { nombre: "Tela 80x60 Blanco", medida: "80x60 cm" }
];

for (const t of telasRaw) {
  productos.push({
    nombre: t.nombre,
    categoria: "Telas",
    medida: t.medida,
    unidadesPorFardo: 1, // Telas are measured in single units/meters usually
    permiteUnidad: true,
    presentacion: "Rollo / Bobina",
    descripcion: `Tela cortada real para producción: ${t.nombre}`
  });
}

// 2. Insumos (Supplies)
const insumosRaw = [
  { nombre: "Cono de hilo Blanco" },
  { nombre: "Cono de hilo Rojo" },
  { nombre: "Cono de hilo Negro" },
  { nombre: "Cono de hilo Azul" },
  { nombre: "Cono de hilo Verde" },
  { nombre: "Hilo de Enfardar Negro" },
  { nombre: "Bolsa P/Rejilla" },
  { nombre: "Bolsa Naranja" },
  { nombre: "Bolsa Azul" },
  { nombre: "Bolsa Negra" },
  { nombre: "Bolsa Tradicional" },
  { nombre: "Bolsa Roja" },
  { nombre: "Bolsa Verde" },
  { nombre: "Bolsa Consorcio" },
  { nombre: "Bolsa Extra Consorcio" },
  { nombre: "Bolsa Negra P/U" },
  { nombre: "Bolsa Roja P/U" },
  { nombre: "Bolsa Verde P/U" }
];

for (const ins of insumosRaw) {
  productos.push({
    nombre: ins.nombre,
    categoria: "Insumos",
    medida: "Unidad",
    unidadesPorFardo: 1,
    permiteUnidad: true,
    presentacion: "Unidad individual",
    descripcion: `Insumo real de fábrica: ${ins.nombre}`
  });
}

// 3. Finished Goods
const traposRaw = [
  { nombre: "Trapo de piso 45x60 Blanco Millenian", fardo: 60 },
  { nombre: "Trapo de piso 45x60 Gris Millenian", fardo: 60 },
  { nombre: "Trapo de piso 45x60 Rayado Millenian", fardo: 60 },
  { nombre: "Trapo de piso 45x60 Nido Millenian", fardo: 60 },
  { nombre: "Trapo de piso 45x60 Blanco Uso Diario", fardo: 60 },
  { nombre: "Trapo de piso 45x60 Gris Uso Diario", fardo: 60 },
  { nombre: "Trapo de piso 45x60 Rayado Uso Diario", fardo: 60 },
  { nombre: "Trapo de piso 45x60 Nido Uso Diario", fardo: 60 },
  { nombre: "Trapo de piso 45x60 Blanco TML", fardo: 60, permiteU: true },
  { nombre: "Trapo de piso 45x60 Gris TML", fardo: 60, permiteU: true },
  { nombre: "Trapo de piso 45x60 Rayado TML", fardo: 60, permiteU: true },
  { nombre: "Trapo de piso 45x60 Azul TML", fardo: 60, permiteU: true },
  { nombre: "Trapo de piso 45x60 Rojo TML", fardo: 60, permiteU: true },
  { nombre: "Trapo de piso 45x60 Surtido TML", fardo: 60 },
  { nombre: "Trapo de piso 50x60 Blanco TML", fardo: 60 },
  { nombre: "Trapo de piso 50x60 Gris TML", fardo: 60 },
  { nombre: "Trapo de piso 50x60 Rayado Surtido TML", fardo: 60 },
  { nombre: "Trapo de piso 50x60 Rayado TML P/U", fardo: 60 },
  { nombre: "Trapo de piso 50x60 Blanco Dura Más", fardo: 60 },
  { nombre: "Trapo de piso 50x60 Gris Dura Más", fardo: 60 },
  { nombre: "Trapo de piso 50x60 Rayado Turquesa Dura Más", fardo: 60 },
  { nombre: "Trapo de piso 50x60 Rayado Gris Dura Más", fardo: 60 },
  { nombre: "Trapo de piso 50x60 Blanco Emme", fardo: 60 },
  { nombre: "Trapo de piso 50x60 Gris Emme", fardo: 60 },
  { nombre: "Trapo de piso 50x60 Blanco FX", fardo: 60 },
  { nombre: "Trapo de piso 50x60 Gris FX", fardo: 60 },
  { nombre: "Trapo de piso 50x60 Rayado Tradicional FX", fardo: 60 },
  { nombre: "Trapo de piso 50x60 Rayado Color FX", fardo: 60 },
  { nombre: "Trapo de piso 60x50 Nido FX", fardo: 60 },
  { nombre: "Trapo de piso 60x50 Nido TML", fardo: 60 },
  { nombre: "Trapo de piso 60x60 Blanco TML", fardo: 60 },
  { nombre: "Trapo de piso 60x60 Gris TML", fardo: 60 },
  { nombre: "Trapo de piso 60x60 Rayado TML", fardo: 60 },
  { nombre: "Trapo de piso 60x60 Blanco TML P/U", fardo: 60 },
  { nombre: "Trapo de piso 60x60 Surtido TML", fardo: 60 },
  { nombre: "Trapo de piso 70x60 Blanco TML", fardo: 60 },
  { nombre: "Trapo de piso 70x60 Gris TML", fardo: 60 },
  { nombre: "Trapo de piso 70x60 Blanco TML P/U", fardo: 60 },
  { nombre: "Trapo de piso 70x60 Blanco Emme", fardo: 60 },
  { nombre: "Trapo de piso 70x60 Blanco Consorcio FX", fardo: 60 },
  { nombre: "Trapo de piso 70x60 Gris Consorcio FX", fardo: 60 },
  { nombre: "Trapo de piso 70x60 Rayado Consorcio FX", fardo: 60 },
  { nombre: "Trapo de piso 70x60 Nido Consorcio FX", fardo: 60 },
  { nombre: "Trapo de piso 70x60 Blanco Portero", fardo: 60 },
  { nombre: "Trapo de piso 80x60 Blanco Emme", fardo: 60 }
];

for (const t of traposRaw) {
  productos.push({
    nombre: t.nombre,
    categoria: "Trapos",
    unidadesPorFardo: t.fardo,
    permiteUnidad: t.permiteU || false,
    presentacion: `Fardo x ${t.fardo} unidades`,
    descripcion: `Producto terminado: ${t.nombre}`
  });
}

const rejillasRaw = [
  { nombre: "Rejilla 45x50 TML Triple", fardo: 60 },
  { nombre: "Rejilla 40x45 TML Doble Pesada", fardo: 60 },
  { nombre: "Rejilla 38x40 TML Doble Liviana", fardo: 60 },
  { nombre: "Rejilla 40x45 TML Profesional", fardo: 60 },
  { nombre: "Rejilla 38x40 TML Americana", fardo: 120 },
  { nombre: "Rejilla 38x40 Americana", fardo: 1200 },
  { nombre: "Rejilla 38x40 TML Pabilo", fardo: 120 },
  { nombre: "Rejilla 38x40 Pabilo", fardo: 1200 },
  { nombre: "Rejilla 40x45 TML Tubular", fardo: 60 },
  { nombre: "Rejilla 40x45 Tubular", fardo: 480 }
];

for (const r of rejillasRaw) {
  productos.push({
    nombre: r.nombre,
    categoria: "Rejillas",
    unidadesPorFardo: r.fardo,
    permiteUnidad: true,
    presentacion: `Fardo x ${r.fardo} unidades`,
    descripcion: `Producto terminado: ${r.nombre}`
  });
}

const repasadoresRaw = [
  { nombre: "Repasador 42x60 TML Toalla", fardo: 36 },
  { nombre: "Repasador 42x60 Toalla", fardo: 192 },
  { nombre: "Repasador 40x60 TML Sarga", fardo: 60 },
  { nombre: "Repasador 40x60 Sarga", fardo: 300 }
];

for (const rep of repasadoresRaw) {
  productos.push({
    nombre: rep.nombre,
    categoria: "Repasadores",
    unidadesPorFardo: rep.fardo,
    permiteUnidad: true,
    presentacion: `Fardo x ${rep.fardo} unidades`,
    descripcion: `Producto terminado: ${rep.nombre}`
  });
}

const franelasRaw = [
  { nombre: "Franela 45x60 TML", fardo: 60 },
  { nombre: "Franela 45x60 Cruda", fardo: 600 },
  { nombre: "Franela 50x50 TML", fardo: 60 },
  { nombre: "Franela 50x50 Cruda", fardo: 300 }
];

for (const f of franelasRaw) {
  productos.push({
    nombre: f.nombre,
    categoria: "Franelas",
    unidadesPorFardo: f.fardo,
    permiteUnidad: true,
    presentacion: `Fardo x ${f.fardo} unidades`,
    descripcion: `Producto terminado: ${f.nombre}`
  });
}

const panosRaw = [
  { nombre: "Paño 38x40 TML", fardo: 120 },
  { nombre: "Paño 38x40 Crudo", fardo: 250 }
];

for (const p of panosRaw) {
  productos.push({
    nombre: p.nombre,
    categoria: "Paños",
    unidadesPorFardo: p.fardo,
    permiteUnidad: true,
    presentacion: `Fardo x ${p.fardo} unidades`,
    descripcion: `Producto terminado: ${p.nombre}`
  });
}

const alfombrasRaw = [
  { nombre: "Alfombra de Piso 50x60 TML", fardo: 36 },
  { nombre: "Alfombra de Piso 50x60 Sin terminar", fardo: 60 }
];

for (const a of alfombrasRaw) {
  productos.push({
    nombre: a.nombre,
    categoria: "Alfombras",
    unidadesPorFardo: a.fardo,
    permiteUnidad: true,
    presentacion: `Fardo x ${a.fardo} unidades`,
    descripcion: `Producto terminado: ${a.nombre}`
  });
}

// 4. Especiales (retazos, varios, fallados, S/E)
const especialesRaw = [
  { nombre: "Trapo de piso fallado 45x60 Varios Sin Etiqueta", fardo: 60 },
  { nombre: "Trapo de piso fallado 50x60 Varios Sin Etiqueta", fardo: 60 },
  { nombre: "Trapo de piso fallado 60x60 Varios Sin Etiqueta", fardo: 60 },
  { nombre: "Trapo de piso fallado 70x60 Varios Sin Etiqueta", fardo: 60 },
  { nombre: "Trapo de piso fallado 80x60 Varios Sin Etiqueta", fardo: 60 },
  { nombre: "Trapo de piso 50x60 Varios", fardo: 60 },
  { nombre: "Trapo de piso 60x60 Varios", fardo: 60 },
  { nombre: "Trapo de piso 70x60 Varios", fardo: 60 },
  { nombre: "Trapo de piso 80x60 Varios", fardo: 60 },
  { nombre: "Retazo 45", fardo: 60 },
  { nombre: "Retazo 50", fardo: 60 },
  { nombre: "Retazo 60", fardo: 60 },
  { nombre: "Retazo 70", fardo: 60 },
  { nombre: "Retazo 80", fardo: 60 },
  { nombre: "Rejilla 45x50 Triple S/E", fardo: 60 },
  { nombre: "Rejilla 40x45 Doble Pesada S/E", fardo: 60 },
  { nombre: "Rejilla 38x40 Doble Liviana S/E", fardo: 60 },
  { nombre: "Rejilla 40x45 Profesional S/E", fardo: 60 }
];

for (const esp of especialesRaw) {
  productos.push({
    nombre: esp.nombre,
    categoria: "Especiales",
    unidadesPorFardo: esp.fardo,
    permiteUnidad: true,
    presentacion: `Fardo / Unidad`,
    descripcion: `Producto especial: ${esp.nombre}`
  });
}

// Write to products.json
fs.writeFileSync(
  path.resolve(__dirname, '../data/productos.json'),
  JSON.stringify(productos, null, 2),
  'utf8'
);

console.log(`Generated data/productos.json with ${productos.length} TML real catalog items.`);
