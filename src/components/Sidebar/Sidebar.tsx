import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Sidebar, Menu, MenuItem, SubMenu } from 'react-pro-sidebar';
import './Sidebar.css';

// === Parser: ficha HTML de comunidad (campos extra para resumen) ===
interface ParsedFichaExtra {
  poblacionEstimada?: number | null;
  numeroAsentamientos?: number | null;
  formaTenencia?: string | null;
  tipoSegunPueblo?: string | null;
  tipoRelacionHabitat?: string | null;
  pueblosQueConforman?: string[];
  lenguasIndigenas?: string[];
  autoridadesRepresentativas?: string[];
  metodosTomarAcuerdos?: string[];
  principalesActividadesEconomicas?: string[];
  lugaresSagrados?: boolean | null;
  fechasFiestasPrincipales?: string[];
}

interface CommunitySearchResult {
  nombre: string;
  entidad: string;
  municipio: string;
  pueblo: string;
  id: string;
  lat: number;
  lng: number;
}

function parseNumberSpanish(s?: string | null): number | null {
  if (!s) return null;
  const clean = s.replace(/\./g,'').replace(/[,](\d{1,2})\b/, '.$1').replace(/[^\d.]/g,'');
  const n = Number(clean);
  return isFinite(n) ? n : null;
}

function getText(el?: Element | null): string {
  return (el?.textContent || '').replace(/\s+/g,' ').trim();
}

function tableAfterHeading(doc: Document, h: Element, hops = 8): HTMLTableElement | null {
  const row = (h.closest('.row') || h.parentElement) as Element | null;
  let el: Element | null = row;
  for (let i=0;i<hops && el;i++) {
    el = el.nextElementSibling;
    if (!el) break;
    const tbl = el.querySelector('table') as HTMLTableElement | null;
    if (tbl) return tbl;
  }
  return null;
}

function rowsFromTable(tbl: HTMLTableElement | null): string[][] {
  if (!tbl) return [];
  const body = (tbl.querySelector('tbody') || tbl) as HTMLElement;
  const rows: string[][] = [];
  body.querySelectorAll('tr').forEach(tr => {
    const cells = Array.from(tr.querySelectorAll('td,th')).map(td => getText(td));
    if (cells.length) rows.push(cells);
  });
  return rows;
}

function parseFichaExtraFromHtml(html: string): ParsedFichaExtra {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const findH6 = (frag: string) => Array.from(doc.querySelectorAll('h6')).find(h => getText(h).toLowerCase().includes(frag.toLowerCase()));
  const out: ParsedFichaExtra = {};

  // Población estimada
  const estH6 = Array.from(doc.querySelectorAll('h6')).map(getText).find(t => /estimación de la población total/i.test(t));
  if (estH6) {
    const num = estH6.replace(/[^\d.,]/g,'');
    out.poblacionEstimada = parseNumberSpanish(num);
  }

  // Número de asentamientos
  const hAsent = findH6('Número de asentamientos que tiene la comunidad');
  const tblAsent = hAsent ? tableAfterHeading(doc, hAsent) : null;
  if (tblAsent) out.numeroAsentamientos = rowsFromTable(tblAsent).length;

  // Forma de Tenencia (tabla 3 columnas)
const hForma = findH6('Formas de tenencia de la tierra');
if (hForma) {
  // CORRECCIÓN: Buscar la tabla dentro del contenedor padre primero
  let tbl = hForma.closest('.row')?.querySelector('table') as HTMLTableElement | null;
  
  // Si no se encuentra dentro, buscar en hermanos siguientes
  if (!tbl) {
    tbl = tableAfterHeading(doc, hForma);
  }
  
  if (tbl) {
    const rows = rowsFromTable(tbl);
    
    // Filtrar para obtener solo filas de datos (excluir encabezados)
    const dataRows = rows.filter(row => {
      const firstCell = (row[0] || '').toLowerCase();
      // Excluir filas que sean claramente encabezados
      return !firstCell.includes('forma de tenencia') && 
             !firstCell.includes('forma') && 
             firstCell.trim() !== '';
    });
    
    if (dataRows.length > 0) {
      // Extraer TODAS las formas de tenencia de la primera columna
      const formasTenencia = dataRows
        .map(row => row[0])
        .filter(val => val && val.trim() !== '');
      
      // Si hay múltiples valores, unirlos; si hay uno solo, usarlo directamente
      out.formaTenencia = formasTenencia.length > 0 
        ? (formasTenencia.length === 1 ? formasTenencia[0] : formasTenencia.join(', ')) 
        : null;
    }
  }
}
  // Tipo de comunidad (tabla 4 columnas)
  const hTipo = findH6('Tipo de comunidad');
  if (hTipo) {
    const rows = rowsFromTable(tableAfterHeading(doc, hTipo));
    if (rows.length) {
      const r0 = rows[0];
      out.tipoSegunPueblo = r0[0] || null;
      out.tipoRelacionHabitat = r0[2] || null;
    }
  }

  // Pueblos que la conforman
  const hPueblos = findH6('Pueblos que la conforman');
  if (hPueblos) {
    const tblP = tableAfterHeading(doc, hPueblos);
    if (tblP) {
      out.pueblosQueConforman = rowsFromTable(tblP).map(r => r[0]).filter(Boolean);
    } else {
      let el: Element | null = (hPueblos.closest('.row') || hPueblos.parentElement) as Element | null;
      let agg = '';
      for (let i=0;i<4 && el;i++) {
        el = el.nextElementSibling;
        if (!el) break;
        const p = el.querySelector('p');
        if (p) { agg = getText(p); break; }
      }
      if (agg) out.pueblosQueConforman = agg.split(/[,;]+/).map(s => s.trim()).filter(Boolean);
    }
  }

  // Lenguas
  const hLenguas = findH6('Se habla(n) alguna(s) lengua(s)');
  if (hLenguas) {
    const rows = rowsFromTable(tableAfterHeading(doc, hLenguas));
    out.lenguasIndigenas = rows.map(r => r[0]).map(s => s.replace(/^\(|\)$/g,'').replace(/^\((.*?)\)\s*/,'').trim()).filter(Boolean);
  }

  // Autoridades representativas
  const authTbl = Array.from(doc.querySelectorAll('table')).find(tbl => {
    const ths = Array.from(tbl.querySelectorAll('th')).map(getText).map(s=>s.toLowerCase());
    return ths.includes('autoridad') && ths.includes('duración del cargo');
  }) as HTMLTableElement | null | undefined;
  if (authTbl) out.autoridadesRepresentativas = rowsFromTable(authTbl).map(r => r[0]).filter(Boolean);

  // Métodos para tomar acuerdos
  const acuerdosTbl = Array.from(doc.querySelectorAll('table')).find(tbl => {
    const ths = Array.from(tbl.querySelectorAll('th')).map(getText).map(s=>s.toLowerCase());
    return ths.some(h => h.includes('forma en que toman acuerdos'));
  }) as HTMLTableElement | null | undefined;
  if (acuerdosTbl) out.metodosTomarAcuerdos = rowsFromTable(acuerdosTbl).map(r => r[0]).filter(Boolean);

  // Principales actividades económicas
  const econTbl = Array.from(doc.querySelectorAll('table')).find(tbl => {
    const ths = Array.from(tbl.querySelectorAll('th')).map(getText).map(s=>s.toLowerCase());
    return ths.some(h => h.includes('principales actividades económicas en la comunidad'));
  }) as HTMLTableElement | null | undefined;
  if (econTbl) out.principalesActividadesEconomicas = rowsFromTable(econTbl).map(r => r[0]).filter(Boolean);

  // Lugares sagrados (Sí/No)
  const hLug = Array.from(doc.querySelectorAll('h6')).find(h => /en la comunidad hay lugares sagrados/i.test(getText(h)));
  if (hLug) {
    const m = getText(hLug).match(/:\s*(sí|si|no)\b/i);
    out.lugaresSagrados = m ? /^s[ií]$/i.test(m[1]) : null;
  }

  // Fiestas principales (tabla "Fiesta, celebración o ritual")
  const fiestasTbl = Array.from(doc.querySelectorAll('table')).find(tbl => {
    const ths = Array.from(tbl.querySelectorAll('th')).map(getText).map(s=>s.toLowerCase());
    return ths.some(h => h.includes('fiesta, celebración') || h.includes('fiesta, celebracion'));
  }) as HTMLTableElement | null | undefined;
  if (fiestasTbl) {
    const rows = rowsFromTable(fiestasTbl);
    out.fechasFiestasPrincipales = rows.map(r => {
      const nom = r[0] || '';
      const fecha = r[2] || r[1] || '';
      return (nom && fecha) ? `${nom} — ${fecha}` : (nom || fecha);
    }).filter(Boolean);
  }

  return out;
}

