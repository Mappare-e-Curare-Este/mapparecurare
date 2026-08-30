// IIFE (Immediately Invoked Function Expression) per incapsulare la logica e prevenire variabili globali
(function() {
  
  // =========================================================================
  // I. VARIABILI PRIVATE E COSTANTI
  // =========================================================================
  let map;
  let markers; // MarkerClusterGroup
  let geojsonPois = null; // <--- AGGIUNGI QUESTA RIGA QUI IN CIMA
  
  // Variabili GPS
  let gpsMarker = null;
  let accuracyCircle = null;
  
  // Variabili Interfaccia
  let highlightedLayers = [];
  let HIGHLIGHT_COLOR = '#ffcc00'; // Colore Giallo/Arancio per evidenziare (sovrascrivibile da Google Sheets)
  let POI_COLOR = '#238210'; // Colore di default dei POI (sovrascrivibile da Google Sheets)
  let PARK_FILL_COLOR = '#3c9629'; // Colore di riempimento del confine del parco
  let PARK_BORDER_COLOR = '#255c19'; // Colore del bordo del confine del parco
  const PARK_BOUNDS = L.latLngBounds([[45.228, 11.654], [45.232, 11.660]]);
  const LOCATION_OPTIONS = {
      enableHighAccuracy: true,
      timeout: 25000,
      maximumAge: 0,
  };

  let exitPromptTimer = null;

  let speciesLookup = new Map();
  let featureLookup = new Map();

  // =========================================================================
  // II. FUNZIONI DI GESTIONE UI (Menu, Overlay, Info)
  // =========================================================================

  function unhighlightLayers() {
    // Colore originale del cerchio (configurabile da Google Sheets, chiave "ColorePOI")
    highlightedLayers.forEach(layer => {
      layer.setStyle({
          fillColor: POI_COLOR,
          color: "", // Rimuove il bordo (o imposta il colore originale)
          weight: 1,
          opacity: 1,
          fillOpacity: 0.7,
      });
    });
    highlightedLayers = [];
  }
  
  function closeAllUIs() {
      closeMenu();
      closeOverlay();
      closeInfoOverlay();
      if (map) map.closePopup();
      unhighlightLayers();
  }

  // Funzione per mostrare l'overlay con i dettagli dell'albero
  function openTreeOverlay(feature) {
    const treeName = feature.properties.Nome;
    const speciesDetails = speciesLookup.get(treeName) || feature.properties;

    document.getElementById('treeContent').scrollTop = 0;
    const treeDetails = document.getElementById('treeDetails');
    treeDetails.innerHTML = '';

    const title = document.createElement('h2');
    title.textContent = treeName;
    treeDetails.appendChild(title);

    const description = document.createElement('p');
    description.innerHTML = '<b>Nome Scientifico:</b> ' + speciesDetails.Descrizione;
    treeDetails.appendChild(description);

    const treeHistory = document.createElement('p');
    treeHistory.innerHTML = speciesDetails.Storia || '';
    treeDetails.appendChild(treeHistory);

    const imageContainer = document.createElement('div');
    imageContainer.id = 'treeImageContainer';

    if (speciesDetails.image && speciesDetails.image.length > 0) {
    const images = Array.isArray(speciesDetails.image) ? speciesDetails.image : [speciesDetails.image];
      images.forEach(imgUrl => {
        const img = document.createElement('img');
        img.src = imgUrl;
        img.alt = treeName;
        imageContainer.appendChild(img);
      });
    }

    treeDetails.appendChild(imageContainer);
    document.getElementById('treeOverlay').classList.add('visible');
    
    // 🌳 MODIFICA: Assicurati che l'hash sia #overlay e sostituisci lo stato esistente (#popup)
    if (location.hash.length > 0) {
        window.history.replaceState(null, '', location.pathname + '#overlay'); 
    } else {
        window.history.pushState(null, '', location.pathname + '#overlay');
    }
  }

  // Funzione per chiudere l'overlay
  function closeOverlay() {
    document.getElementById('treeOverlay').classList.remove('visible');
    unhighlightLayers();
  }

function openInfoOverlay() {
  closeMenu();
  document.getElementById('treeOverlay').classList.remove('visible');
  if (map) map.closePopup();
  unhighlightLayers(); 

  // Aggiorna dinamicamente l'overlay Info se la configurazione è disponibile
  if (window.infoPanelConfig) {
    const infoContent = document.getElementById('infoContent');
    infoContent.innerHTML = `
      <button class="close-button">&times;</button>
      <h2>${window.infoPanelConfig.TitoloInfo || 'Progetto Mappare e Curare'}</h2>
      <p>${window.infoPanelConfig.DescrizioneInfo || ''}</p>
    `;
    // Re-collega il pulsante chiudi
    infoContent.querySelector('.close-button').addEventListener('click', closeInfoOverlay);
  }
  
  if (location.hash.length === 0 || location.hash === '#exit') {
      window.history.pushState(null, '', location.pathname + '#info');
  } else {
      window.history.replaceState(null, '', location.pathname + '#info');
  }
  
  document.getElementById('infoOverlay').classList.add('visible');
  document.getElementById('infoContent').scrollTop = 0;
}

  // Funzione per chiudere l'overlay Info
  function closeInfoOverlay() {
    document.getElementById('infoOverlay').classList.remove('visible');
  }

  // Funzione per chiudere il menu
  function closeMenu() {
      const treeListMenu = document.getElementById('treeListMenu');
      treeListMenu.classList.remove('open');
  }

  // Funzione per aprire il menu
  function openMenu() {
    closeInfoOverlay();
    document.getElementById('treeOverlay').classList.remove('visible');
    if (map) map.closePopup();
    unhighlightLayers();

    const treeListMenu = document.getElementById('treeListMenu');
    treeListMenu.classList.add('open');
    
    // 🌳 MODIFICA: Quando il menu è aperto, aggiungi uno stato alla cronologia del browser.
    if (!location.hash.includes('#menu-open')) {
        window.history.pushState({ menuOpen: true }, '', '#menu-open');
    } else {
        // Se si riapre il menu senza uno stato intermedio, usa replaceState
        window.history.replaceState({ menuOpen: true }, '', '#menu-open');
    }
  }
  
  // Funzione per mostrare il prompt d'uscita
  function showExitPrompt() {
    document.getElementById('exitPrompt').classList.add('visible');
    exitPromptTimer = null;
  }

  // Funzione per chiudere il prompt d'uscita
  function closeExitPrompt() {
    document.getElementById('exitPrompt').classList.remove('visible');
    if (exitPromptTimer) {
      clearTimeout(exitPromptTimer);
      exitPromptTimer = null;
    }
  }

function createEntranceIcon() {
    return L.icon({
    iconUrl: 'images/Icon/location-pin.png', // Usa 'icons' al plurale e un nome file
    iconSize: [32, 32], 
    iconAnchor: [16, 32], 
    popupAnchor: [0, -30] 
});
}

// Funzione per aggiungere i marker degli ingressi, separati dal cluster dei POI
function addEntranceMarkers(map) {
    // Coordinate ipotetiche per i due ingressi (modifica se necessario)
    const entrances = [
        {
            name: "Ingresso Principale",
            latlng: [45.2291431342093, 11.656730930919622], // Latitudine, Longitudine (es. Nord/Est)
            popupContent: "<b>Targa Ingresso 1</b>"
        },
        {
            name: "Ingresso Sud",
            latlng: [45.22869096746783, 11.657582931205894], // Latitudine, Longitudine (es. Sud/Ovest)
            popupContent: "<b>Targa Ingresso 2</b>"
        }
    ];

    entrances.forEach(entrance => {
        // Crea il marker con l'icona personalizzata e aggiungilo direttamente alla mappa
        L.marker(entrance.latlng, {
          icon: createEntranceIcon(),
          pane: 'circlePane'
        })  
            .addTo(map)
            .bindPopup(entrance.popupContent); // Rende il marker cliccabile con un popup
    });
}

  // =========================================================================
  // III. FUNZIONI DI GESTIONE MAPPA E POIS
  // =========================================================================
  
  // Funzione che inizializza la mappa
  function initMap(geojsonPois) {

    map = L.map('map', {
      minZoom: 17,
      maxZoom: 20,
      maxBounds: PARK_BOUNDS,
      maxBoundsViscosity: 1.0
    }).setView([45.2286, 11.6574], 17);

    if (geojsonPois.speciesCatalog) {
        geojsonPois.speciesCatalog.forEach(species => {
            // Usa il Nome della specie come chiave
            speciesLookup.set(species.Nome, species);
        });
    }

    // ... (Logica dei Layer e Overlay Pane come prima)
    map.createPane('osmPane');
    map.getPane('osmPane').style.zIndex = 600;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      pane: 'osmPane',
      noWrap: true
    }).addTo(map);

    map.createPane('svgPane');
    map.getPane('svgPane').style.zIndex = 601;

    const imageUrl = 'images/Satellite_2.png';
    const imageBounds = [[45.22854, 11.65642], [45.230548, 11.65925]];
    L.imageOverlay(imageUrl, imageBounds, { opacity: 1, interactive: true, pane: 'svgPane' }).addTo(map);

    map.createPane('circlePane');
    map.getPane('circlePane').style.zIndex = 602;

    markers = L.markerClusterGroup({
      animateAddingMarkers: true,
      disableClusteringAtZoom: 17,
      spiderfyOnMaxZoom: false
    });
    // ... (Logica del Park GeoJSON come prima)
    const parkFeature = geojsonPois.features.find(f => f.geometry.type === "Polygon");
    const pointFeatures = geojsonPois.features.filter(f => f.geometry.type === "Point");

    // 🌳 CORREZIONE CRITICA 1: Popola la featureLookup correttamente
    // Questa riga era errata: pointFeatures = geojsonPois.feature.find(feature => { ... });
    pointFeatures.forEach(feature => {
      featureLookup.set(feature.properties.ID, feature);
    });

    if (parkFeature) {
      const parkCoordinates = parkFeature.geometry.coordinates[0];
      const outerBounds = [[90, -180], [90, 180], [-90, 180], [-90, -180]];

      L.polygon([outerBounds, parkCoordinates], {
        fillColor: '#cecece',
        fillOpacity: 0,
        stroke: false
      }).addTo(map);

      L.geoJSON(parkFeature, {
        style: {
          fillColor: PARK_FILL_COLOR,
          weight: 2,
          opacity: 0,
          color: PARK_BORDER_COLOR,
          dashArray: '3',
          fillOpacity: 0.0
        }
      }).addTo(map);
    }
    
    setupEventListeners(); // Chiama la funzione di setup degli eventi
    setupSidebarAndMarkers(pointFeatures);

    addEntranceMarkers(map);
  }

  function updateCircleSizes() {
    const currentZoom = map.getZoom();
    const zoomDifference = currentZoom - 18;
    markers.eachLayer(function(layer) {
      // Controlla se la proprietà è definita
      if (layer.options.radiusAtZoom18) { 
        const newRadius = layer.options.radiusAtZoom18 * Math.pow(2, zoomDifference);
        layer.setRadius(newRadius);
      }
    });
  }
  
  function setupSidebarAndMarkers(pointFeatures) {
    const treeList = document.getElementById('treeList');
    const speciesMap = new Map();
    
    // 1. Raggruppa i feature per Nome (Specie)
    pointFeatures.forEach(feature => {
      const speciesName = feature.properties.Nome;
      if (!speciesMap.has(speciesName)) {
        speciesMap.set(speciesName, []);
      }
      speciesMap.get(speciesName).push(feature);
    });

    // 2. Ordina i nomi delle specie uniche
    const uniqueSpeciesNames = Array.from(speciesMap.keys()).sort((a, b) => 
      a.localeCompare(b, 'it', { sensitivity: 'base' })
    );

    // 3. Popola il menù laterale
    treeList.innerHTML = ''; 
    uniqueSpeciesNames.forEach(speciesName => {
      const featuresOfSpecies = speciesMap.get(speciesName);
      
      const li = document.createElement('li');
      li.textContent = speciesName;
      
      li.onclick = () => {
        handleSpeciesSelection(speciesName, featuresOfSpecies);
      };
      
      treeList.appendChild(li);
    });
    
    // 4. Crea i Marker
    pointFeatures.forEach(feature => {
      const latlng = [feature.geometry.coordinates[1], feature.geometry.coordinates[0]];
      const treeName = feature.properties.Nome;
      const speciesDetails = speciesLookup.get(treeName);
      const radiusAtZoom18 = (feature.properties.raggio) ? feature.properties.raggio : 8;

      const popupContent = `
        <div class="tree-popup">
          <h3 class="popup-title">${treeName}</h3>
          <button class="open-details-button" data-feature-id="${feature.properties.ID}" data-name="${treeName}">
            Vedi Scheda Completa 🌳
          </button>
        </div>
      `;

      const treeCircle = L.circleMarker(latlng, {
        radius: radiusAtZoom18,
        fillColor: POI_COLOR,
        color: "",
        weight: 1,
        opacity: 1,
        fillOpacity: 0.7,
        pane: 'circlePane'
      });
      
      // *** MODIFICA IMPORTANTE: Memorizza l'ID del feature e il raggio di default ***
      treeCircle.options.radiusAtZoom18 = radiusAtZoom18;
      treeCircle.options.featureId = feature.properties.ID; 

      treeCircle.bindPopup(popupContent, {
        closeButton: false,
        offset: L.point(0, -radiusAtZoom18 - 5)
      });
      
      treeCircle.on('click', function() {
        closeAllUIs(); // Chiude tutto tranne il popup che si sta aprendo
        
        // Evidenzia solo il marker cliccato
        this.setStyle({
            fillColor: HIGHLIGHT_COLOR,
            color: "",
            weight: 3,
        });
        highlightedLayers.push(this); 
        
        this.openPopup();
        // 🌳 Aggiungi un nuovo stato per permettere la chiusura con 'Indietro'
        window.history.pushState(null, '', location.pathname + '#popup');

        // ❌ LOGICA REMOSSA: Il click sul pulsante è gestito dal listener globale in setupEventListeners
      });
      
      markers.addLayer(treeCircle);
    });

    map.on('zoomend', updateCircleSizes);
    map.addLayer(markers);
    updateCircleSizes();
    
    // Logica di chiusura del popup
    map.on('popupclose', function() {
      // 🌳 MODIFICA: Invece di usare back(), rimuovi l'hash manualmente per non uscire se l'hash precedente è vuoto.
      if (location.hash.includes('#popup')) {
        window.history.replaceState(null, '', location.pathname); // Rimuove solo #popup
      }
      unhighlightLayers(); // Pulizia dell'evidenziazione
    });
  }

  // Funzione per gestire la selezione della specie dal menù
