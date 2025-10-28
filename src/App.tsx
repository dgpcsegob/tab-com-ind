import React, { useState } from 'react';
import Sidebar from './components/Sidebar/Sidebar';
import Map from './components/Map/Map';
import CommunityCard from './components/CommunityCard/CommunityCard';
import HtmlViewer from './components/HtmlViewer/HtmlViewer';
import './App.css';
import LayerControl from './components/LayerControl/LayerControl';


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
  latitud: number;
  longitud: number;
}

interface ExtractedData {
  entidades: Set<string>;
  municipiosPorEntidad: Map<string, Set<string>>;
  comunidadesPorMunicipio: Map<string, Set<string>>;
  pueblos: Set<string>;
  features: any[];
}

const App: React.FC = () => {
const [layersVisibility, setLayersVisibility] = useState<{ [key: string]: boolean }>({
  LocalidadesSedeINPI: true,
  // NO incluir AsentamientosINPI aquí - se maneja por separado
  NucleosAgrarios: false,
  'NucleosAgrarios-outline': false,
});

  const [filters, setFilters] = useState<FilterState>({
    entidad: '',
    municipio: '',
    comunidad: '',
    pueblo: ''
  });

  const [selectedCommunity, setSelectedCommunity] = useState<CommunityData | null>(null);
  const [showCommunityCard, setShowCommunityCard] = useState(false);
  const [isDarkTheme, setIsDarkTheme] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Estados para el visor HTML
  const [showHtmlViewer, setShowHtmlViewer] = useState(false);
  const [htmlViewerCommunityId, setHtmlViewerCommunityId] = useState('');
  const [htmlViewerCommunityName, setHtmlViewerCommunityName] = useState('');

  // Estado para datos extraídos del mapa
  const [extractedData, setExtractedData] = useState<ExtractedData | null>(null);

  // NUEVO: Estado para destacar comunidades
  const [highlightedCommunity, setHighlightedCommunity] = useState<string | null>(null);

  const [showNucleosAgrarios, setShowNucleosAgrarios] = useState(false);
  

  const handleToggle = (id: string) => {
    setLayersVisibility(prev => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

const handleFilterChange = (newFilters: FilterState) => {
  console.log('📥 App.handleFilterChange recibió:', newFilters);
  console.log('📥 Filtros anteriores:', filters);
  
  setFilters(newFilters);
  
  // ✅ SOLO limpiar selectedCommunity si la comunidad cambió Y se vació
  // NO limpiar si se seleccionó una comunidad nueva
  if (filters.comunidad && !newFilters.comunidad) {
    console.log('🧹 Limpiando selectedCommunity porque se quitó el filtro de comunidad');
    setSelectedCommunity(null);
    setShowCommunityCard(false);
  }
};

const handleCommunityClick = (communityId: string, communityData: CommunityData) => {
  setSelectedCommunity(communityData);
  setShowCommunityCard(true);
};

const handleCommunitySelectFromSidebar = (communityData: CommunityData) => {
  console.log('✅ App recibió comunidad desde sidebar:', communityData);
  console.log('✅ Coordenadas:', communityData.latitud, communityData.longitud);  // ✅ AGREGAR
  
  setSelectedCommunity(communityData);
  setShowCommunityCard(false);
  
  // ✅ AGREGAR: Disparar evento para que el mapa muestre asentamientos
  if (communityData.id && communityData.latitud && communityData.longitud) {
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('show-asentamientos', {
        detail: {
          communityId: communityData.id,
          communityName: communityData.nombre,
          lat: communityData.latitud,
          lng: communityData.longitud
        }
      }));
    }, 300);
  }
};

  const handleCloseCommunityCard = () => {
    setShowCommunityCard(false);
  };

  const handleThemeToggle = () => {
    setIsDarkTheme(prev => !prev);
  };

  const handleSidebarToggle = () => {
    setSidebarCollapsed(prev => !prev);
  };

  const handleOpenHtmlViewer = (communityId: string, communityName: string) => {
    setHtmlViewerCommunityId(communityId);
    setHtmlViewerCommunityName(communityName);
    setShowHtmlViewer(true);
  };

  const handleCloseHtmlViewer = () => {
    setShowHtmlViewer(false);
    setHtmlViewerCommunityId('');
    setHtmlViewerCommunityName('');
  };

  const handleClearSelectedCommunity = () => {
    setSelectedCommunity(null);
    setShowCommunityCard(false);
    if (showHtmlViewer) {
      setShowHtmlViewer(false);
      setHtmlViewerCommunityId('');
      setHtmlViewerCommunityName('');
    }
  };

  const handleDataLoaded = (data: ExtractedData) => {
    setExtractedData(data);
    console.log('Datos cargados en App:', {
      entidades: data.entidades.size,
      pueblos: data.pueblos.size,
      totalFeatures: data.features.length
    });
  };

  const handleFilterChangeFromMap = (patch: { 
    entidad?: string; 
    municipio?: string; 
    localidad?: string; 
    pueblo?: string;
  }) => {
    if (extractedData && patch.entidad) {
      const entidadMatch = Array.from(extractedData.entidades).find(e => e === patch.entidad);
      if (entidadMatch) {
        setFilters(prev => ({
          ...prev,
          entidad: entidadMatch,
          municipio: patch.municipio || '',
          comunidad: patch.localidad || '',
          pueblo: patch.pueblo || ''
        }));
      }
    }
  };

  // NUEVAS: Funciones para manejar highlight de comunidades
  const handleCommunityHighlight = (communityName: string) => {
    setHighlightedCommunity(communityName);
    console.log(`Destacando comunidad: "${communityName}"`);
  };

  const handleCommunityUnhighlight = () => {
    setHighlightedCommunity(null);
    console.log('Quitando destaque de comunidad');
  };

      const handleToggleNucleosAgrarios = (show: boolean) => {
  setShowNucleosAgrarios(show);
  
  // Actualizar visibilidad de ambas capas (relleno y borde)
  setLayersVisibility(prev => ({
    ...prev,
    NucleosAgrarios: show,
    'NucleosAgrarios-outline': show
  }));
  
  console.log(`Núcleos Agrarios ${show ? 'activados' : 'desactivados'}`);
};
  return (
    <div className={`App ${isDarkTheme ? 'dark-theme' : 'light-theme'}`}>
      {/* Sidebar derecho */}
      <Sidebar
        layersVisibility={layersVisibility}
        onToggle={handleToggle}
        onFilterChange={handleFilterChange}
        selectedCommunity={selectedCommunity}
        isDarkTheme={isDarkTheme}
        onThemeToggle={handleThemeToggle}
        collapsed={sidebarCollapsed}
        onToggleCollapse={handleSidebarToggle}
        onOpenHtmlViewer={handleOpenHtmlViewer}
        onClearSelectedCommunity={handleClearSelectedCommunity}
        extractedData={extractedData}
        // NUEVAS PROPS: Para manejar highlight
        onCommunityHighlight={handleCommunityHighlight}
        onCommunityUnhighlight={handleCommunityUnhighlight}
        onCommunitySelect={handleCommunitySelectFromSidebar}
      />

      {/* Mapa con estado de highlight */}
      <div 
        className={`map-container ${sidebarCollapsed ? 'sidebar-collapsed' : 'sidebar-expanded'}`}
        style={{ 
          height: showHtmlViewer ? 'calc(100vh - 300px)' : '100vh',
          transition: 'height 0.3s ease'
        }}
      >
        <Map 
          layersVisibility={layersVisibility}
          filters={filters}
          isDarkTheme={isDarkTheme}
          onCommunityClick={handleCommunityClick}
          onFilterChangeFromMap={handleFilterChangeFromMap}
          onDataLoaded={handleDataLoaded}
          // NUEVA PROP: Para recibir la comunidad a destacar
          highlightedCommunity={highlightedCommunity}
        />



                    <LayerControl
                      isDarkTheme={isDarkTheme}
                      showNucleosAgrarios={showNucleosAgrarios}
                      onToggleNucleosAgrarios={handleToggleNucleosAgrarios}
                    />
                    

      </div>

      {/* Ficha de comunidad */}
      {showCommunityCard && selectedCommunity && (
        <CommunityCard
          isOpen={showCommunityCard}
          onClose={handleCloseCommunityCard}
          communityId={selectedCommunity.id}
          isDarkTheme={isDarkTheme}
        />
      )}

      {/* Visor HTML en la parte inferior */}
      <HtmlViewer
        isOpen={showHtmlViewer}
        communityId={htmlViewerCommunityId}
        communityName={htmlViewerCommunityName}
        onClose={handleCloseHtmlViewer}
        isDarkTheme={isDarkTheme}
      />

      {/* Overlay para sidebar en modo móvi l */}
      {!sidebarCollapsed && (
        <div 
          className="sidebar-overlay mobile-only"
          onClick={handleSidebarToggle}
        />
      )}
    </div>
  );
};

export default App;