interface SidebarProps {
  layersVisibility: { [layerId: string]: boolean };
  onToggle: (id: string) => void;
  onFilterChange: (filters: FilterState) => void;
  selectedCommunity: CommunityData | null;
  isDarkTheme: boolean;
  onThemeToggle: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onOpenHtmlViewer: (communityId: string, communityName: string) => void;
  onClearSelectedCommunity: () => void;
  extractedData: ExtractedData | null;
  // PROPS para manejar highlight
  onCommunityHighlight?: (communityInfo: string | { nombre: string; entidad?: string; municipio?: string; id?: string }) => void;
  onCommunityUnhighlight?: () => void;
  // NUEVA PROP: para recibir filtros desde el mapa
  externalFilters?: Partial<FilterState>;
  onCommunitySelect?: (communityData: CommunityData) => void;
  
}

interface FilterState {
  entidad: string;
  municipio: string;
  comunidad: string;
  pueblo: string;
}

interface CommunityData {
  id: string;
  nombre: string;
  entidad: string;
  municipio: string;
  pueblo: string;
  poblacion: number;
  latitud: number;        // ✅ AGREGAR
  longitud: number;       // ✅ AGREGAR
  htmlUrl?: string;
}

interface ExtractedData {
  entidades: Set<string>;
  municipiosPorEntidad: Map<string, Set<string>>;
  comunidadesPorMunicipio: Map<string, Set<string>>;
  pueblos: Set<string>;
  features: any[];
}