function handleSpeciesSelection(speciesName, featuresOfSpecies) {
  closeAllUIs(); 

  const firstFeature = featuresOfSpecies[0]; 
  const latlng = [firstFeature.geometry.coordinates[1], firstFeature.geometry.coordinates[0]];
  
  map.flyTo(latlng, 19); 

  map.once('moveend', () => {
    markers.eachLayer(layer => {
      const isMatch = featuresOfSpecies.some(f => f.properties.ID === layer.options.featureId);

      if (isMatch) {
          layer.setStyle({
              fillColor: HIGHLIGHT_COLOR, // Evidenziazione in Giallo
              color: "",
              weight: 3,
          });
          highlightedLayers.push(layer);
          
          if (featuresOfSpecies.length === 1 && layer.options.featureId === firstFeature.properties.ID) {
               layer.openPopup();
               window.history.pushState(null, '', location.pathname + '#popup');
          }
      }
    });
  });
}

  // =========================================================================
  // IV. FUNZIONI DI GEOLOCALIZZAZIONE (GPS)
  // =========================================================================

 // Funzione chiamata in caso di successo della localizzazione
    function onLocationSuccess(position) {
      const latlng = L.latLng(position.coords.latitude, position.coords.longitude);
      const radius = position.coords.accuracy;
      const gpsButton = document.getElementById('gpsButton');

      // 1. Rimuovi i layer precedenti se esistono
      if (gpsMarker) {
          map.removeLayer(gpsMarker);
      }
      if (accuracyCircle) {
          map.removeLayer(accuracyCircle);
      }

      // 2. Crea Cerchio di accuratezza
      accuracyCircle = L.circle(latlng, {
          radius: radius,
          color: '#1a73e8', // Blu
          fillColor: '#1a73e8',
          fillOpacity: 0.15,
          weight: 1,
      }).addTo(map);

      // 3. Crea Marker della posizione corrente (PULSE/TU SEI QUI)
      gpsMarker = L.circleMarker(latlng, {
          radius: 8,
          color: '#fff',
          weight: 3,
          fillColor: '#1a73e8',
          fillOpacity: 1,
      }).addTo(map)
        // ✨ MODIFICA: Il messaggio richiesto
        .bindPopup("Tu sei qui")
        .openPopup();
      
      // 4. Determina lo zoom ottimale
      let targetZoom = 17;
      if (radius < 20) {
          targetZoom = 18;
      } else if (radius > 100) {
          targetZoom = 16;
      }

      // 5. Centra la mappa (FlyTo)
      map.flyTo(latlng, targetZoom + 3, {
           duration: 1.5,
      });
      
      // 6. Aggiorna lo stato del pulsante dopo la localizzazione
      gpsButton.disabled = false;
      gpsButton.textContent = '◉ Trovato'; // Indica il successo
      gpsButton.style.backgroundColor = '#00aaff'; // Blu

      // Riporta il pulsante allo stato iniziale dopo un timeout
      setTimeout(() => {
          if (gpsButton.textContent === '◉ Trovato') {
              gpsButton.textContent = '⚲';
              gpsButton.style.backgroundColor = '#007800cc'; // Verde base
          }
      }, 3000); 
  }

  // Funzione chiamata in caso di errore della localizzazione
  function onLocationError(error) {
      const gpsButton = document.getElementById('gpsButton');
      gpsButton.disabled = false;
      
      let message = "Errore di localizzazione.";
      
      if (error.code === 1) {
          // Questo è il caso in cui il browser dice "Permesso Negato"
          message = "Accesso alla posizione negato. Concedi i permessi e riprova.";
      } else if (error.code === 3) {
          // Questo è il caso più comune per le richieste consecutive veloci: Timeout
          message = "Timeout: La posizione non è stata trovata in tempo. Riprova tra pochi secondi.";
      }
      // Se l'errore è 2 (posizione non disponibile), il messaggio predefinito va bene.
      
      console.error("Errore di geolocalizzazione:", error.message, "Codice:", error.code);
      alert(message);
      
      // Aggiorna lo stato del pulsante con un errore
      gpsButton.textContent = '⚠ Errore';
      gpsButton.style.backgroundColor = '#ff4500'; // Arancione/Rosso
      
      // Riporta il pulsante allo stato iniziale dopo un timeout
      setTimeout(() => {
          if (gpsButton.textContent === '⚠ Errore') {
              gpsButton.textContent = '⚲';
              gpsButton.style.backgroundColor = '#007800cc';
          }
      }, 3000); 
  }
  
  // Nuova funzione per richiedere la posizione una sola volta
  function getOneTimeLocation() {
      closeAllUIs();
      const gpsButton = document.getElementById('gpsButton');

      // ⭐ 1. Controllo di sicurezza (come discusso nell'errore precedente)
      if (!navigator.geolocation) {
          alert("Il tuo browser non supporta la geolocalizzazione o non stai utilizzando HTTPS/localhost.");
          gpsButton.disabled = true;
          gpsButton.textContent = '❌ GPS Non Disp.'; 
          gpsButton.style.backgroundColor = '#666'; 
          return; 
      }
      
      // 2. Aggiorna lo stato del pulsante
      gpsButton.disabled = true; 
      gpsButton.textContent = 'GPS...';
      gpsButton.style.backgroundColor = '#ffc107'; // Giallo per "In Cerca"

      // ⭐ 3. Chiama getCurrentPosition (localizzazione singola)
      navigator.geolocation.getCurrentPosition(
          onLocationSuccess, 
          onLocationError, 
          LOCATION_OPTIONS
      );
  }
  // =========================================================================
  // V. INIZIALIZZAZIONE E GESTIONE EVENTI (Listeners)
  // =========================================================================

  function setupEventListeners() {
      const menuButton = document.getElementById('menuButton');
      const treeListMenu = document.getElementById('treeListMenu');
      const treeOverlay = document.getElementById('treeOverlay');
      const infoButton = document.getElementById('infoButton');
      const infoOverlay = document.getElementById('infoOverlay');
      const gpsButton = document.getElementById('gpsButton');
      if (gpsButton) {
          gpsButton.addEventListener('click', getOneTimeLocation);
      }
      
      // 🌳 CORREZIONE: Gestore click tollerante (cerca per ID oppure per Nome)
      document.addEventListener('click', function(e) {
        // Cerca il pulsante anche se si clicca sul testo o sull'icona al suo interno
        const btn = e.target.closest('.open-details-button');
        
        if (btn) {
            e.preventDefault(); 
            
            // Legge i dati dal pulsante trovato
            const rawId = btn.dataset.featureId || btn.dataset.id;
            const rawName = btn.dataset.name || btn.dataset.featureName;
            
            let feature = null;
            const parsedId = parseInt(rawId, 10);

            if (!isNaN(parsedId)) {
                feature = featureLookup.get(parsedId);
            }

            if (!feature && rawName && geojsonPois) {
                feature = geojsonPois.features.find(f => 
                    f.properties.Nome && f.properties.Nome.trim().toLowerCase() === rawName.trim().toLowerCase()
                );
            }
            
            if (feature) {
                if (map) map.closePopup();
                if (location.hash.includes('#popup')) {
                    window.history.replaceState(null, '', location.pathname);
                }
                
                unhighlightLayers(); 
                openTreeOverlay(feature); 
            } else {
                console.error('Feature non trovata con ID/Nome:', rawId, rawName);
            }
        }
      });

      // Listener Menu
      menuButton.addEventListener('click', () => {
          if (treeListMenu.classList.contains('open')) {
              closeMenu();
              // 🌳 MODIFICA: Rimuovi l'hash manualmente, non usare back() per non uscire
              if (location.hash.includes('#menu-open')) {
                   window.history.replaceState(null, '', location.pathname);
              }
          } else {
              openMenu();
          }
      });

      // Listener Info Overlay
      infoButton.addEventListener('click', openInfoOverlay);
      document.querySelector('#infoOverlay .close-button').addEventListener('click', () => {
          closeInfoOverlay();
          // 🌳 MODIFICA: Rimuovi l'hash manualmente, non usare back() per non uscire
          if (location.hash.includes('#info')) window.history.replaceState(null, '', location.pathname);
      });
      infoOverlay.addEventListener('click', e => {
        if (e.target === infoOverlay) {
            closeInfoOverlay();
            // 🌳 MODIFICA: Rimuovi l'hash manualmente, non usare back() per non uscire
            if (location.hash.includes('#info')) window.history.replaceState(null, '', location.pathname);
        }
      });

      // Listener Tree Overlay
      document.querySelector('#treeOverlay .close-button').addEventListener('click', () => {
          closeOverlay();
          // 🌳 MODIFICA: Rimuovi l'hash manualmente, non usare back() per non uscire
          if (location.hash.includes('#overlay')) window.history.replaceState(null, '', location.pathname);
      });
      treeOverlay.addEventListener('click', e => {
        if (e.target === treeOverlay) {
            closeOverlay();
            // 🌳 MODIFICA: Rimuovi l'hash manualmente, non usare back() per non uscire
            if (location.hash.includes('#overlay')) window.history.replaceState(null, '', location.pathname);
        }
      });

      // Listener per l'Overlay di Uscita
      const exitPrompt = document.getElementById('exitPrompt');
      exitPrompt.addEventListener('click', e => {
          // Controlla se il click è sullo sfondo (non sul contenuto)
          if (e.target.id === 'exitPrompt' || !e.target.closest('.overlay-content')) {
              closeExitPrompt();
          }
      });
      
      // Listener per chiudere il menu cliccando sulla mappa
      map.on('click', () => {
          if (treeListMenu.classList.contains('open')) {
              closeMenu();
              // 🌳 MODIFICA: Rimuovi l'hash manualmente, non usare back() per non uscire
              if (location.hash.includes('#menu-open')) {
                   window.history.replaceState(null, '', location.pathname);
              }
          }
      });
  }

