// IIFE (Immediately Invoked Function Expression) per incapsulare la logica e prevenire variabili globali
(function() {
  
  // =========================================================================
  // I. VARIABILI PRIVATE E COSTANTI
  // =========================================================================
  let map;
  let markers; // MarkerClusterGroup
  
  // Variabili GPS
  let watchId = null;
  let gpsMarker = null;
  let accuracyCircle = null;
  let isInitialCenter = false; // Flag per il primo centraggio
  
  // Variabili Interfaccia
  let highlightedLayers = [];
  const HIGHLIGHT_COLOR = '#ffcc00'; // Colore Giallo/Arancio per evidenziare
  const PARK_BOUNDS = L.latLngBounds([[45.228, 11.654], [45.232, 11.660]]);
  const LOCATION_OPTIONS = {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0,
  };

  let exitPromptTimer = null;

  // =========================================================================
  // II. FUNZIONI DI GESTIONE UI (Menu, Overlay, Info)
  // =========================================================================

  function unhighlightLayers() {
    // Colore originale del cerchio: "#238210" (Verde Scuro)
    highlightedLayers.forEach(layer => {
      layer.setStyle({
          fillColor: "#238210",
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
    document.getElementById('treeContent').scrollTop = 0;
    const treeDetails = document.getElementById('treeDetails');
    treeDetails.innerHTML = '';

    const title = document.createElement('h2');
    title.textContent = feature.properties.Nome;
    treeDetails.appendChild(title);

    const description = document.createElement('p');
    description.innerHTML = '<b>Nome Scientifico:</b> ' + feature.properties.Descrizione;
    treeDetails.appendChild(description);

    const treeHistory = document.createElement('p');
    treeHistory.innerHTML = feature.properties.Storia || '';
    treeDetails.appendChild(treeHistory);

    const imageContainer = document.createElement('div');
    imageContainer.id = 'treeImageContainer';

    if (feature.properties.image && feature.properties.image.length > 0) {
      feature.properties.image.forEach(imgUrl => {
        const img = document.createElement('img');
        img.src = imgUrl;
        img.alt = feature.properties.Nome;
        imageContainer.appendChild(img);
      });
    }

    treeDetails.appendChild(imageContainer);
    document.getElementById('treeOverlay').classList.add('visible');
    
    // 🌳 CORREZIONE: Usa pushState per creare un punto nella cronologia che può essere annullato
    if (location.hash.includes('#overlay')) {
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
    // Chiude qualsiasi altra interfaccia aperta
    closeMenu();
    document.getElementById('treeOverlay').classList.remove('visible');
    if (map) map.closePopup();
    unhighlightLayers(); 
    
    // 🌳 CORREZIONE: Usa pushState se l'hash è pulito per non uscire subito
    if (location.hash.length === 0 || location.hash === '#exit') {
        window.history.pushState(null, '', location.pathname + '#info');
    } else {
        // Se c'è già un hash (menu, popup, overlay), sostituiscilo con #info
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
      treeListMenu.style.transform = 'translateX(100%)';
  }

  // Funzione per aprire il menu
  function openMenu() {
    closeInfoOverlay();
    document.getElementById('treeOverlay').classList.remove('visible');
    if (map) map.closePopup();
    unhighlightLayers();

    const treeListMenu = document.getElementById('treeListMenu');
    treeListMenu.style.transform = 'translateX(0)';
    
    // Aggiunto: Quando il menu è aperto, aggiungi uno stato alla cronologia del browser.
    if (!location.hash.includes('#menu-open')) {
        window.history.pushState({ menuOpen: true }, '', '#menu-open');
    } else {
        window.history.replaceState({ menuOpen: true }, '', '#menu-open');
    }

    // Funzione per mostrare il prompt d'uscita
  function showExitPrompt() {
    document.getElementById('exitPrompt').classList.add('visible');
    // Avvia un timer per chiudere il prompt se l'utente non fa nulla
    exitPromptTimer = setTimeout(closeExitPrompt, 3000); 
  }

  // Funzione per chiudere il prompt d'uscita
  function closeExitPrompt() {
    document.getElementById('exitPrompt').classList.remove('visible');
    if (exitPromptTimer) {
      clearTimeout(exitPromptTimer);
      exitPromptTimer = null;
    }
  }
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
          fillColor: '#3c9629',
          weight: 2,
          opacity: 0,
          color: '#255c19',
          dashArray: '3',
          fillOpacity: 0.0
        }
      }).addTo(map);
    }
    
    setupEventListeners(); // Chiama la funzione di setup degli eventi
    setupSidebarAndMarkers(pointFeatures);
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
      const radiusAtZoom18 = feature.properties.raggio || 8;
      const treeName = feature.properties.Nome;
      
      const popupContent = `
        <div class="tree-popup">
          <h3 class="popup-title">${treeName}</h3>
          <button class="open-details-button" data-feature-id="${feature.id}">
            Vedi Scheda Completa 🌳
          </button>
        </div>
      `;

      const treeCircle = L.circleMarker(latlng, {
        radius: radiusAtZoom18,
        fillColor: "#238210",
        color: "",
        weight: 1,
        opacity: 1,
        fillOpacity: 0.7,
        pane: 'circlePane'
      });
      
      // *** MODIFICA IMPORTANTE: Memorizza l'ID del feature e il raggio di default ***
      treeCircle.options.radiusAtZoom18 = radiusAtZoom18;
      treeCircle.options.featureId = feature.id; 

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
        window.history.replaceState(null, '', location.pathname + '#popup');

        setTimeout(() => {
            // Usa l'ID del feature per trovare il pulsante corretto nel popup
            const openButton = document.querySelector(`.open-details-button[data-feature-id="${feature.id}"]`);
            if (openButton) {
                openButton.onclick = () => {
                    this.closePopup();
                    unhighlightLayers(); 
                    openTreeOverlay(feature); 
                };
            }
        }, 50); 
      });
      
      markers.addLayer(treeCircle);
    });

    map.on('zoomend', updateCircleSizes);
    map.addLayer(markers);
    updateCircleSizes();
    
    // Logica di chiusura del popup
    map.on('popupclose', function() {
      if (location.hash.includes('#popup')) {
        window.history.replaceState(null, '', location.pathname);
      }
      unhighlightLayers(); // Pulizia dell'evidenziazione
    });
  }

  // Funzione per gestire la selezione della specie dal menù (AGGIORNATA con featureId)
  function handleSpeciesSelection(speciesName, featuresOfSpecies) {
    closeAllUIs(); 

    const firstFeature = featuresOfSpecies[0]; 
    const latlng = [firstFeature.geometry.coordinates[1], firstFeature.geometry.coordinates[0]];
    
    map.flyTo(latlng, 19); 

    map.once('moveend', () => {
      markers.eachLayer(layer => {
        // Usa l'ID del feature per l'abbinamento efficiente
        const isMatch = featuresOfSpecies.some(f => f.id === layer.options.featureId);

        if (isMatch) {
            layer.setStyle({
                fillColor: HIGHLIGHT_COLOR,
                color: "",
                weight: 3,
            });
            highlightedLayers.push(layer);
            
            // Se c'è un solo albero, apri il popup automaticamente per comodità
            if (featuresOfSpecies.length === 1 && layer.options.featureId === firstFeature.id) {
                 layer.openPopup();
                
                 setTimeout(() => {
                    const openButton = document.querySelector(`.open-details-button[data-feature-id="${firstFeature.id}"]`);
                    if (openButton) {
                        openButton.onclick = () => {
                            layer.closePopup();
                            unhighlightLayers(); 
                            openTreeOverlay(firstFeature); 
                        };
                    }
                }, 50);
            }
        }
      });
    });
  }

  // =========================================================================
  // IV. FUNZIONI DI GEOLOCALIZZAZIONE (GPS)
  // =========================================================================

  function onLocationSuccess(e) {
    const latlng = e.latlng;
    const radius = e.accuracy / 2;
    
    // Rimuovi i layer precedenti se esistono
    if (gpsMarker) {
        map.removeLayer(gpsMarker);
    }
    if (accuracyCircle) {
        map.removeLayer(accuracyCircle);
    }

    // Cerchio di accuratezza
    accuracyCircle = L.circle(latlng, radius, {
        color: '#1a73e8', // Blu
        fillColor: '#1a73e8',
        fillOpacity: 0.15,
        weight: 1,
        isGpsMarker: true 
    }).addTo(map);

    // Marker della posizione corrente
    gpsMarker = L.circleMarker(latlng, {
        radius: 8,
        color: '#fff',
        weight: 3,
        fillColor: '#1a73e8',
        fillOpacity: 1,
        isGpsMarker: true 
    }).addTo(map)
      .bindPopup("Sei qui, precisione: " + radius.toFixed(0) + " metri.");
    
    // FlyTo solo al primo fix
    if (isInitialCenter) {
        const bounds = accuracyCircle.getBounds();
        map.fitBounds(bounds, { maxZoom: 18, padding: [50, 50] });
        isInitialCenter = false;
        
        document.getElementById('gpsButton').disabled = false;
        document.getElementById('gpsButton').textContent = '◉ GPS Attivo';
        document.getElementById('gpsButton').style.backgroundColor = '#00aaff';
    }
  }

  function onLocationError(e) {
    console.error("Errore di geolocalizzazione:", e.message);
    stopTracking(); 
    alert("Impossibile trovare la tua posizione. Assicurati che il GPS sia attivo e di aver concesso i permessi.");
  }
  
  function reCenterMap() {
      if (gpsMarker) {
          closeAllUIs();
          map.flyTo(gpsMarker.getLatLng(), map.getZoom() > 18 ? map.getZoom() : 18, {
               duration: 1.5
          });
          
          const gpsButton = document.getElementById('gpsButton');
          gpsButton.textContent = '◉ Centrato';
          setTimeout(() => {
              if (watchId !== null) {
                   gpsButton.textContent = '◉ GPS Attivo';
              }
          }, 800);
          
      } else if (watchId !== null) {
          alert('Attendi il primo fix di posizione.');
      }
  }

  function startTracking() {
      closeAllUIs();
      isInitialCenter = true; 
      
      watchId = navigator.geolocation.watchPosition(onLocationSuccess, onLocationError, LOCATION_OPTIONS);
      
      const gpsButton = document.getElementById('gpsButton');
      gpsButton.disabled = true;
      gpsButton.textContent = 'GPS...';
  }

  function stopTracking() {
      if (watchId !== null) {
          navigator.geolocation.clearWatch(watchId);
          watchId = null;
      }

      isInitialCenter = false;

      if (gpsMarker) {
          map.removeLayer(gpsMarker);
          gpsMarker = null;
      }
      if (accuracyCircle) {
          map.removeLayer(accuracyCircle);
          accuracyCircle = null;
      }
      
      const gpsButton = document.getElementById('gpsButton');
      gpsButton.disabled = false;
      gpsButton.textContent = '⚲';
      gpsButton.style.backgroundColor = '#007800cc';
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
      
      // Listener Menu
      menuButton.addEventListener('click', () => {
          if (treeListMenu.style.transform === 'translateX(0px)') {
              closeMenu();
          } else {
              openMenu();
          }
      });
      
      // Listener Info Overlay
      infoButton.addEventListener('click', openInfoOverlay);
      document.querySelector('#infoOverlay .close-button').addEventListener('click', closeInfoOverlay);
      infoOverlay.addEventListener('click', e => {
        if (e.target === infoOverlay) closeInfoOverlay();
      });

      // Listener Tree Overlay
      document.querySelector('#treeOverlay .close-button').addEventListener('click', closeOverlay);
      treeOverlay.addEventListener('click', e => {
        if (e.target === treeOverlay) closeOverlay();
      });

      // Listener per l'Overlay di Uscita
      const exitPrompt = document.getElementById('exitPrompt');
      exitPrompt.addEventListener('click', e => {
          if (e.target.id === 'exitPrompt' || e.target.classList.contains('overlay-content') === false) {
              closeExitPrompt();
              // Quando l'utente annulla, dobbiamo rimuovere lo stato fittizio dall'history.
              window.history.replaceState(null, '', location.pathname); 
          }
      });
      
      // Listener GPS Button (Start/Recenter)
      if (gpsButton) {
          gpsButton.addEventListener('click', () => {
              if (watchId === null) {
                  startTracking();
              } else {
                  reCenterMap();
              }
          });
      }
      
      // Listener per chiudere il menu cliccando sulla mappa
      map.on('click', closeMenu);

      // Collega i gestori di eventi per la localizzazione (i vecchi erano in initMap)
      map.on('locationfound', onLocationSuccess);
      map.on('locationerror', onLocationError);
  }


  // --- Funzione di caricamento principale ---
  window.onload = function() {
    fetch('data/pois.json')
      .then(response => response.json())
      .then(geojsonPois => {
        initMap(geojsonPois);
      })
      .catch(err => console.error("Errore nel caricamento di pois.json:", err));
  };