const CustomSidebar: React.FC<SidebarProps> = ({
  // layersVisibility,
  // onToggle,
  onFilterChange,
  selectedCommunity,
  isDarkTheme,
  // onThemeToggle,
  collapsed,
  onToggleCollapse,
  onOpenHtmlViewer,
  onClearSelectedCommunity,
  extractedData,
  // PROPS para highlight
  onCommunityHighlight,
  onCommunityUnhighlight,
  // NUEVA PROP
  externalFilters,
  onCommunitySelect
}) => {
  // === Estado/efecto para cargar ficha HTML de comunidad seleccionada ===
  const [parsedFichaExtra, setParsedFichaExtra] = useState<ParsedFichaExtra | null>(null);
  useEffect(() => {
    let cancel = false;
    async function run() {
      setParsedFichaExtra(null);
      const url = selectedCommunity?.htmlUrl;
      if (!url) return;
      try {
        const res = await fetch(url, { cache: 'no-store' });
        const html = await res.text();
        if (!cancel) setParsedFichaExtra(parseFichaExtraFromHtml(html));
      } catch {
        if (!cancel) setParsedFichaExtra(null);
      }
    }
    run();
    return () => { cancel = true; };
  }, [selectedCommunity?.htmlUrl]);

  const [filters, setFilters] = useState<FilterState>({
    entidad: '',
    municipio: '',
    comunidad: '',
    pueblo: ''
  });

  const [filtersData, setFiltersData] = useState<{
  entidades: string[];
  municipiosPorEntidad: { [key: string]: string[] };
  comunidadesPorMunicipio: { [key: string]: string[] };
  pueblos: string[];
} | null>(null);

  const [searchTerms, setSearchTerms] = useState({
    entidad: '',
    municipio: '',
    comunidad: '',
    pueblo: ''
  });

  const [showDropdowns, setShowDropdowns] = useState({
    entidad: false,
    municipio: false,
    comunidad: false,
    pueblo: false
  });

        const [communitySearch, setCommunitySearch] = useState('');
        const [communitySearchResults, setCommunitySearchResults] = useState<CommunitySearchResult[]>([]);
        const [showCommunitySearchDropdown, setShowCommunitySearchDropdown] = useState(false);
        const communitySearchRef = useRef<HTMLInputElement | null>(null);



      const allCommunities = useMemo(() => {
        if (!extractedData) return [];
        
        const communitiesMap = new Map<string, CommunitySearchResult>();
        
        extractedData.features.forEach(feature => {
          const props = feature.properties || {};
          const coords = feature.geometry?.coordinates || [0, 0];
          const comunidad = props.NOM_COM || props.NOM_LOC;
          const entidad = props.NOM_ENT || '';
          const municipio = props.NOM_MUN || '';
          const pueblo = props.Pueblo || '';
          const id = String(props.ID || '');
          
          if (comunidad) {
            // Crear clave única: nombre|entidad|municipio
            const uniqueKey = `${comunidad}|${entidad}|${municipio}`;
            
            if (!communitiesMap.has(uniqueKey)) {
              communitiesMap.set(uniqueKey, {
                nombre: comunidad,
                entidad: entidad,
                municipio: municipio,
                pueblo: pueblo,
                id: id,
                lat: coords[1],
                lng: coords[0]
              });
            }
          }
        });
        
        // Convertir a array y ordenar por nombre
        return Array.from(communitiesMap.values()).sort((a, b) => 
          a.nombre.localeCompare(b.nombre, 'es')
        );
      }, [extractedData]);



  // Referencias para los inputs y dropdowns
  const inputRefs = useRef<{[key: string]: HTMLInputElement | null}>({
    entidad: null,
    municipio: null,
    comunidad: null,
    pueblo: null
  });

useEffect(() => {
  if (!communitySearch || communitySearch.trim() === '') {
    setCommunitySearchResults([]);
    setShowCommunitySearchDropdown(false);
    return;
  }
  
  const searchTerm = communitySearch.toLowerCase();
  const results = allCommunities.filter(community => {
    const nombreMatch = community.nombre.toLowerCase().includes(searchTerm);
    const entidadMatch = community.entidad.toLowerCase().includes(searchTerm);
    const municipioMatch = community.municipio.toLowerCase().includes(searchTerm);
    
    return nombreMatch || entidadMatch || municipioMatch;
  }).slice(0, 150); // Limitar a 20 resultados
  
  setCommunitySearchResults(results);
  setShowCommunitySearchDropdown(results.length > 0);
}, [communitySearch, allCommunities]);



  useEffect(() => {
  if (!communitySearch || communitySearch.trim() === '') {
    setCommunitySearchResults([]);
    setShowCommunitySearchDropdown(false);
    return;
  }
  
  const searchTerm = communitySearch.toLowerCase();
  const results = allCommunities.filter(community => {
  const nombreMatch = community.nombre.toLowerCase().includes(searchTerm);
  const entidadMatch = community.entidad.toLowerCase().includes(searchTerm);
  const municipioMatch = community.municipio.toLowerCase().includes(searchTerm);
  
  return nombreMatch || entidadMatch || municipioMatch;
}).slice(0, 150);
  
  setCommunitySearchResults(results);
  setShowCommunitySearchDropdown(results.length > 0);
}, [communitySearch, allCommunities]);

  // ✅ NUEVO: Detectar cuando selectedCommunity cambia


    useEffect(() => {
  async function loadFiltersData() {
    try {
      console.log('📥 Cargando datos de filtros...');
      const response = await fetch(`${process.env.PUBLIC_URL}/data/filters-data.json`);
      if (!response.ok) throw new Error('No se pudo cargar');
      const data = await response.json();
      setFiltersData(data);
      console.log(`✅ Filtros cargados: ${data.entidades.length} entidades`);
    } catch (error) {
      console.error('❌ Error:', error);
    }
  }
  loadFiltersData();
}, []);

useEffect(() => {
  console.log('🔔 Sidebar detectó cambio en selectedCommunity:', selectedCommunity);
  if (selectedCommunity) {
    console.log('✅ Sidebar mostrará resumen para:', selectedCommunity.nombre);
  } else {
    console.log('❌ Sidebar: selectedCommunity es null, NO mostrará resumen');
  }
}, [selectedCommunity])

  // NUEVO: Efecto para procesar filtros externos (desde el mapa)
  useEffect(() => {
    if (externalFilters && extractedData) {
      console.log('Recibiendo filtros desde el mapa:', externalFilters);
      
      const newFilters = {
        entidad: externalFilters.entidad || '',
        municipio: externalFilters.municipio || '',
        comunidad: externalFilters.comunidad || '',
        pueblo: externalFilters.pueblo || ''
      };
      
      // Validar que los filtros sean válidos antes de aplicarlos
      const validatedFilters = validateFilters(newFilters);
      
      console.log('Aplicando filtros validados desde el mapa:', validatedFilters);
      setFilters(validatedFilters);
      
      // Limpiar términos de búsqueda para mostrar el valor seleccionado
      setSearchTerms({
        entidad: '',
        municipio: '',
        comunidad: '',
        pueblo: ''
      });
      
      // Cerrar todos los dropdowns
      setShowDropdowns({
        entidad: false,
        municipio: false,
        comunidad: false,
        pueblo: false
      });
      
      // Propagar inmediatamente los filtros al mapa para confirmar
      setTimeout(() => {
        onFilterChange(validatedFilters);
        console.log('Filtros confirmados desde sidebar hacia mapa:', validatedFilters);
      }, 100);
    }
  }, [externalFilters, extractedData, onFilterChange]);

  // === Función de validación de filtros ===
  const validateFilters = useCallback((currentFilters: FilterState) => {
    if (!extractedData) return currentFilters;
    let validatedFilters = { ...currentFilters };
    let changed = false;

    // Validar entidad
    if (validatedFilters.entidad && !extractedData.entidades.has(validatedFilters.entidad)) {
      console.warn(`Entidad "${validatedFilters.entidad}" no existe en datos`);
      validatedFilters.entidad = '';
      validatedFilters.municipio = '';
      validatedFilters.comunidad = '';
      changed = true;
    }

    // Validar municipio
    if (validatedFilters.entidad && validatedFilters.municipio) {
      const municipios = extractedData.municipiosPorEntidad.get(validatedFilters.entidad) || new Set();
      if (!municipios.has(validatedFilters.municipio)) {
        console.warn(`Municipio "${validatedFilters.municipio}" no existe en entidad "${validatedFilters.entidad}"`);
        validatedFilters.municipio = '';
        validatedFilters.comunidad = '';
        changed = true;
      }
    }

    // Validar comunidad
    if (validatedFilters.entidad && validatedFilters.municipio && validatedFilters.comunidad) {
      const key = `${validatedFilters.entidad}|${validatedFilters.municipio}`;
      const comunidades = extractedData.comunidadesPorMunicipio.get(key) || new Set();
      if (!comunidades.has(validatedFilters.comunidad)) {
        console.warn(`Comunidad "${validatedFilters.comunidad}" no existe en "${key}"`);
        validatedFilters.comunidad = '';
        changed = true;
      }
    }

    // Validar pueblo
    if (validatedFilters.pueblo && !extractedData.pueblos.has(validatedFilters.pueblo)) {
      console.warn(`Pueblo "${validatedFilters.pueblo}" no existe en datos`);
      validatedFilters.pueblo = '';
      changed = true;
    }

    if (changed) {
      console.log(`Filtros corregidos automáticamente:`, validatedFilters);
    }
    return validatedFilters;
  }, [extractedData]);



const handleCommunitySearchSelect = useCallback((communityResult: CommunitySearchResult) => {
  if (!extractedData) return;
  
  console.log('🔍 Seleccionando comunidad desde búsqueda:', communityResult);
  
  // Actualizar filtros con la información completa
  const newFilters = {
    entidad: communityResult.entidad,
    municipio: communityResult.municipio,
    comunidad: communityResult.nombre,
    pueblo: communityResult.pueblo
  };
  
  setFilters(newFilters);
  setCommunitySearch('');
  setShowCommunitySearchDropdown(false);
  
  // Crear objeto CommunityData completo
  const communityData: CommunityData = {
    id: communityResult.id,
    nombre: communityResult.nombre,
    entidad: communityResult.entidad,
    municipio: communityResult.municipio,
    pueblo: communityResult.pueblo,
    poblacion: 0, // Se puede buscar si es necesario
    latitud: communityResult.lat,
    longitud: communityResult.lng,
    htmlUrl: communityResult.id ? `${process.env.PUBLIC_URL || ''}/fichas/${communityResult.id}.html` : undefined
  };
  
  console.log('📍 Datos de comunidad:', communityData);
  
  // Propagar al mapa
  onFilterChange(newFilters);
  
  // Highlight en el mapa - MODIFICADO: Pasar información completa de ubicación
  if (onCommunityHighlight) {
    onCommunityHighlight({
      nombre: communityResult.nombre,
      entidad: communityResult.entidad,
      municipio: communityResult.municipio
    });
  }
  
  // Notificar selección de comunidad (para mostrar resumen)
  if (onCommunitySelect) {
    console.log('📢 Notificando selección a App...');
    onCommunitySelect(communityData);
  }
  
  // Disparar evento para mostrar asentamientos
  if (communityResult.id && communityResult.lng && communityResult.lat) {
    console.log('🗺️ Disparando evento show-asentamientos:', { 
      communityId: communityResult.id, 
      lat: communityResult.lat, 
      lng: communityResult.lng 
    });
    window.dispatchEvent(new CustomEvent('show-asentamientos', {
      detail: { 
        communityId: communityResult.id, 
        lat: communityResult.lat, 
        lng: communityResult.lng 
      }
    }));
  }
}, [extractedData, onFilterChange, onCommunityHighlight, onCommunitySelect]);

  // === synchronizeFilters - Lógica bidireccional SIN autocompletar forzado ===
  const synchronizeFilters = useCallback((
    field: keyof FilterState, 
    value: string,
    currentFilters: FilterState
  ): FilterState => {
    if (!extractedData) return currentFilters;
    let newFilters = { ...currentFilters, [field]: value };
    console.log(`Sincronizando filtros: ${field} = "${value}"`);

    // Lógica jerárquica tradicional (entidad → municipio → comunidad)
    if (field === 'entidad') {
      newFilters.municipio = '';
      newFilters.comunidad = '';
      console.log(`Entidad cambiada, limpiando municipio y comunidad`);
      // Si hay un pueblo seleccionado, verificar si es compatible con la nueva entidad
      if (newFilters.pueblo) {
        const esPuebloCompatible = extractedData.features.some(feature => {
          const props = feature.properties || {};
          return props.NOM_ENT === value && props.Pueblo === newFilters.pueblo;
        });
        if (!esPuebloCompatible) {
          console.log(`Pueblo "${newFilters.pueblo}" no compatible con entidad "${value}", limpiando pueblo`);
          newFilters.pueblo = '';
        }
      }
    } else if (field === 'municipio') {
      newFilters.comunidad = '';
      console.log(`Municipio cambiado, limpiando comunidad`);
      // Si hay un pueblo seleccionado, verificar compatibilidad
      if (newFilters.pueblo && newFilters.entidad) {
        const esPuebloCompatible = extractedData.features.some(feature => {
          const props = feature.properties || {};
          return props.NOM_ENT === newFilters.entidad && 
                 props.NOM_MUN === value && 
                 props.Pueblo === newFilters.pueblo;
        });
        if (!esPuebloCompatible) {
          console.log(`Pueblo "${newFilters.pueblo}" no compatible con "${newFilters.entidad} > ${value}", limpiando pueblo`);
          newFilters.pueblo = '';
        }
      }
    } else if (field === 'comunidad') {
      // Si hay un pueblo seleccionado, verificar compatibilidad
      if (newFilters.pueblo && newFilters.entidad && newFilters.municipio) {
        const esPuebloCompatible = extractedData.features.some(feature => {
          const props = feature.properties || {};
          const comunidad = props.NOM_COM || props.NOM_LOC;
          return props.NOM_ENT === newFilters.entidad && 
                 props.NOM_MUN === newFilters.municipio && 
                 comunidad === value && 
                 props.Pueblo === newFilters.pueblo;
        });
        if (!esPuebloCompatible) {
          console.log(`Pueblo "${newFilters.pueblo}" no compatible con la comunidad seleccionada, limpiando pueblo`);
          newFilters.pueblo = '';
        }
      }
    }

    // === LÓGICA BIDIRECCIONAL CORREGIDA: Manejo de pueblo SIN autocompletar ===
    if (field === 'pueblo') {
      if (value && value.trim() !== '') {
        // Solo verificar compatibilidad, NO autocompletar
        const { entidad, municipio, comunidad } = newFilters;
        
        if (entidad || municipio || comunidad) {
          // Verificar si los filtros jerárquicos actuales son compatibles con el pueblo
          const esPuebloCompatible = extractedData.features.some(feature => {
            const props = feature.properties || {};
            const featureComunidad = props.NOM_COM || props.NOM_LOC;
            const matchesEntidad = !entidad || props.NOM_ENT === entidad;
            const matchesMunicipio = !municipio || props.NOM_MUN === municipio;
            const matchesComunidad = !comunidad || featureComunidad === comunidad;
            return matchesEntidad && matchesMunicipio && matchesComunidad && props.Pueblo === value;
          });
          
          if (esPuebloCompatible) {
            console.log(`Pueblo "${value}" es compatible con filtros jerárquicos actuales`);
            // Mantener filtros jerárquicos existentes
          } else {
            console.log(`Pueblo "${value}" no es compatible con filtros jerárquicos, limpiando campos incompatibles`);
            // Solo limpiar campos incompatibles, NO autocompletar
            if (entidad) {
              const entidadCompatible = extractedData.features.some(feature => {
                const props = feature.properties || {};
                return props.NOM_ENT === entidad && props.Pueblo === value;
              });
              if (!entidadCompatible) {
                newFilters.entidad = '';
                newFilters.municipio = '';
                newFilters.comunidad = '';
              }
            }
            
            if (newFilters.entidad && municipio) {
              const municipioCompatible = extractedData.features.some(feature => {
                const props = feature.properties || {};
                return props.NOM_ENT === newFilters.entidad && 
                       props.NOM_MUN === municipio && 
                       props.Pueblo === value;
              });
              if (!municipioCompatible) {
                newFilters.municipio = '';
                newFilters.comunidad = '';
              }
            }
            
            if (newFilters.entidad && newFilters.municipio && comunidad) {
              const comunidadCompatible = extractedData.features.some(feature => {
                const props = feature.properties || {};
                const featureComunidad = props.NOM_COM || props.NOM_LOC;
                return props.NOM_ENT === newFilters.entidad && 
                       props.NOM_MUN === newFilters.municipio && 
                       featureComunidad === comunidad && 
                       props.Pueblo === value;
              });
              if (!comunidadCompatible) {
                newFilters.comunidad = '';
              }
            }
          }
        } else {
          console.log(`Pueblo "${value}" seleccionado sin filtros jerárquicos previos - listo para filtrar`);
        }
      } else {
        // Al limpiar el pueblo, mantener filtros jerárquicos actuales
        console.log(`Pueblo limpiado - manteniendo filtros jerárquicos actuales`);
      }
    }

    // === Lógica de limpieza inteligente ===
    // Si se limpian TODOS los filtros, asegurar estado limpio
    const hasAnyFilter = newFilters.entidad || newFilters.municipio || newFilters.comunidad || newFilters.pueblo;
    if (!hasAnyFilter) {
      console.log(`Todos los filtros limpiados - estado completamente limpio`);
      newFilters = {
        entidad: '',
        municipio: '',
        comunidad: '',
        pueblo: ''
      };
    }

    return newFilters;
  }, [extractedData]);

  // Función para posicionar dinámicamente los dropdowns
  const positionDropdown = useCallback((field: keyof typeof showDropdowns) => {
    setTimeout(() => {
      const dropdown = document.querySelector(`.dropdown-${field}`) as HTMLElement;
      const input = inputRefs.current[field];
      if (dropdown && input) {
        const rect = input.getBoundingClientRect();
        const viewportHeight = window.innerHeight;
        const dropdownHeight = parseInt(getComputedStyle(dropdown).maxHeight) || 240;
        // Calcular si hay espacio suficiente abajo
        const spaceBelow = viewportHeight - rect.bottom - 10;
        const spaceAbove = rect.top - 10;
        let top: number;
        if (spaceBelow >= dropdownHeight || spaceBelow >= spaceAbove) {
          // Mostrar abajo del input
          top = rect.bottom + 4;
        } else {
          // Mostrar arriba del input
          top = rect.top - dropdownHeight - 4;
        }
        // Asegurar que no se salga de la pantalla
        top = Math.max(10, Math.min(top, viewportHeight - dropdownHeight - 10));
        dropdown.style.top = `${top}px`;
        dropdown.style.left = `${rect.left}px`;
        dropdown.style.width = `${rect.width}px`;
        dropdown.style.maxWidth = `${Math.min(rect.width, 350)}px`;
      }
    }, 0);
  }, []);

  // Función para obtener ubicaciones de un pueblo específico
  const getPuebloLocations = useCallback((puebloName: string) => {
    if (!extractedData || !puebloName) return [];
    const locations = extractedData.features
      .filter(feature => {
        const props = feature.properties || {};
        return props.Pueblo === puebloName;
      })
      .map(feature => {
        const props = feature.properties || {};
        return {
          entidad: props.NOM_ENT || '',
          municipio: props.NOM_MUN || '',
          comunidad: props.NOM_COM || props.NOM_LOC || '',
          coordinates: feature.geometry?.coordinates || [0, 0]
        };
      });
    // Eliminar duplicados basado en entidad+municipio+comunidad
    const unique = locations.filter((location, index, array) => {
      const key = `${location.entidad}|${location.municipio}|${location.comunidad}`;
      return array.findIndex(l => `${l.entidad}|${l.municipio}|${l.comunidad}` === key) === index;
    });
    return unique;
  }, [extractedData]);

  // Procesar datos
  const sortedEntidades = useMemo(() => {

    if (filtersData && !filters.pueblo) {
    return filtersData.entidades;
  }
    if (!extractedData) return [];
    
    // Si hay un pueblo seleccionado, mostrar solo entidades donde existe ese pueblo
    if (filters.pueblo) {
      const entidadesConPueblo = new Set<string>();
      extractedData.features.forEach(feature => {
        const props = feature.properties || {};
        if (props.Pueblo === filters.pueblo && props.NOM_ENT) {
          entidadesConPueblo.add(props.NOM_ENT);
        }
      });
      const sorted = Array.from(entidadesConPueblo).sort((a, b) => a.localeCompare(b, 'es'));
      console.log(`Entidades donde existe "${filters.pueblo}": ${sorted.length}`);
      return sorted;
    }
    
    // Si no hay pueblo seleccionado, mostrar todas las entidades
    const entidades = Array.from(extractedData.entidades).sort((a, b) => a.localeCompare(b, 'es'));
    console.log(`Entidades disponibles: ${entidades.length}`);
    return entidades;
  }, [extractedData, filters.pueblo]);

  const sortedMunicipios = useMemo(() => {

    if (filtersData && filters.entidad && !filters.pueblo) {
    return filtersData.municipiosPorEntidad[filters.entidad] || [];
  }
  

    if (!extractedData || !filters.entidad) return [];
    
    // Si hay un pueblo seleccionado, mostrar solo municipios donde existe ese pueblo en la entidad
    if (filters.pueblo) {
      const municipiosConPueblo = new Set<string>();
      extractedData.features.forEach(feature => {
        const props = feature.properties || {};
        if (props.Pueblo === filters.pueblo && 
            props.NOM_ENT === filters.entidad && 
            props.NOM_MUN) {
          municipiosConPueblo.add(props.NOM_MUN);
        }
      });
      const sorted = Array.from(municipiosConPueblo).sort((a, b) => a.localeCompare(b, 'es'));
      console.log(`Municipios donde existe "${filters.pueblo}" en "${filters.entidad}": ${sorted.length}`);
      return sorted;
    }
    
    // Si no hay pueblo seleccionado, usar lógica normal
    const municipios = extractedData.municipiosPorEntidad.get(filters.entidad) || new Set();
    const sorted = Array.from(municipios).sort((a, b) => a.localeCompare(b, 'es'));
    console.log(`Municipios en "${filters.entidad}": ${sorted.length}`);
    return sorted;
  }, [extractedData, filters.entidad, filters.pueblo]);

  const sortedComunidades = useMemo(() => {
    if (!extractedData || !filters.entidad || !filters.municipio) return [];

    
    
    // Si hay un pueblo seleccionado, mostrar solo comunidades donde existe ese pueblo
    if (filters.pueblo) {
      const comunidadesConPueblo = new Set<string>();
      extractedData.features.forEach(feature => {
        const props = feature.properties || {};
        const comunidad = props.NOM_COM || props.NOM_LOC;
        if (props.Pueblo === filters.pueblo && 
            props.NOM_ENT === filters.entidad && 
            props.NOM_MUN === filters.municipio && 
            comunidad) {
          comunidadesConPueblo.add(comunidad);
        }
      });
      const sorted = Array.from(comunidadesConPueblo).sort((a, b) => a.localeCompare(b, 'es'));
      console.log(`Comunidades donde existe "${filters.pueblo}" en "${filters.entidad} > ${filters.municipio}": ${sorted.length}`);
      return sorted;
    }
    
    // Si no hay pueblo seleccionado, usar lógica normal
    const key = `${filters.entidad}|${filters.municipio}`;
    const comunidades = extractedData.comunidadesPorMunicipio.get(key) || new Set();
    const sorted = Array.from(comunidades).sort((a, b) => a.localeCompare(b, 'es'));
    console.log(`Comunidades en "${filters.municipio}": ${sorted.length}`);
    return sorted;
  }, [extractedData, filters.entidad, filters.municipio, filters.pueblo]);

  // filteredPueblosByHierarchy por filtros jerárquicos
  const filteredPueblosByHierarchy = useMemo(() => {
    if (!extractedData) return [];
    const { entidad, municipio, comunidad } = filters;
    
    // Si NO hay filtros jerárquicos, mostrar TODOS los pueblos
    if (!entidad && !municipio && !comunidad) {
      const allPueblos = Array.from(extractedData.pueblos).sort((a, b) => a.localeCompare(b, 'es'));
      console.log(`Mostrando todos los pueblos: ${allPueblos.length}`);
      return allPueblos;
    }
    
    // Si hay filtros jerárquicos, filtrar pueblos que existen en esas ubicaciones
    const pueblos = new Set<string>();

    extractedData.features.forEach(feature => {
      const props = feature.properties || {};
      const featureEntidad = props.NOM_ENT;
      const featureMunicipio = props.NOM_MUN;
      const featureComunidad = props.NOM_COM || props.NOM_LOC;
      const featurePueblo = props.Pueblo;

      const matchesEntidad = !entidad || featureEntidad === entidad;
      const matchesMunicipio = !municipio || featureMunicipio === municipio;
      const matchesComunidad = !comunidad || featureComunidad === comunidad;

      if (matchesEntidad && matchesMunicipio && matchesComunidad && featurePueblo) {
        pueblos.add(featurePueblo);
      }
    });

    const sorted = Array.from(pueblos).sort((a, b) => a.localeCompare(b, 'es'));
    console.log(`Pueblos filtrados por jerarquía: ${sorted.length}`);
    return sorted;
  }, [extractedData, filters.entidad, filters.municipio, filters.comunidad]);

  // Filtrar opciones basado en búsqueda
  const filteredEntidades = useMemo(() => {
    if (!searchTerms.entidad) return sortedEntidades;
    const term = searchTerms.entidad.toLowerCase();
    return sortedEntidades.filter(e => e.toLowerCase().includes(term));
  }, [sortedEntidades, searchTerms.entidad]);

  const filteredMunicipios = useMemo(() => {
    if (!searchTerms.municipio) return sortedMunicipios;
    const term = searchTerms.municipio.toLowerCase();
    return sortedMunicipios.filter(m => m.toLowerCase().includes(term));
  }, [sortedMunicipios, searchTerms.municipio]);

  const filteredComunidades = useMemo(() => {
    if (!searchTerms.comunidad) return sortedComunidades;
    const term = searchTerms.comunidad.toLowerCase();
    return sortedComunidades.filter(c => c.toLowerCase().includes(term));
  }, [sortedComunidades, searchTerms.comunidad]);

  // Usar filteredPueblosByHierarchy aquí
  const filteredPueblos = useMemo(() => {
    if (!searchTerms.pueblo) return filteredPueblosByHierarchy;
    const term = searchTerms.pueblo.toLowerCase();
    return filteredPueblosByHierarchy.filter(p => p.toLowerCase().includes(term));
  }, [filteredPueblosByHierarchy, searchTerms.pueblo]);

  // getFilteredCount mejorado
  const getFilteredCount = useMemo(() => {
    if (!extractedData) return 0;
    const filtered = extractedData.features.filter(feature => {
      const props = feature.properties || {};
      // Aplicar filtros jerárquicos
      if (filters.entidad && filters.entidad.trim() !== '') {
        if (props.NOM_ENT !== filters.entidad) return false;
      }
      if (filters.municipio && filters.municipio.trim() !== '') {
        if (props.NOM_MUN !== filters.municipio) return false;
      }
      if (filters.comunidad && filters.comunidad.trim() !== '') {
        const comunidad = props.NOM_COM || props.NOM_LOC;
        if (comunidad !== filters.comunidad) return false;
      }
      // Aplicar filtro de pueblo
      if (filters.pueblo && filters.pueblo.trim() !== '') {
        if (props.Pueblo !== filters.pueblo) return false;
      }
      return true;
    });
    console.log(`Comunidades filtradas: ${filtered.length} de ${extractedData.features.length}`);
    return filtered.length;
  }, [extractedData, filters]);

  // Mostrar información cuando se selecciona un pueblo
  useEffect(() => {
    if (filters.pueblo && extractedData) {
      const locations = getPuebloLocations(filters.pueblo);
      console.log(`"${filters.pueblo}" encontrado en ${locations.length} ubicaciones:`, locations);
    }
  }, [filters.pueblo, getPuebloLocations, extractedData]);

  // useEffect para validar filtros cuando cambian los datos
  useEffect(() => {
    if (extractedData) {
      const validatedFilters = validateFilters(filters);
      // Solo actualizar si hay cambios
      const needsUpdate = Object.keys(filters).some(
        key => filters[key as keyof FilterState] !== validatedFilters[key as keyof FilterState]
      );
      if (needsUpdate) {
        console.log(`Actualizando filtros con datos validados`);
        setFilters(validatedFilters);
        // Asegurar que se propague al mapa
        setTimeout(() => {
          onFilterChange(validatedFilters);
        }, 150);
      }
      console.log(`Datos extraídos correctamente:`, {
        entidades: extractedData.entidades.size,
        pueblos: extractedData.pueblos.size,
        totalFeatures: extractedData.features.length
      });
    }
  }, [extractedData, validateFilters]);

  // Hook de debugging para monitorear cambios
  useEffect(() => {
    console.log(`Estado de filtros actualizado:`, filters);
    console.log(`Conteo actual: ${getFilteredCount}`);
  }, [filters, getFilteredCount]);

  // Cerrar dropdowns al hacer scroll o redimensionar
  useEffect(() => {
    const closeAllDropdowns = () => {
      setShowDropdowns({
        entidad: false,
        municipio: false,
        comunidad: false,
        pueblo: false
      });
    };
    const handleScroll = (event: Event) => {
      const target = event.target as Element;
      if (target && target.closest('.dropdown-list')) {
        return;
      }
      closeAllDropdowns();
    };
    const handleWheel = (event: WheelEvent) => {
      const target = event.target as Element;
      if (target && target.closest('.dropdown-list')) {
        return;
      }
      closeAllDropdowns();
    };
    const handleResize = () => {
      closeAllDropdowns();
    };
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      if (!target.closest('.custom-select') && !target.closest('.dropdown-list')) {
        closeAllDropdowns();
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeAllDropdowns();
      }
    };
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('wheel', handleWheel, true);
    window.addEventListener('resize', handleResize);
    document.addEventListener('click', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('scroll', handleScroll, true);
    document.addEventListener('wheel', handleWheel, true);
    const sidebarContent = document.querySelector('.sidebar-content');
    if (sidebarContent) {
      sidebarContent.addEventListener('scroll', handleScroll, true);
      sidebarContent.addEventListener('wheel', handleWheel, true);
    }
    return () => {
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('wheel', handleWheel, true);
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('click', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('scroll', handleScroll, true);
      document.removeEventListener('wheel', handleWheel, true);
      if (sidebarContent) {
        sidebarContent.removeEventListener('scroll', handleScroll, true);
        sidebarContent.removeEventListener('wheel', handleWheel, true);
      }
    };
  }, []);

  // Limpiar filtros dependientes
  useEffect(() => {
    if (filters.entidad) {
      const prevMunicipio = filters.municipio;
      if (prevMunicipio && !sortedMunicipios.includes(prevMunicipio)) {
        setFilters(prev => ({ ...prev, municipio: '', comunidad: '' }));
      }
    }
  }, [filters.entidad, sortedMunicipios]);

  useEffect(() => {
    if (filters.municipio) {
      const prevComunidad = filters.comunidad;
      if (prevComunidad && !sortedComunidades.includes(prevComunidad)) {
        setFilters(prev => ({ ...prev, comunidad: '' }));
      }
    }
  }, [filters.municipio, sortedComunidades]);

  // MEJORADO: useEffect de propagación con limpieza forzada
  useEffect(() => {
    // Verificar estado de limpieza
    const isClean = !filters.entidad && !filters.municipio && !filters.comunidad && !filters.pueblo;
    
    // CORRECCIÓN: Propagación mejorada con múltiples llamadas
    const timeoutId = setTimeout(() => {
      onFilterChange(filters);
      console.log(`Filtros propagados (principal):`, filters);
      
      if (isClean) {
        console.log(`ESTADO LIMPIO - Forzando segunda propagación...`);
        // NUEVO: Limpiar highlight cuando se limpia todo
        if (onCommunityUnhighlight) {
          onCommunityUnhighlight();
        }
        // Segunda propagación para estado limpio
        setTimeout(() => {
          onFilterChange(filters);
          console.log(`Filtros propagados (limpieza confirmada):`, filters);
        }, 1000);
      }
    }, 100000);
    
    return () => clearTimeout(timeoutId);
  }, [filters, onFilterChange, onCommunityUnhighlight]);

  // CORRECCIÓN: handleFilterChange con mejor logging
const handleFilterChange = (field: keyof FilterState, value: string) => {
  console.log(`handleFilterChange: ${field} -> "${value}"`);
  console.log(`Estado actual:`, filters);
  
  if (value === '' || value.trim() === '') {
    console.log(`LIMPIANDO CAMPO: ${field}`);
    
    if (field === 'comunidad' && onCommunityUnhighlight) {
      onCommunityUnhighlight();
    }
  }
  
  const syncedFilters = synchronizeFilters(field, value, filters);
  console.log(`Estado sincronizado:`, syncedFilters);
  setFilters(syncedFilters);
  setShowDropdowns(prev => ({ ...prev, [field]: false }));
  setSearchTerms(prev => ({ ...prev, [field]: '' }));
  
  // ✅ NUEVO: Si se seleccionó una comunidad, buscar sus datos y notificar a App
  if (field === 'comunidad' && value && value.trim() !== '' && extractedData && onCommunitySelect) {
    // Buscar la feature completa de esta comunidad
    const feature = extractedData.features.find(f => {
      const props = f.properties || {};
      const comunidadName = props.NOM_COM || props.NOM_LOC;
      return comunidadName === value;
    });
    
    if (feature) {
      const props = feature.properties || {};
      const coords = feature.geometry?.coordinates || [0, 0];
      
      const communityData: CommunityData = {
        id: String(props.ID || ''),
        nombre: value,
        entidad: syncedFilters.entidad || props.NOM_ENT || '',
        municipio: syncedFilters.municipio || props.NOM_MUN || '',
        pueblo: props.Pueblo || '',
        poblacion: Number(props.POB || 0),
        latitud: coords[1],
        longitud: coords[0],
        htmlUrl: props.ID ? `${process.env.PUBLIC_URL || ''}/fichas/${props.ID}.html` : undefined
      };
      
      console.log('Notificando selección de comunidad a App:', communityData);
      onCommunitySelect(communityData);
    }
  }
  
  setTimeout(() => {
    onFilterChange(syncedFilters);
    console.log(`Filtros propagados inmediatamente:`, syncedFilters);
  }, 10);
  
  setTimeout(() => {
    onFilterChange(syncedFilters);
    console.log(`Filtros propagados (confirmación):`, syncedFilters);
  }, 100);
};

  const handleSearchChange = (field: keyof FilterState, value: string) => {
    setSearchTerms(prev => ({ ...prev, [field]: value }));
    if (field === 'entidad' || field === 'municipio' || field === 'comunidad' || field === 'pueblo') {
      setFilters(prev => ({ ...prev, [field]: value }));
    }
  };

  // CORRECCIÓN: clearAllFilters mejorado con forzado de actualización
  const clearAllFilters = () => {
    console.log(`Limpiando TODOS los filtros`);
    const cleanState = {
      entidad: '',
      municipio: '',
      comunidad: '',
      pueblo: ''
    };
    
    // CORRECCIÓN: Limpiar TODOS los estados relacionados
    setFilters(cleanState);
    setSearchTerms(cleanState);
    
    // Cerrar todos los dropdowns
    setShowDropdowns({
      entidad: false,
      municipio: false,
      comunidad: false,
      pueblo: false
    });
    
    // NUEVO: Limpiar highlight de comunidades
    if (onCommunityUnhighlight) {
      onCommunityUnhighlight();
    }
    
    // CORRECCIÓN: Propagar cambios de forma INMEDIATA y múltiple
    // Llamada inmediata
    onFilterChange(cleanState);
    
    // Llamada con delay para asegurar
    setTimeout(() => {
      onFilterChange(cleanState);
      console.log(`Filtros enviados al mapa (1ra llamada):`, cleanState);
    }, 50);
    
    // // Tercera llamada para garantizar limpieza
    // setTimeout(() => {
    //   onFilterChange(cleanState);
    //   console.log(`Filtros enviados al mapa (2da llamada):`, cleanState);
    // }, 200);
    
    // // NUEVO: Forzar actualización del mapa después de limpiar
    // setTimeout(() => {
    //   onFilterChange(cleanState);
    //   console.log(`Filtros enviados al mapa (3ra llamada final):`, cleanState);
    // }, 500);
    
    // console.log(`LIMPIEZA TOTAL COMPLETADA - Mapa debe mostrar TODAS las comunidades`);
  };

  const handleViewFicha = () => {
    if (!selectedCommunity?.id) {
      alert('No se encontró el ID de la comunidad');
      return;
    }
    onOpenHtmlViewer(selectedCommunity.id, selectedCommunity.nombre);
  };

  const toggleDropdown = (field: keyof typeof showDropdowns) => {
    setShowDropdowns(prev => {
      const newState = { ...prev, [field]: !prev[field] };
      // Cerrar otros dropdowns
      Object.keys(newState).forEach(key => {
        if (key !== field) {
          newState[key as keyof typeof newState] = false;
        }
      });
      return newState;
    });
    // Posicionar el dropdown si se está abriendo
    if (!showDropdowns[field]) {
      positionDropdown(field);
    }
  };

  const handleCloseCommunity = () => {
  console.log('Cerrando resumen y limpiando mapa completamente...');
  
  // 1. Cerrar resumen de comunidad
  onClearSelectedCommunity();
  
  // 2. Limpiar TODOS los filtros (igual que clearAllFilters)
  const cleanState = {
    entidad: '',
    municipio: '',
    comunidad: '',
    pueblo: ''
  };
  
  // Limpiar TODOS los estados relacionados
  setFilters(cleanState);
  setSearchTerms(cleanState);
  
  // Cerrar todos los dropdowns
  setShowDropdowns({
    entidad: false,
    municipio: false,
    comunidad: false,
    pueblo: false
  });
  
  // 3. Limpiar highlight de comunidades
  if (onCommunityUnhighlight) {
    onCommunityUnhighlight();
  }
  
  // 4. Propagar cambios al mapa (múltiples llamadas para asegurar limpieza total)
  onFilterChange(cleanState);
  
  setTimeout(() => {
    onFilterChange(cleanState);
    console.log('Filtros enviados al mapa (1ra llamada):', cleanState);
  }, 50);
  
  setTimeout(() => {
    onFilterChange(cleanState);
    console.log('Filtros enviados al mapa (2da llamada):', cleanState);
  }, 200);
  
  setTimeout(() => {
    onFilterChange(cleanState);
    console.log('Filtros enviados al mapa (3ra llamada final):', cleanState);
  }, 500);
  
  console.log('RESUMEN CERRADO Y MAPA LIMPIADO - Debe mostrar TODAS las comunidades');
};

  // FUNCIÓN para renderizar un dropdown genérico con eventos hover MANTENIDOS
  const renderDropdown = (
    field: keyof FilterState,
    options: string[],
    placeholder: string,
    disabled: boolean = false
  ) => (
    <div className="filter-group">
      <label>
        {field === 'entidad' ? 'Entidad Federativa' : 
         field === 'municipio' ? 'Municipio' : 
         field === 'comunidad' ? 'Comunidad' : 'Pueblo'}: 
        {filters[field] && <span className="filter-badge">✓</span>}
      </label>

              



      <div className="custom-select">
        <input
          ref={(el) => { inputRefs.current[field] = el; }}
          type="text"
          value={filters[field] || searchTerms[field]}
          onChange={(e) => handleSearchChange(field, e.target.value)}
          onFocus={() => !disabled && toggleDropdown(field)}
          placeholder={placeholder}
          className="select-input"
          disabled={disabled}
        />
        {showDropdowns[field] && !disabled && (
          <div className={`dropdown-list dropdown-${field}`}>
            <div className="dropdown-item" onClick={() => handleFilterChange(field, '')}>
              <span className="dropdown-clear">
                {field === 'entidad' ? 'Todas las entidades' :
                 field === 'municipio' ? 'Todos los municipios' :
                 field === 'comunidad' ? 'Todas las comunidades' : 'Todos los pueblos'}
              </span>
            </div>
            {options.map(option => (
              <div 
                key={option} 
                className={`dropdown-item ${filters[field] === option ? 'selected' : ''}`}
                onClick={() => handleFilterChange(field, option)}
                // MANTENEMOS: Eventos hover para el campo 'comunidad'
                onMouseEnter={() => {
                  if (field === 'comunidad' && onCommunityHighlight) {
                    onCommunityHighlight(option);
                  }
                }}
                onMouseLeave={() => {
                  if (field === 'comunidad' && onCommunityUnhighlight) {
                    onCommunityUnhighlight();
                  }
                }}
                style={{
                  // Estilo visual para indicar que es interactivo
                  cursor: field === 'comunidad' ? 'pointer' : 'default',
                  transition: field === 'comunidad' ? 'background-color 0.2s ease, transform 0.2s ease' : 'none'
                }}
              >
                {option}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  // NUEVO: Hook para detectar y corregir estados inconsistentes
  useEffect(() => {
    if (extractedData) {
      // Verificar si hay datos pero el contador está en 0 incorrectamente
      const shouldShowAll = !filters.entidad && !filters.municipio && !filters.comunidad && !filters.pueblo;
      const currentCount = getFilteredCount;
      const totalAvailable = extractedData.features.length;
      
      if (shouldShowAll && currentCount !== totalAvailable) {
        console.log(`INCONSISTENCIA DETECTADA: Debería mostrar ${totalAvailable} pero muestra ${currentCount}`);
        console.log(`FORZANDO CORRECCIÓN...`);
        
        // Forzar limpieza completa
        const cleanState = {
          entidad: '',
          municipio: '',
          comunidad: '',
          pueblo: ''
        };
        
        // Múltiples llamadas para forzar corrección
        setTimeout(() => onFilterChange(cleanState), 50);
        setTimeout(() => onFilterChange(cleanState), 150);
        setTimeout(() => onFilterChange(cleanState), 300);
      } else if (shouldShowAll && currentCount === totalAvailable) {
        console.log(`ESTADO CONSISTENTE: Mostrando ${currentCount} de ${totalAvailable} comunidades`);
      }
    }
  }, [extractedData, filters, getFilteredCount, onFilterChange]);

  // ==================== TU CÓDIGO ORIGINAL EXACTO HASTA AQUÍ ====================
  // SOLO AGREGUÉ ESTA LÍNEA AL CONTENEDOR PRINCIPAL:
  return (
    <div className={`sidebar-container ${isDarkTheme ? 'dark' : 'light'} ${collapsed ? 'sidebar-collapsed' : ''}`}>
      <Sidebar 
        collapsed={collapsed}
        backgroundColor={isDarkTheme ? '#1a1a1a' : '#ffffff'}
        rootStyles={{
          border: 'none',
          height: '100vh',
          position: 'fixed',
          right: 0,
          top: 0,
          zIndex: 1000,
          width: collapsed ? '80px' : '350px',
          transition: 'width 0.3s ease'
        }}
      >
        <div className="sidebar-header">
          <button 
            className="collapse-btn dots-toggle"
            onClick={onToggleCollapse}
            title={collapsed ? 'Expandir' : 'Ocultar'}
          >
            <span className={`dots-icon ${collapsed ? 'vertical' : 'horizontal'}`}>
              <span className="dot"></span>
              <span className="dot"></span>
              <span className="dot"></span>
            </span>
          </button>
          {!collapsed && (
            <>
              <h3>Búsqueda por Comunidad Indígena</h3>
            </>
          )}
        </div>
        {!collapsed && (
          <div className="sidebar-content">
            {/* Contador de resultados */}
            {extractedData && (
              <div className="filter-stats">
                <div className="stats-card">
                  <span className="stats-number">{getFilteredCount.toLocaleString()}</span>
                  <span className="stats-label">Comunidades encontradas</span>
                </div>
                {(filters.entidad || filters.municipio || filters.comunidad || filters.pueblo) && (
                  <button className="clear-filters-btn" onClick={clearAllFilters}>
                    ✕ Limpiar filtros
                  </button>
                )}
              </div>
            )}

<Menu>
  <SubMenu label="Búsqueda de comunidad" defaultOpen>
    <div className="filter-section">
      
      {/* ========== CAMPO DE BÚSQUEDA - PRIMERA OPCIÓN ========== */}
      <div className="filter-group" style={{ marginBottom: '20px' }}>
        <label style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginBottom: '8px',
          fontSize: '13px',
          fontWeight: 600,
          color: isDarkTheme ? '#e5e7eb' : '#1f2937'
        }}>
          <span>Buscar por nombre de comunidad indígena</span>
          {communitySearch && (
            <span style={{
              fontSize: '11px',
              color: '#9ca3af',
              fontWeight: 400
            }}>
              ({communitySearchResults.length} resultados)
            </span>
          )}
        </label>
        
        <div style={{ position: 'relative' }}>
          <input
            ref={communitySearchRef}
            type="text"
            value={communitySearch}
            onChange={(e) => setCommunitySearch(e.target.value)}
            placeholder={`Nombre de la comunidad...`}
            className="select-input"
            style={{
              width: '100%',
              padding: '10px 36px 10px 12px',
              borderRadius: '8px',
              border: `1px solid ${isDarkTheme ? '#374151' : '#d1d5db'}`,
              backgroundColor: isDarkTheme ? '#1f2937' : '#ffffff',
              color: isDarkTheme ? '#e5e7eb' : '#1f2937',
              fontSize: '13px',
              fontFamily: 'Inter, system-ui, sans-serif',
              outline: 'none',
              transition: 'all 0.2s ease'
            }}
            onFocus={() => {
              if (communitySearchResults.length > 0) {
                setShowCommunitySearchDropdown(true);
              }
            }}
          />
          
          {/* Botón para limpiar búsqueda */}
          {communitySearch && (
            <button
              onClick={() => {
                setCommunitySearch('');
                setShowCommunitySearchDropdown(false);
                // Limpiar highlight cuando se cierra la búsqueda
                if (onCommunityUnhighlight) {
                  onCommunityUnhighlight();
                }
              }}
              style={{
                position: 'absolute',
                right: '8px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                color: '#9ca3af',
                cursor: 'pointer',
                fontSize: '18px',
                padding: '4px 8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'color 0.2s ease'
              }}
              title="Limpiar búsqueda"
              onMouseEnter={(e) => {
                e.currentTarget.style.color = '#ef4444';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = '#9ca3af';
              }}
            >
              ✕
            </button>
          )}
          
        {/* Dropdown de resultados - SE DESPLIEGA HACIA ABAJO */}
{showCommunitySearchDropdown && communitySearchResults.length > 0 && (
  <div 
    className="dropdown-list community-search-dropdown"
    style={{
      position: 'absolute',
      top: '100%',
      left: 0,
      right: 0,
      marginTop: '4px',
      backgroundColor: isDarkTheme ? '#1f2937' : '#ffffff',
      border: `1px solid ${isDarkTheme ? '#374151' : '#d1d5db'}`,
      borderRadius: '8px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      maxHeight: '320px',
      overflowY: 'auto',
      zIndex: 2000
    }}
  >
    {communitySearchResults.map((community, index) => (
      <div
        key={`${community.nombre}-${community.entidad}-${community.municipio}-${index}`}
        className="dropdown-item"
        onClick={() => handleCommunitySearchSelect(community)}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = isDarkTheme 
            ? 'rgba(155, 34, 71, 0.15)' 
            : 'rgba(155, 34, 71, 0.1)';
          // Pasar el mismo objeto que usa handleCommunitySearchSelect
          if (onCommunityHighlight) {
            onCommunityHighlight({
              nombre: community.nombre,
              entidad: community.entidad,
              municipio: community.municipio
            });
          }
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'transparent';
          // NO limpiar el highlight aquí - solo cuando salga del contenedor completo
        }}
        style={{
          padding: '12px',
          cursor: 'pointer',
          transition: 'background-color 0.2s ease',
          backgroundColor: 'transparent',
          // Usar box-shadow en lugar de border para el separador
          // Esto evita crear un gap donde el mouse no está sobre ningún elemento
          boxShadow: index < communitySearchResults.length - 1 
            ? `inset 0 -1px 0 ${isDarkTheme ? '#374151' : '#e5e7eb'}` 
            : 'none'
        }}
      >
        {/* Nombre de la comunidad */}
        <div style={{
          fontSize: '14px',
          fontWeight: 600,
          color: isDarkTheme ? '#e5e7eb' : '#1f2937',
          marginBottom: '4px',
          fontFamily: 'Inter, system-ui, sans-serif'
        }}>
          {community.nombre}
        </div>
        
        {/* Ubicación: Municipio, Estado */}
        <div style={{
          fontSize: '12px',
          color: isDarkTheme ? '#9ca3af' : '#6b7280',
          fontFamily: 'Inter, system-ui, sans-serif',
          display: 'flex',
          alignItems: 'center',
          gap: '6px'
        }}>
          <span style={{ opacity: 0.7 }}>📍</span>
          <span>{community.municipio}, {community.entidad}</span>
        </div>
        
        {/* Pueblo (opcional) */}
        {community.pueblo && (
          <div style={{
            fontSize: '11px',
            color: isDarkTheme ? '#6b7280' : '#9ca3af',
            fontFamily: 'Inter, system-ui, sans-serif',
            marginTop: '3px',
            fontStyle: 'italic'
          }}>
            Pueblo: {community.pueblo}
          </div>
        )}
      </div>
    ))}
  </div>
)}
        </div>
     </div>

      {/* Separador visual */}
      <div style={{
        borderTop: `1px solid ${isDarkTheme ? '#374151' : '#e5e7eb'}`,
        marginBottom: '16px',
        paddingTop: '16px'
      }}>
        <p style={{
          fontSize: '12px',
          color: isDarkTheme ? '#9ca3af' : '#6b7280',
          fontWeight: 600,
          marginBottom: '12px',
          textTransform: 'uppercase',
          letterSpacing: '0.5px'
        }}>
          O filtrar por ubicación:
        </p>
      </div>

      {/* ========== FILTROS JERÁRQUICOS ========== */}
      
      {/* Entidad Federativa */}
      {renderDropdown(
        'entidad',
        filteredEntidades,
        `Buscar entre ${sortedEntidades.length} entidades...${filters.pueblo ? ` (donde existe "${filters.pueblo}")` : ''}`
      )}
      
      {/* Municipio */}
      {renderDropdown(
        'municipio',
        filteredMunicipios,
        sortedMunicipios.length > 0 ? 
          `Buscar entre ${sortedMunicipios.length} municipios...` : 
          'No hay municipios disponibles',
        sortedMunicipios.length === 0
      )}
      
      {/* Comunidad */}
      {renderDropdown(
        'comunidad',
        filteredComunidades,
        sortedComunidades.length > 0 ? 
          `Buscar entre ${sortedComunidades.length} comunidades...` : 
          'No hay comunidades disponibles',
        sortedComunidades.length === 0
      )}
      
      {/* Pueblo */}
      {renderDropdown(
        'pueblo',
        filteredPueblos,
        `Buscar entre ${filteredPueblosByHierarchy.length} pueblos...`
      )}
      
    </div>
  </SubMenu>
</Menu>

            {/* Resumen de comunidad seleccionada */}
            {selectedCommunity && (
              <div className="community-summary">
                <div className="community-summary-header">
                  <h4>Comunidad Seleccionada</h4>
                  <button 
                      className="close-community-btn"
                      onClick={handleCloseCommunity}
                      title="Cerrar resumen y limpiar mapa"
                    >
                      ✕
                    </button>
                </div>
                <div className="summary-card">
                  <h5>{selectedCommunity.nombre}</h5>
                  <p><strong>Entidad:</strong> {selectedCommunity.entidad}</p>
                  <p><strong>Municipio:</strong> {selectedCommunity.municipio}</p>
                  <p><strong>Pueblo:</strong> {selectedCommunity.pueblo}</p>
                  {parsedFichaExtra && (
                    <>
                      <p><strong>Población estimada:</strong> {parsedFichaExtra.poblacionEstimada == null ? '—' : parsedFichaExtra.poblacionEstimada.toLocaleString('es-MX')}</p>
                      <p><strong>Número de asentamientos:</strong> {parsedFichaExtra.numeroAsentamientos ?? '—'}</p>
                      <p><strong>Forma de Tenencia:</strong> {parsedFichaExtra.formaTenencia ?? '—'}</p>
                      <p><strong>Tipo de comunidad (según el pueblo):</strong> {parsedFichaExtra.tipoSegunPueblo ?? '—'}</p>
                      <p><strong>Tipo de comunidad (relación hábitat):</strong> {parsedFichaExtra.tipoRelacionHabitat ?? '—'}</p>
                      <p><strong>Pueblos que conforman la comunidad:</strong> {parsedFichaExtra.pueblosQueConforman?.length ? parsedFichaExtra.pueblosQueConforman.join(', ') : '—'}</p>
                      <p><strong>Lengua indígena que se habla:</strong> {parsedFichaExtra.lenguasIndigenas?.length ? parsedFichaExtra.lenguasIndigenas.join(', ') : '—'}</p>
                      <p><strong>Autoridades representativas:</strong> {parsedFichaExtra.autoridadesRepresentativas?.length ? parsedFichaExtra.autoridadesRepresentativas.join(' · ') : '—'}</p>
                      <p><strong>Métodos para tomar acuerdos:</strong> {parsedFichaExtra.metodosTomarAcuerdos?.length ? parsedFichaExtra.metodosTomarAcuerdos.join(' · ') : '—'}</p>
                      <p><strong>Principales actividades económicas:</strong> {parsedFichaExtra.principalesActividadesEconomicas?.length ? parsedFichaExtra.principalesActividadesEconomicas.join(', ') : '—'}</p>
                      <p><strong>¿Hay lugares sagrados dentro de la comunidad?:</strong> {parsedFichaExtra.lugaresSagrados == null ? '—' : (parsedFichaExtra.lugaresSagrados ? 'Sí' : 'No')}</p>
                      <p><strong>Fecha de fiestas principales:</strong> {parsedFichaExtra.fechasFiestasPrincipales?.length ? parsedFichaExtra.fechasFiestasPrincipales.join(' • ') : '—'}</p>
                    </>
                  )}
                  <div className="summary-actions">
                    <button 
                      className="btn-view-card" 
                      onClick={handleViewFicha}
                      title="Ver ficha completa"
                    >
                      📋 Ver Ficha
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Loading indicator */}
            {!extractedData && (
              <div className="loading-container">
                <div className="loading-spinner"></div>
                <p>Cargando datos del mapa...</p>
              </div>
            )}
          </div>
        )}
      </Sidebar>
    </div>
  );
};

export default CustomSidebar;