// --- Funzione di caricamento principale ---
  const GOOGLE_SHEETS_API_URL = 'https://script.google.com/macros/s/AKfycbyE3x580LAoEijjIb9RXNGiLEBfFDlh4nOJUBE18GLU2RL8ZDeRjA1ugarLsPPWhVs/exec';

  window.onload = function() {
    fetch(GOOGLE_SHEETS_API_URL)
      .then(res => res.json())
      .then(sheetData => {

        const cfg = sheetData.config || {};

        // --- Colori configurabili dal foglio Google "Config" ---
        // Chiave nel foglio -> cosa controlla
        if (cfg.ColoreFinestre) {
          document.documentElement.style.setProperty('--overlay-bg-color', cfg.ColoreFinestre);
        }
        if (cfg.ColoreTesto) {
          document.documentElement.style.setProperty('--text-color', cfg.ColoreTesto);
        }
        if (cfg.ColoreBottoni) {
          document.documentElement.style.setProperty('--button-bg-color', cfg.ColoreBottoni);
        }
        if (cfg.ColoreTitoloPopup) {
          document.documentElement.style.setProperty('--popup-title-color', cfg.ColoreTitoloPopup);
        }
        if (cfg.ColorePOI) {
          POI_COLOR = cfg.ColorePOI;
        }
        if (cfg.ColoreEvidenziazione) {
          HIGHLIGHT_COLOR = cfg.ColoreEvidenziazione;
        }
        if (cfg.ColoreParco) {
          PARK_FILL_COLOR = cfg.ColoreParco;
        }
        if (cfg.ColoreBordoParco) {
          PARK_BORDER_COLOR = cfg.ColoreBordoParco;
        }

        window.infoPanelConfig = cfg;

        geojsonPois = {
          "type": "FeatureCollection",
          "speciesCatalog": sheetData.speciesCatalog || [],
          "features": (sheetData.poiList || [])
            .filter(poi => !isNaN(poi.lat) && !isNaN(poi.lng) && poi.lat !== 0 && poi.lng !== 0)
            .map(poi => ({
              "type": "Feature",
              "properties": {
                "ID": Number(poi.id),
                "Nome": poi.name,
                "raggio": Number(poi.radius)
              },
              "geometry": {
                "type": "Point",
                "coordinates": [poi.lng, poi.lat]
              }
            }))
        };

        initMap(geojsonPois);

        // Apre automaticamente la scheda "Info" al primo caricamento della mappa,
        // ma solo se non si tratta di una navigazione con stato già presente (es. link diretto a un popup).
        // Configurabile dal foglio Google: valorizzare "ApriInfoAllAvvio" a "no" per disattivare.
        const autoOpenInfo = !cfg.ApriInfoAllAvvio || cfg.ApriInfoAllAvvio.toString().toLowerCase() !== 'no';
        if (autoOpenInfo && location.hash.length === 0) {
          openInfoOverlay();
        }
      })
      .catch(err => {
        console.error("Errore nel caricamento da Sheets:", err);
        showLoadError();
      });
  };

  // Mostra un messaggio visibile all'utente se il caricamento dei dati fallisce
  function showLoadError() {
    const banner = document.createElement('div');
    banner.id = 'loadErrorBanner';
    banner.style.cssText = 'position:fixed;top:0;left:0;width:100%;padding:14px;' +
      'background:#c62828;color:#fff;text-align:center;z-index:20000;' +
      'font-family:sans-serif;box-shadow:0 2px 8px rgba(0,0,0,0.3);';
    banner.textContent = 'Impossibile caricare i dati della mappa. Controlla la connessione e ricarica la pagina.';
    document.body.appendChild(banner);
  }