// --- Gestione della Cronologia (Tasto 'Indietro') CORRETTA e COMPLETA ---
  window.onpopstate = () => {
      // Variabili di stato aggiornate
      const isTreeOverlayVisible = document.getElementById('treeOverlay').classList.contains('visible');
      const isInfoOverlayVisible = document.getElementById('infoOverlay') ? document.getElementById('infoOverlay').classList.contains('visible') : false;
      const isMenuOpen = document.getElementById('treeListMenu').style.transform === 'translateX(0px)';
      const isExitPromptVisible = document.getElementById('exitPrompt').classList.contains('visible');

      // Se l'hash attuale è '#exit', significa che l'utente ha premuto Indietro quando il prompt era già visibile.
      // In questo caso, lasciamo che il browser esca.
      if (location.hash === '#exit' && isExitPromptVisible) {
          return; 
      }
      
      // 1. GESTIONE CHIUSURA ELEMENTI (Menu, Overlay, Popup)
      // Se l'hash non corrisponde più a un elemento aperto, chiudilo.

      if (isMenuOpen && location.hash !== '#menu-open') {
          closeMenu();
      }
      if (isTreeOverlayVisible && location.hash !== '#overlay') {
          closeOverlay();
      }
      if (isInfoOverlayVisible && location.hash !== '#info') {
          closeInfoOverlay();
      }
      if (map && map.getContainer().querySelector('.leaflet-popup-pane') && location.hash !== '#popup') {
          map.closePopup();
          unhighlightLayers(); 
      }
      
      // 2. GESTIONE USCITA (Quando tutti gli elementi sono chiusi)
      // Se l'utente preme "Indietro" quando non ci sono elementi aperti E non c'è più lo stato #exit nell'hash,
      // significa che siamo tornati allo stato iniziale pulito (es. location.pathname).
      
      const isCleanState = !isTreeOverlayVisible && !isInfoOverlayVisible && !isMenuOpen && !location.hash.includes('#popup');
      
      if (isCleanState) {
          
          if (isExitPromptVisible) {
             // Caso B: L'utente ha premuto 'Indietro' e il prompt era visibile, 
             // ma l'hash è stato rimosso (ad esempio, è rimasto solo location.pathname).
             // Non facciamo nulla, lasciamo che il browser prosegua l'uscita (la chiusura del prompt è gestita dalla logica pushState/replaceState successiva).
             return;
          } else {
             // Caso A: Siamo in uno stato pulito (tutto chiuso) e l'utente preme "Indietro".
             // Mostra il prompt e aggiungi lo stato fittizio.
             showExitPrompt();
             window.history.pushState({ exit: true }, '', location.pathname + '#exit');
             return; 
          }
      }

      // 3. PULIZIA FINALE
      // Se un elemento è stato appena chiuso (es. da #info a #), pulisci l'URL.
      const isAnythingOpen = isTreeOverlayVisible || isInfoOverlayVisible || isMenuOpen || location.hash.includes('#popup');
      
      if (!isAnythingOpen && location.hash.length > 0) {
          window.history.replaceState(null, '', location.pathname);
      }
      
      // Se l'hash è `#exit` ma il prompt è nascosto (ad esempio, l'utente ha cliccato fuori), pulisci l'hash.
      if (location.hash === '#exit' && !isExitPromptVisible) {
          window.history.replaceState(null, '', location.pathname);
      }
  };
})();
