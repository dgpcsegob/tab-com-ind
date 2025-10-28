import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import './HtmlViewer.css';

interface HtmlViewerProps {
  isOpen: boolean;
  communityId: string;
  communityName: string;
  onClose: () => void;
  isDarkTheme: boolean;
}

interface SectionData {
  id: string;
  title: string;
  content: string;
}

interface CommunityHeader {
  nombreComunidad: string;
  pueblo: string;
  region: string;
  numeroRegistro: string;
  entidadFederativa: string;
  municipio: string;
  localidad: string;
  unidadAdministrativa: string;
}

const normalize = (s: string) =>
  (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim();

/* =========================
   Config y helpers MAPS
   ========================= */
const DESIRED_ZOOM = 18; // sube a 19 para aún más cerca

const buildStandardEmbedURL = (lat: number, lng: number, zoom = DESIRED_ZOOM, satellite = true) => {
  const t = satellite ? 'k' : 'm'; // k = satélite, m = mapa
  return `https://www.google.com/maps?output=embed&q=${lat},${lng}&z=${zoom}&t=${t}`;
};

const buildStreetViewURL = (lat: number, lng: number) =>
  `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`;

const parseLatLngFromGoogleSrc = (rawSrc: string): { lat: number; lng: number } | null => {
  try {
    const src = rawSrc || '';
    const url = new URL(src, window.location.origin);

    // 1) /@lat,lng,zoomz
    const atMatch = url.pathname.match(/@(-?\d+(\.\d+)?),(-?\d+(\.\d+)?),/i);
    if (atMatch) {
      const lat = parseFloat(atMatch[1]);
      const lng = parseFloat(atMatch[3]);
      if (isFinite(lat) && isFinite(lng)) return { lat, lng };
    }

    // 2) q= / ll= / center=
    const q = url.searchParams.get('q') || '';
    const ll = url.searchParams.get('ll') || '';
    const center = url.searchParams.get('center') || '';
    const tryPair = (s: string) => {
      const m = s.match(/(-?\d+(\.\d+)?),\s*(-?\d+(\.\d+)?)/);
      if (m) {
        const lat = parseFloat(m[1]);
        const lng = parseFloat(m[3]);
        if (isFinite(lat) && isFinite(lng)) return { lat, lng };
      }
      return null;
    };
    const fromParams = tryPair(q) || tryPair(ll) || tryPair(center);
    if (fromParams) return fromParams;

    // 3) pb= … !3dlat!4dlng
    const pb = url.searchParams.get('pb') || src;
    let m = pb.match(/!3d([-\d.]+)!4d([-\d.]+)/);
    if (m) {
      const lat = parseFloat(m[1]);
      const lng = parseFloat(m[2]);
      if (isFinite(lat) && isFinite(lng)) return { lat, lng };
    }
    // 4) pb= … !2dlng!3dlat
    m = pb.match(/!2d([-\d.]+)!3d([-\d.]+)/);
    if (m) {
      const lng = parseFloat(m[1]);
      const lat = parseFloat(m[2]);
      if (isFinite(lat) && isFinite(lng)) return { lat, lng };
    }
  } catch {
    // ignorar
  }
  return null;
};

// Envuelve el iframe en un contenedor relativo para anclar el botón, y lo devuelve
const ensureIframeWrapper = (iframe: HTMLIFrameElement) => {
  const currentParent = iframe.parentElement as HTMLElement | null;
  if (!currentParent) return null;

  if (currentParent.classList.contains('gmaps-embed-wrap')) {
    currentParent.style.position = 'relative';
    currentParent.style.display = 'inline-block';
    currentParent.style.width = '100%';
    currentParent.style.maxWidth = '100%';
    return currentParent;
  }

  const wrap = document.createElement('div');
  wrap.className = 'gmaps-embed-wrap';
  wrap.style.position = 'relative';
  wrap.style.display = 'inline-block';
  wrap.style.width = '100%';
  wrap.style.maxWidth = '100%';

  currentParent.insertBefore(wrap, iframe);
  wrap.appendChild(iframe);

  return wrap;
};

/* =========================
   Componente
   ========================= */
const HtmlViewer: React.FC<HtmlViewerProps> = ({
  isOpen,
  communityId,
  communityName,
  onClose,
  isDarkTheme
}) => {
  const [htmlContent, setHtmlContent] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [isMinimized, setIsMinimized] = useState<boolean>(false);
  const [activeSection, setActiveSection] = useState<string>('');

  const contentRef = useRef<HTMLDivElement>(null);

  /* ---------- Carga ---------- */
  const loadHtmlContent = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const fichaUrl = `${process.env.PUBLIC_URL || ''}/fichas/${communityId}.html`;
      const response = await fetch(fichaUrl);
      if (!response.ok) throw new Error(`No se encontró la ficha para el ID: ${communityId}`);
      const htmlText = await response.text();
      setHtmlContent(htmlText);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar la ficha');
      console.error('Error loading HTML:', err);
    } finally {
      setLoading(false);
    }
  }, [communityId]);

  useEffect(() => {
    if (isOpen && communityId) loadHtmlContent();
  }, [isOpen, communityId, loadHtmlContent]);