// --- Gestione della Cronologia (Tasto 'Indietro') CORRETTA e COMPLETA ---
window.onpopstate = () => {
    // Variabili di stato aggiornate
    const isTreeOverlayVisible = document.getElementById('treeOverlay').classList.contains('visible');
    const isInfoOverlayVisible = document.getElementById('infoOverlay').classList.contains('visible');
    const isMenuOpen = document.getElementById('treeListMenu').classList.contains('open');
    const exitPrompt = document.getElementById('exitPrompt');
    const isExitPromptVisible = exitPrompt.classList.contains('visible');
    const isPopupOpen = map && map.getContainer().querySelector('.leaflet-popup-pane .leaflet-popup');
    
    // Condizione di "stato pulito" (nessun elemento UI aperto)
    const isCleanState = !isTreeOverlayVisible && !isInfoOverlayVisible && !isMenuOpen && !isPopupOpen;

    // =====================================================================
    // 1. GESTIONE STATO #EXIT (Priorità Assoluta)
    // =====================================================================
    
    if (isExitPromptVisible && location.hash !== '#exit') {
        // Chiude l'interfaccia visiva
        closeExitPrompt(); 
        // NON mettere 'return', lascia che il browser completi la navigazione (uscita dall'app).
        return; 
    }

    // Se l'hash attuale è #exit E il prompt non è ancora visibile (dopo la prima pressione),
    // significa che dobbiamo renderlo visibile.
    if (location.hash === '#exit' && !isExitPromptVisible) {
        showExitPrompt();
        return; 
    }
    // =====================================================================
    // 2. CHIUSURA DEGLI ELEMENTI UI NORMALI (Ordine inverso di apertura)
    // =====================================================================

    // Chiudi il Menu (hash rimosso, elemento ancora aperto)
    if (isMenuOpen && location.hash !== '#menu-open') {
        closeMenu();
        return; 
    }
    // Chiudi l'Overlay Dettaglio Albero
    if (isTreeOverlayVisible && location.hash !== '#overlay') {
        closeOverlay();
        return; 
    }
    // Chiudi l'Overlay Info
    if (isInfoOverlayVisible && location.hash !== '#info') {
        closeInfoOverlay();
        return;
    }
    // Chiudi il Popup Marker
    if (isPopupOpen && location.hash !== '#popup') {
        map.closePopup();
        unhighlightLayers();
        return;
    }
    
    // =====================================================================
    // 3. INNESCO DEL PROMPT DI USCITA (Stato pulito -> Aggiungi #exit)
    // =====================================================================

      if (isCleanState && !isExitPromptVisible) {
        // Siamo in uno stato pulito e l'hash è stato rimosso (o non c'era).
        
        // 🌳 Correzione: Prima aggiungiamo l'hash fittizio, poi mostriamo il prompt.
        window.history.pushState({ exit: true }, '', location.pathname + '#exit'); 
        showExitPrompt();
        
        return; 
    }
    
    // =====================================================================
    // 4. PULIZIA FINALE (Rimuovi hash residui se siamo tornati a stato pulito)
    // =====================================================================
    if (location.hash.length > 0 && isCleanState && !isExitPromptVisible) {
         window.history.replaceState(null, '', location.pathname);
    }
};
})();
