import React, { useState } from 'react';
import './LayerControl.css';

interface LayerControlProps {
  isDarkTheme: boolean;
  showNucleosAgrarios: boolean;
  onToggleNucleosAgrarios: (show: boolean) => void;
}

const LayerControl: React.FC<LayerControlProps> = ({
  isDarkTheme,
  showNucleosAgrarios,
  onToggleNucleosAgrarios
}) => {
  const [isExpanded, setIsExpanded] = useState(true);

  const toggleExpand = () => {
    setIsExpanded(!isExpanded);
  };

  return (
    <>
      {/* Botón flotante cuando está colapsado - COLOR #9b2247 */}
      {!isExpanded && (
        <button 
          className="layer-control-toggle-btn"
          onClick={toggleExpand}
          title="Mostrar capas"
          style={{
            backgroundColor: '#611232',
            border: 'none',
            borderRadius: '50%',
            padding: 0,
            cursor: 'pointer',
            boxShadow: '0 6px 16px rgba(155, 34, 71, 0.3)',
            transition: 'all 0.3s ease',
            position: 'fixed',
            left: '20px',
            bottom: '415px',
            zIndex: 1001,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '40px',
            height: '40px'
          }}
        >
          <span style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '3px',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <span style={{
              width: '5px',
              height: '5px',
              backgroundColor: '#ffffff',
              borderRadius: '50%',
              transition: 'background-color 0.3s ease'
            }}></span>
            <span style={{
              width: '5px',
              height: '5px',
              backgroundColor: '#ffffff',
              borderRadius: '50%',
              transition: 'background-color 0.3s ease'
            }}></span>
            <span style={{
              width: '5px',
              height: '5px',
              backgroundColor: '#ffffff',
              borderRadius: '50%',
              transition: 'background-color 0.3s ease'
            }}></span>
          </span>
        </button>
      )}

      {/* Panel de control de capas */}
      <div 
        className={`layer-control-panel ${isDarkTheme ? 'dark' : 'light'} ${isExpanded ? 'expanded' : 'collapsed'}`}
        style={{
          position: 'fixed',
          left: 0,
          bottom: '320px',
          zIndex: 1000,
          backgroundColor: isDarkTheme ? 'rgba(31, 41, 55, 0.95)' : 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(10px)',
          borderRadius: '0 12px 12px 0',
          boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
          padding: isExpanded ? '0' : '0',
          width: isExpanded ? '280px' : '0',
          overflow: 'hidden',
          transition: 'all 0.3s ease',
          border: `1px solid ${isDarkTheme ? '#374151' : '#e5e7eb'}`,
          borderLeft: 'none'
        }}
      >
        {isExpanded && (
          <>
            {/* Header con fondo #9b2247 y letras blancas */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              backgroundColor: '#9b2247',
              padding: '12px 16px',
              borderRadius: '0 12px 0 0',
              marginBottom: '16px'
            }}>
              <h3 style={{
                margin: 0,
                fontSize: '14px',
                fontWeight: 600,
                color: '#ffffff',
                fontFamily: 'Inter, system-ui, sans-serif'
              }}>
                Control de Capas
              </h3>
              
              {/* Botón de colapsar - COLOR #611232 */}
              <button 
                className="layer-control-collapse-btn"
                onClick={toggleExpand}
                title="Ocultar panel"
                style={{
                  backgroundColor: '#611232',
                  border: 'none',
                  borderRadius: '50%',
                  padding: 0,
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(97, 18, 50, 0.3)',
                  transition: 'all 0.3s ease',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '40px',
                  height: '40px',
                  flexShrink: 0
                }}
              >
                <span style={{
                  display: 'flex',
                  flexDirection: 'row',
                  gap: '3px',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <span style={{
                    width: '5px',
                    height: '5px',
                    backgroundColor: '#ffffff',
                    borderRadius: '50%',
                    transition: 'background-color 0.3s ease'
                  }}></span>
                  <span style={{
                    width: '5px',
                    height: '5px',
                    backgroundColor: '#ffffff',
                    borderRadius: '50%',
                    transition: 'background-color 0.3s ease'
                  }}></span>
                  <span style={{
                    width: '5px',
                    height: '5px',
                    backgroundColor: '#ffffff',
                    borderRadius: '50%',
                    transition: 'background-color 0.3s ease'
                  }}></span>
                </span>
              </button>
            </div>

            {/* Contenido del panel */}
            <div style={{ padding: '0 16px 16px 16px' }}>
              {/* Lista de capas */}
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '12px'
              }}>
                {/* Capa de Núcleos Agrarios */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px',
                  backgroundColor: isDarkTheme ? 'rgba(55, 65, 81, 0.5)' : 'rgba(243, 244, 246, 0.8)',
                  borderRadius: '8px',
                  border: `1px solid ${isDarkTheme ? '#4b5563' : '#d1d5db'}`,
                  transition: 'all 0.2s ease'
                }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    flex: 1
                  }}>
                    {/* Indicador de color */}
                    <div style={{
                      width: '20px',
                      height: '20px',
                      backgroundColor: '#1e5b4f',
                      border: '2px solid white',
                      borderRadius: '4px',
                      opacity: 0.7,
                      flexShrink: 0
                    }} />
                    <span style={{
                      fontSize: '13px',
                      fontWeight: 500,
                      color: isDarkTheme ? '#e5e7eb' : '#1f2937',
                      fontFamily: 'Inter, system-ui, sans-serif'
                    }}>
                      Núcleos Agrarios
                    </span>
                  </div>

                  {/* Switch toggle */}
                  <label style={{
                    position: 'relative',
                    display: 'inline-block',
                    width: '44px',
                    height: '24px',
                    flexShrink: 0,
                    cursor: 'pointer'
                  }}>
                    <input
                      type="checkbox"
                      checked={showNucleosAgrarios}
                      onChange={(e) => onToggleNucleosAgrarios(e.target.checked)}
                      style={{ display: 'none' }}
                    />
                    <span style={{
                      position: 'absolute',
                      cursor: 'pointer',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      backgroundColor: showNucleosAgrarios ? '#9b2247' : '#cbd5e1',
                      borderRadius: '24px',
                      transition: 'all 0.3s ease',
                      boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.1)'
                    }}>
                      <span style={{
                        position: 'absolute',
                        content: '',
                        height: '18px',
                        width: '18px',
                        left: showNucleosAgrarios ? '23px' : '3px',
                        bottom: '3px',
                        backgroundColor: 'white',
                        borderRadius: '50%',
                        transition: 'all 0.3s ease',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                      }} />
                    </span>
                  </label>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
};

export default LayerControl;