const handleCloseClick = () => {
  // Disparar evento específico para cerrar el resumen
  try {
    window.dispatchEvent(new CustomEvent('close-resumen'));
  } catch {}
  onClose();
};





  /* ---------- Procesamiento ---------- */
  const { sections, processedContent, headerInfo } = useMemo(() => {
    if (!htmlContent) {
      return { sections: [] as SectionData[], processedContent: '', headerInfo: null as CommunityHeader | null };
    }

    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlContent, 'text/html');

      const headerInfo: CommunityHeader = {
        nombreComunidad: '',
        pueblo: '',
        region: '',
        numeroRegistro: '',
        entidadFederativa: '',
        municipio: '',
        localidad: '',
        unidadAdministrativa: ''
      };

      const fixedDiv = doc.querySelector('.fixed-div');
      if (fixedDiv) {
        const rows = fixedDiv.querySelectorAll('.row');
        rows.forEach(row => {
          const h6s = row.querySelectorAll('h6');
          const ps  = row.querySelectorAll('p');
          h6s.forEach((h6, i) => {
            const label = (h6.textContent || '').trim().toLowerCase();
            const value = (ps[i]?.textContent || '').trim();
            if (label.includes('nombre de la comunidad')) headerInfo.nombreComunidad = value;
            else if (label.includes('pueblo')) headerInfo.pueblo = value;
            else if (label.includes('región') || label.includes('region')) headerInfo.region = value;
            else if (label.includes('número registro') || label.includes('numero registro')) headerInfo.numeroRegistro = value;
            else if (label.includes('entidad federativa')) headerInfo.entidadFederativa = value;
            else if (label.includes('municipio')) headerInfo.municipio = value;
            else if (label.includes('localidad')) headerInfo.localidad = value;
            else if (label.includes('unidad administrativa')) headerInfo.unidadAdministrativa = value;
          });
        });
      }

      // Limpieza visual de order-*
      const allRows = doc.querySelectorAll('.row');
      allRows.forEach(row => {
        const cols = Array.from(row.children) as HTMLElement[];
        const colsWithOrder = cols.filter(c => c.className.includes('order-lg-'));
        if (colsWithOrder.length >= 4) {
          const labels: HTMLElement[] = [];
          const values: HTMLElement[] = [];
          colsWithOrder.forEach(c => {
            if (c.querySelector('h6')) labels.push(c);
            else if (c.querySelector('p')) values.push(c);
          });
          if (labels.length === values.length && labels.length > 1) {
            row.innerHTML = '';
            for (let i = 0; i < labels.length; i++) {
              const L = labels[i].cloneNode(true) as HTMLElement;
              const V = values[i].cloneNode(true) as HTMLElement;
              L.className = L.className.replace(/order-lg-\d+|order-\d+/g, '').trim() + ' col-12 col-lg-6';
              V.className = V.className.replace(/order-lg-\d+|order-\d+/g, '').trim() + ' col-12 col-lg-6';
              row.appendChild(L); row.appendChild(V);
            }
          }
        }
      });

      // Secciones (tabs)
      const sectionsArray: SectionData[] = [];
      doc.querySelectorAll('.nav-link').forEach(link => {
        const href = link.getAttribute('href');
        const title = link.textContent?.trim() || '';
        if (href && title) {
          const id = href.replace('#tab', '').toLowerCase();
          const tab = doc.querySelector(href);
          sectionsArray.push({ id, title, content: tab ? tab.innerHTML : '' });
        }
      });

      // Remover encabezados originales
      const cardHeader = doc.querySelector('.card-header');
      if (cardHeader) cardHeader.remove();
      const fixedDiv2 = doc.querySelector('.fixed-div');
      if (fixedDiv2) fixedDiv2.remove();

      return { sections: sectionsArray, processedContent: doc.body.innerHTML, headerInfo };
    } catch (e) {
      console.error('Error procesando HTML:', e);
      return { sections: [] as SectionData[], processedContent: htmlContent, headerInfo: null as CommunityHeader | null };
    }
  }, [htmlContent]);

  /* ---------- Sección activa ---------- */
  useEffect(() => {
    if (sections.length > 0 && !activeSection) setActiveSection(sections[0].id);
  }, [sections, activeSection]);

  const activeSectionMeta = useMemo(
    () => sections.find(s => s.id === activeSection),
    [sections, activeSection]
  );

  const isDatosGeneralesActive = useMemo(() => {
    if (!activeSectionMeta) return false;
    const t = normalize(activeSectionMeta.title);
    return t === 'datos generales' || (t.includes('datos') && t.includes('general'));
  }, [activeSectionMeta]);

  const currentSectionContent = useMemo(() => {
    const sec = sections.find(s => s.id === activeSection);
    return sec ? sec.content : processedContent;
  }, [sections, activeSection, processedContent]);

  const combinedEML = useMemo(() => {
    if (!headerInfo) return '';
    return [headerInfo.entidadFederativa, headerInfo.municipio, headerInfo.localidad]
      .filter(Boolean)
      .join(' / ');
  }, [headerInfo]);

  /* ---------- Forzar mapa satélite + zoom uniforme + botón Street View ---------- */
  useEffect(() => {
    if (!contentRef.current) return;
    const root = contentRef.current;

    const iframes = root.querySelectorAll<HTMLIFrameElement>('iframe[src*="google.com/maps"]');

    iframes.forEach((iframe) => {
      // reconstruir src con zoom uniforme y satélite si hay coords
      const existingSrc = iframe.getAttribute('src') || '';
      const coords = parseLatLngFromGoogleSrc(existingSrc);

      if (coords) {
        const finalSrc = buildStandardEmbedURL(coords.lat, coords.lng, DESIRED_ZOOM, true);
        if (finalSrc !== existingSrc) iframe.setAttribute('src', finalSrc);
      } else {
        // fallback: intenta forzar z y t sobre el src actual
        try {
          const url = new URL(existingSrc, window.location.origin);
          url.searchParams.set('t', 'k');
          url.searchParams.set('z', String(DESIRED_ZOOM));
          let finalSrc = url.toString();
          finalSrc = finalSrc.replace(
            /(@-?\d+(\.\d+)?,-?\d+(\.\d+)?\,)\d+(\.\d+)?z/i,
            (_m, p1) => `${p1}${DESIRED_ZOOM}z`
          );
          if (!/[\?&]t=k/.test(finalSrc)) {
            finalSrc += (finalSrc.includes('?') ? '&' : '?') + 't=k';
          }
          if (finalSrc !== existingSrc) iframe.setAttribute('src', finalSrc);
        } catch {
          // dejar como está si no se pudo parsear
        }
      }

      // props visuales del iframe
      iframe.setAttribute('loading', 'lazy');
      iframe.setAttribute('referrerpolicy', 'no-referrer-when-downgrade');
      if (!iframe.style.height) iframe.style.height = '320px';
      if (!iframe.style.borderRadius) iframe.style.borderRadius = '6px';

      // ==== Wrapper relativo para anclar el botón ====
      const wrapper = ensureIframeWrapper(iframe);
      if (!wrapper) return;

      // Limpia botones previos
      wrapper.querySelectorAll('.sv-explore-btn').forEach((b) => b.remove());

      // Crea botón estilo Google (pegman), fijo en top-right
      const btn = document.createElement('button');
      btn.className = 'sv-explore-btn';
      btn.title = 'Explorar imágenes';
      btn.setAttribute('aria-label', 'Explorar imágenes');
      btn.innerHTML = `
        <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="5.5" r="3.5" fill="#fbbc04"/>
          <path d="M7 22v-5.5c0-1.66 1.34-3 3-3h4c1.66 0 3 1.34 3 3V22" fill="#fbbc04"/>
          <path d="M9.5 9.5h5l2 4h-2.2l-.9-1.8c-.12-.24-.37-.4-.64-.4h-1.6c-.27 0-.52.16-.64.4l-.9 1.8H7.5l2-4z" fill="#f29900"/>
        </svg>
      `;

      Object.assign(btn.style, {
        position: 'absolute',
        top: '10px',
        right: '10px',
        width: '40px',
        height: '40px',
        minWidth: '40px',
        minHeight: '40px',
        borderRadius: '50%',
        background: '#ffffff',
        color: '#111827',
        border: '1px solid rgba(0,0,0,0.1)',
        boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        zIndex: '5',
        padding: '0',
        lineHeight: '0',
        transition: 'transform 120ms ease, box-shadow 120ms ease, background 120ms ease',
        pointerEvents: 'auto',
      } as CSSStyleDeclaration);

      btn.onmouseenter = () => {
        btn.style.transform = 'translateY(-1px)';
        btn.style.boxShadow = '0 2px 6px rgba(0,0,0,0.35)';
      };
      btn.onmouseleave = () => {
        btn.style.transform = 'translateY(0)';
        btn.style.boxShadow = '0 1px 4px rgba(0,0,0,0.3)';
      };

      btn.onclick = (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const srcNow = iframe.getAttribute('src') || '';
        const c = parseLatLngFromGoogleSrc(srcNow) || coords;
        if (c) {
          window.open(buildStreetViewURL(c.lat, c.lng), '_blank', 'noopener,noreferrer');
        } else {
          window.open(srcNow || 'https://www.google.com/maps', '_blank', 'noopener,noreferrer');
        }
      };

      wrapper.appendChild(btn);

      // Asegurar anclaje estable en cambios de tamaño
      const ro = new ResizeObserver(() => {
        btn.style.top = '10px';
        btn.style.right = '10px';
      });
      ro.observe(wrapper);
    });
  }, [currentSectionContent]);

  /* ---------- UI ---------- */
  const toggleMinimize = () => setIsMinimized(!isMinimized);
  const handleSectionChange = (id: string) => setActiveSection(id);

  if (!isOpen) return null;

  return (
    <div className={`html-viewer ${isDarkTheme ? 'dark' : 'light'} ${isMinimized ? 'minimized' : ''}`}>
      <div className="html-viewer-header">
        <div className="header-left">
          <h3>{communityName}</h3>
        </div>
        <div className="header-controls">
          <button className="minimize-btn" onClick={toggleMinimize} title={isMinimized ? 'Expandir' : 'Minimizar'} />
            <button className="close-btn" onClick={handleCloseClick} title="Cerrar ficha">✖️</button>
        </div>
      </div>

      {!isMinimized && (
        <div className="html-viewer-content">
          {loading && (
            <div className="loading-container">
              <div className="loading-spinner"></div>
              <p>Cargando ficha...</p>
            </div>
          )}

          {error && (
            <div className="error-container">
              <h4>⚠️ Error al cargar la ficha</h4>
              <p>{error}</p>
              <button className="retry-btn" onClick={loadHtmlContent}>🔄 Reintentar</button>
            </div>
          )}

          {!loading && !error && htmlContent && (
            <>
              {/* Encabezado NO sticky, corre con el contenido */}
              {headerInfo && (
                <div className="community-header compact">
                  <div className="header-line1">
                    <div className="header-item">
                      <span className="header-label">Pueblo</span>
                      <span className="header-value">{headerInfo.pueblo || '—'}</span>
                    </div>
                    <div className="header-item">
                      <span className="header-label">Región</span>
                      <span className="header-value">{headerInfo.region || '—'}</span>
                    </div>
                    <div className="header-item eml">
                      <span className="header-label">Entidad / Municipio / Localidad</span>
                      <span className="header-value" title={combinedEML}>{combinedEML || '—'}</span>
                    </div>
                    <div className="header-item">
                      <span className="header-label">Núm. Registro</span>
                      <span className="header-value">{headerInfo.numeroRegistro || '—'}</span>
                    </div>
                    <div className="header-item ua ua-box">
                      <span className="header-label">Unidad Administrativa</span>
                      <span className="header-value" title={headerInfo.unidadAdministrativa}>
                        {headerInfo.unidadAdministrativa || '—'}
                      </span>
                    </div>
                  </div>

                  {headerInfo.nombreComunidad && (
                    <div className="header-grid compact">
                      <div className="header-item full-width">
                        <span className="header-label">Nombre de la comunidad</span>
                        <span className="header-value">{headerInfo.nombreComunidad}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {sections.length > 1 && (
                <div className="sections-navigation">
                  <div className="sections-buttons">
                    {sections.map((s) => (
                      <button
                        key={s.id}
                        className={`section-btn ${activeSection === s.id ? 'active' : ''}`}
                        onClick={() => handleSectionChange(s.id)}
                      >
                        {s.title}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div
                ref={contentRef}
                className="html-content"
                dangerouslySetInnerHTML={{ __html: currentSectionContent }}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default HtmlViewer;
