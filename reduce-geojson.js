// reduce-geojson.js
// Coloca este archivo en la RAÍZ de tu proyecto (donde está package.json)

const fs = require('fs');
const path = require('path');

console.log('🚀 === OPTIMIZADOR DE GEOJSON INPI ===\n');

// ⚙️ CONFIGURACIÓN - Ajusta estas rutas según tu proyecto
const inputFile = './public/data/inpi.geojson';  // Cambia si tu archivo tiene otro nombre
const outputFile = './public/data/inpi-optimized.geojson';

// Verificar que el archivo existe
if (!fs.existsSync(inputFile)) {
  console.error(`❌ ERROR: No se encuentra el archivo: ${inputFile}`);
  console.log('\n💡 Soluciones:');
  console.log('   1. Verifica que el archivo existe');
  console.log('   2. Cambia la ruta en la línea 9 de este script');
  console.log('   3. Ejemplos de rutas comunes:');
  console.log('      - ./public/data/inpi.geojson');
  console.log('      - ./src/data/inpi.geojson');
  process.exit(1);
}

console.log(`📂 Leyendo: ${inputFile}`);

try {
  const data = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
  
  if (!data.features || !Array.isArray(data.features)) {
    console.error('❌ ERROR: El archivo no es un GeoJSON válido');
    process.exit(1);
  }
  
  console.log(`✅ Features originales: ${data.features.length.toLocaleString()}`);
  
  // Campos que NECESITAMOS mantener
  const fieldsToKeep = [
    'ID',           // ID único
    'NOM_ENT',      // Nombre de Entidad
    'NOM_MUN',      // Nombre de Municipio
    'NOM_COM',      // Nombre de Comunidad
    'NOM_LOC',      // Nombre de Localidad
    'Pueblo',       // Pueblo indígena
    'ID_Pueblo',    // ID del pueblo
    'POB',          // Población
    'LONGITUD',     // Coordenada
    'LATITUD'       // Coordenada
  ];
  
  console.log('\n📋 Campos a mantener:', fieldsToKeep.join(', '));
  console.log('\n⏳ Procesando features...\n');
  
  let originalSize = 0;
  let optimizedSize = 0;
  let totalProps = 0;
  let keptProps = 0;
  
  // Procesar cada feature
  data.features = data.features.map((feature, index) => {
    const originalProps = feature.properties || {};
    const propCount = Object.keys(originalProps).length;
    totalProps += propCount;
    
    originalSize += JSON.stringify(originalProps).length;
    
    // Crear objeto optimizado solo con campos necesarios
    const optimizedProps = {};
    fieldsToKeep.forEach(field => {
      if (originalProps.hasOwnProperty(field)) {
        optimizedProps[field] = originalProps[field];
        keptProps++;
      }
    });
    
    optimizedSize += JSON.stringify(optimizedProps).length;
    
    // Mostrar progreso
    if ((index + 1) % 2000 === 0) {
      const percent = ((index + 1) / data.features.length * 100).toFixed(1);
      console.log(`   ⚡ Procesadas: ${(index + 1).toLocaleString()}/${data.features.length.toLocaleString()} (${percent}%)`);
    }
    
    return {
      type: feature.type,
      geometry: feature.geometry,
      properties: optimizedProps
    };
  });
  
  // Crear directorio si no existe
  const outputDir = path.dirname(outputFile);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // Guardar archivo optimizado
  console.log('\n💾 Guardando archivo optimizado...');
  fs.writeFileSync(outputFile, JSON.stringify(data));
  
  // Estadísticas finales
  const originalFileSizeMB = fs.existsSync(inputFile) 
    ? (fs.statSync(inputFile).size / 1024 / 1024).toFixed(2) 
    : 0;
  const finalSizeMB = (fs.statSync(outputFile).size / 1024 / 1024).toFixed(2);
  const reduction = ((1 - optimizedSize / originalSize) * 100).toFixed(1);
  const avgPropsOriginal = (totalProps / data.features.length).toFixed(1);
  const avgPropsOptimized = (keptProps / data.features.length).toFixed(1);
  
  console.log('\n✅ === OPTIMIZACIÓN COMPLETADA ===\n');
  console.log(`📊 Features procesadas: ${data.features.length.toLocaleString()}`);
  console.log(`📉 Reducción de datos: ${reduction}%`);
  console.log(`📦 Tamaño original: ${originalFileSizeMB} MB`);
  console.log(`💾 Tamaño optimizado: ${finalSizeMB} MB`);
  console.log(`🔢 Propiedades por feature: ${avgPropsOriginal} → ${avgPropsOptimized}`);
  console.log(`📁 Archivo guardado en: ${outputFile}\n`);
  console.log('✨ ¡Listo! Ahora actualiza Map.tsx con el código que te di\n');
  
} catch (error) {
  console.error('\n❌ ERROR al procesar el archivo:');
  console.error(error.message);
  console.log('\n💡 Verifica que el archivo sea un GeoJSON válido');
  process.exit(1);
}