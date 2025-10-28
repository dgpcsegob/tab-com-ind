// generate-filters-data.js
// Script para generar archivo ultra-ligero con solo datos de filtros

const fs = require('fs');

console.log('🔄 Generando archivo de datos de filtros...\n');

// Leer el GeoJSON optimizado
const inputFile = './public/data/inpi-optimized.geojson';
const outputFile = './public/data/filters-data.json';

try {
  const geojson = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
  
  console.log(`✅ GeoJSON cargado: ${geojson.features.length} features\n`);
  
  // Extraer datos únicos
  const entidades = new Set();
  const municipiosPorEntidad = {};
  const comunidadesPorMunicipio = {};
  const pueblos = new Set();
  
  geojson.features.forEach((feature, index) => {
    const props = feature.properties || {};
    
    const entidad = String(props.NOM_ENT || '').trim();
    const municipio = String(props.NOM_MUN || '').trim();
    const comunidad = String(props.NOM_COM || props.NOM_LOC || '').trim();
    const pueblo = String(props.Pueblo || '').trim();
    
    // Entidades
    if (entidad) entidades.add(entidad);
    
    // Municipios por entidad
    if (entidad && municipio) {
      if (!municipiosPorEntidad[entidad]) {
        municipiosPorEntidad[entidad] = new Set();
      }
      municipiosPorEntidad[entidad].add(municipio);
    }
    
    // Comunidades por entidad|municipio
    if (entidad && municipio && comunidad) {
      const key = `${entidad}|${municipio}`;
      if (!comunidadesPorMunicipio[key]) {
        comunidadesPorMunicipio[key] = new Set();
      }
      comunidadesPorMunicipio[key].add(comunidad);
    }
    
    // Pueblos
    if (pueblo) pueblos.add(pueblo);
    
    // Mostrar progreso cada 2000 features
    if ((index + 1) % 2000 === 0) {
      console.log(`   Procesadas: ${index + 1}/${geojson.features.length}`);
    }
  });
  
  // Convertir Sets a Arrays y ordenar
  const data = {
    entidades: Array.from(entidades).sort((a, b) => a.localeCompare(b, 'es')),
    municipiosPorEntidad: {},
    comunidadesPorMunicipio: {},
    pueblos: Array.from(pueblos).sort((a, b) => a.localeCompare(b, 'es'))
  };
  
  // Convertir municipios
  Object.keys(municipiosPorEntidad).forEach(entidad => {
    data.municipiosPorEntidad[entidad] = Array.from(municipiosPorEntidad[entidad])
      .sort((a, b) => a.localeCompare(b, 'es'));
  });
  
  // Convertir comunidades
  Object.keys(comunidadesPorMunicipio).forEach(key => {
    data.comunidadesPorMunicipio[key] = Array.from(comunidadesPorMunicipio[key])
      .sort((a, b) => a.localeCompare(b, 'es'));
  });
  
  // Guardar archivo
  fs.writeFileSync(outputFile, JSON.stringify(data, null, 2));
  
  const fileSizeKB = (fs.statSync(outputFile).size / 1024).toFixed(2);
  
  console.log('\n✅ === ARCHIVO GENERADO ===\n');
  console.log(`📊 Entidades: ${data.entidades.length}`);
  console.log(`📊 Pueblos: ${data.pueblos.length}`);
  console.log(`📊 Municipios (total): ${Object.values(data.municipiosPorEntidad).reduce((sum, arr) => sum + arr.length, 0)}`);
  console.log(`📊 Comunidades (total): ${Object.values(data.comunidadesPorMunicipio).reduce((sum, arr) => sum + arr.length, 0)}`);
  console.log(`💾 Tamaño del archivo: ${fileSizeKB} KB`);
  console.log(`📁 Guardado en: ${outputFile}\n`);
  console.log('🎉 ¡Listo! Ahora actualiza el Sidebar para usar este archivo.\n');
  
} catch (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}